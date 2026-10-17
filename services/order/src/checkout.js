import { randomUUID } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (statusCode, code, message) => { throw Object.assign(new Error(message), { statusCode, code }); };
const permanent = message => Object.assign(new Error(message), { permanent: true });
function checkoutView(row) {
  return { id: row.id, sessionId: row.session_id, status: row.status, paymentSagaId: row.payment_saga_id,
    orderId: row.order_id, total: { amountMinor: row.total_amount_minor, currency: row.currency }, simulated: true };
}
export function isCommittedPaymentEvent(event) {
  return event?.version === 2 && event.type === 'payment.saga_committed.v2' && uuid.test(event.id) && uuid.test(event.correlationId) &&
    uuid.test(event.data?.checkoutId) && uuid.test(event.data?.sagaId) && uuid.test(event.data?.sessionId) &&
    Number.isSafeInteger(event.data?.totalAmountMinor) && event.data.totalAmountMinor > 0 && event.data.currency === 'INR';
}

export function createCheckoutStore({ pool, sessionClient, paymentClient }) {
  async function getCheckout(id) {
    if (!uuid.test(id)) fail(400, 'INVALID_CHECKOUT_ID', 'A valid checkout ID is required');
    const row = (await pool.query('SELECT * FROM checkouts WHERE id=$1', [id])).rows[0];
    if (!row) fail(404, 'CHECKOUT_NOT_FOUND', 'Checkout not found');
    return checkoutView(row);
  }
  async function reconcileOne(id) {
    const row = (await pool.query('SELECT * FROM checkouts WHERE id=$1', [id])).rows[0];
    if (!row || row.status !== 'PENDING') return;
    try {
      let saga = await paymentClient.getByCheckout(id);
      if (!saga) {
        const lines = (await pool.query('SELECT owner_id,sum(quantity*unit_price_minor)::int AS amount FROM checkout_lines WHERE checkout_id=$1 GROUP BY owner_id ORDER BY owner_id', [id])).rows;
        saga = await paymentClient.persistSaga({ checkoutId: id, sessionId: row.session_id, idempotencyKey: id,
          payments: lines.map(line => ({ participantId: line.owner_id, amountMinor: line.amount, outcome: 'success' })) });
      }
      if (saga.checkoutId !== id || saga.sessionId !== row.session_id || saga.total.amountMinor !== row.total_amount_minor || saga.total.currency !== row.currency) {
        throw new Error('Payment outcome does not match the frozen snapshot');
      }
      if (!['COMMITTED', 'FAILED'].includes(saga.status)) return;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const changed = await client.query("UPDATE checkouts SET status=$2,payment_saga_id=$3 WHERE id=$1 AND status='PENDING' RETURNING id", [id, saga.status, saga.id]);
        if (changed.rowCount) await client.query('UPDATE carts SET state=$2 WHERE session_id=$1 AND revision=$3', [row.session_id, saga.status, row.revision]);
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } catch {
      // An uncertain transport or unmatched outcome cannot unlock the cart.
      // The bounded background pass resolves the same checkout identity later.
    }
  }
  async function createCheckout({ sessionId, participantId, operationKey, expectedRevision, retryOf = null }) {
    if (!uuid.test(operationKey) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) fail(400, 'INVALID_CHECKOUT', 'UUID operationKey and expectedRevision are required');
    const table = await sessionClient(sessionId);
    if (!table.session?.participants.some(p => p.id === participantId)) fail(403, 'GUEST_NOT_MEMBER', 'Participant is not a member of this seating');
    if (table.session.status !== 'OPEN') fail(409, 'SESSION_NOT_OPEN', 'This seating is no longer open');
    const client = await pool.connect();
    let id;
    let replayed = false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [operationKey]);
      const previous = (await client.query('SELECT * FROM checkouts WHERE operation_key=$1', [operationKey])).rows[0];
      if (previous) {
        if (previous.session_id !== sessionId || previous.participant_id !== participantId || previous.revision !== expectedRevision || previous.retry_of !== retryOf) fail(409, 'CHECKOUT_KEY_CONFLICT', 'Operation key cannot change its payload');
        id = previous.id; replayed = true;
      } else {
        const cart = (await client.query('SELECT * FROM carts WHERE session_id=$1 FOR UPDATE', [sessionId])).rows[0];
        if (!cart || cart.revision !== expectedRevision) fail(409, 'STALE_CART', 'Cart changed; refresh before checkout');
        if (cart.sealed) fail(409, 'SESSION_SEALED', 'This seating is closing');
        const active = (await client.query("SELECT id FROM checkouts WHERE session_id=$1 AND revision=$2 AND status <> 'FAILED'", [sessionId, expectedRevision])).rows[0];
        if (active) { id = active.id; replayed = true; }
        else {
          if ((!retryOf && cart.state !== 'EDITING') || (retryOf && cart.state !== 'FAILED')) fail(409, 'CART_FROZEN', 'Cart is not editable for this attempt');
          const original = retryOf ? (await client.query('SELECT * FROM checkouts WHERE id=$1', [retryOf])).rows[0] : null;
          if (retryOf && (!original || original.status !== 'FAILED' || original.session_id !== sessionId)) fail(409, 'RETRY_NOT_ALLOWED', 'Only a terminal failed attempt can be retried');
          const lines = original ? (await client.query('SELECT cart_line_id AS id,owner_id,menu_item_id,item_name,quantity,unit_price_minor,emoji FROM checkout_lines WHERE checkout_id=$1 ORDER BY id', [retryOf])).rows :
            (await client.query('SELECT * FROM cart_items WHERE cart_id=$1 ORDER BY created_at,id', [cart.id])).rows;
          const total = lines.reduce((sum, line) => sum + line.quantity * line.unit_price_minor, 0);
          if (!total || !Number.isSafeInteger(total) || total > 2147483647) fail(400, 'INVALID_CHECKOUT_TOTAL', 'Add items within the supported total before checkout');
          id = randomUUID();
          await client.query(`INSERT INTO checkouts(id,session_id,participant_id,restaurant_id,table_code,operation_key,revision,total_amount_minor,currency,retry_of)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,'INR',$9)`, [id, sessionId, participantId, table.restaurantId, table.code, operationKey, expectedRevision, total, retryOf]);
          for (const line of lines) await client.query(`INSERT INTO checkout_lines(id,checkout_id,cart_line_id,owner_id,menu_item_id,item_name,quantity,unit_price_minor,emoji)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), id, line.id, line.owner_id, line.menu_item_id, line.item_name, line.quantity, line.unit_price_minor, line.emoji]);
          await client.query("UPDATE carts SET state='PENDING' WHERE id=$1", [cart.id]);
        }
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    await reconcileOne(id);
    return { ...await getCheckout(id), replayed };
  }
  async function retryCheckout({ id, operationKey }) {
    const original = (await pool.query('SELECT * FROM checkouts WHERE id=$1', [id])).rows[0];
    if (!original) fail(404, 'CHECKOUT_NOT_FOUND', 'Checkout not found');
    const existingRetry = (await pool.query('SELECT id FROM checkouts WHERE operation_key=$1 AND retry_of=$2', [operationKey, id])).rows[0];
    if (original.status !== 'FAILED' && !existingRetry) fail(409, 'RETRY_NOT_ALLOWED', 'Checkout is not terminally failed');
    return createCheckout({ sessionId: original.session_id, participantId: original.participant_id,
      operationKey, expectedRevision: original.revision, retryOf: id });
  }
  async function reconcilePending() {
    const pending = await pool.query("SELECT id FROM checkouts WHERE status='PENDING' ORDER BY created_at LIMIT 20");
    for (const row of pending.rows) await reconcileOne(row.id);
  }
  async function orderView(db, id) {
    const row = (await db.query('SELECT * FROM consolidated_orders WHERE id=$1 AND checkout_id IS NOT NULL', [id])).rows[0];
    if (!row) return null;
    const items = (await db.query(`SELECT id,owner_id AS "ownerId",menu_item_id AS "menuItemId",item_name AS name,quantity,unit_price_minor AS "unitPriceMinor"
      FROM consolidated_order_items WHERE order_id=$1 ORDER BY created_at,id`, [id])).rows;
    return { id, sessionId: row.session_id, restaurantId: row.restaurant_id, tableCode: row.table_code, status: row.status, items,
      total: { amountMinor: row.total_amount_minor, currency: row.currency }, createdAt: new Date(row.created_at).toISOString() };
  }
  async function projectCommittedPayment(event) {
    if (!isCommittedPaymentEvent(event)) throw permanent('Malformed committed payment v2 event');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const snapshot = (await client.query('SELECT * FROM checkouts WHERE id=$1 FOR UPDATE', [event.data.checkoutId])).rows[0];
      if (!snapshot || snapshot.session_id !== event.data.sessionId || snapshot.total_amount_minor !== event.data.totalAmountMinor || snapshot.currency !== event.data.currency ||
        snapshot.status === 'FAILED' || (snapshot.payment_saga_id && snapshot.payment_saga_id !== event.data.sagaId)) throw permanent('Committed payment does not match checkout snapshot');
      const consumed = await client.query('INSERT INTO order_consumed_events(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id', [event.id]);
      if (snapshot.order_id || !consumed.rowCount) { await client.query('COMMIT'); return snapshot.order_id ? orderView(pool, snapshot.order_id) : null; }
      const lines = (await client.query('SELECT * FROM checkout_lines WHERE checkout_id=$1 ORDER BY id', [snapshot.id])).rows;
      const orderId = randomUUID();
      await client.query(`INSERT INTO consolidated_orders(id,payment_saga_id,session_id,restaurant_name,table_name,status,total_amount,total_amount_minor,currency,checkout_id,restaurant_id,table_code)
        VALUES($1,$2,$3,'Juniper House',$4,'CONFIRMED',$5,$6,'INR',$7,$8,$9)`,
      [orderId, event.data.sagaId, snapshot.session_id, snapshot.table_code, Math.ceil(snapshot.total_amount_minor / 100), snapshot.total_amount_minor, snapshot.id, snapshot.restaurant_id, snapshot.table_code]);
      for (const line of lines) await client.query(`INSERT INTO consolidated_order_items(id,order_id,menu_item_id,item_name,unit_price,emoji,quantity,unit_price_minor,owner_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), orderId, line.menu_item_id, line.item_name, Math.ceil(line.unit_price_minor / 100), line.emoji, line.quantity, line.unit_price_minor, line.owner_id]);
      const envelope = { id: randomUUID(), type: 'order.confirmed.v2', version: 2, occurredAt: new Date().toISOString(), correlationId: snapshot.id,
        data: { orderId, checkoutId: snapshot.id, sessionId: snapshot.session_id, restaurantId: snapshot.restaurant_id,
          tableCode: snapshot.table_code, totalAmountMinor: snapshot.total_amount_minor, currency: snapshot.currency } };
      await client.query('INSERT INTO order_outbox(id,event_type,correlation_id,payload,envelope) VALUES($1,$2,$3,$4,$5)', [envelope.id, envelope.type, envelope.correlationId, envelope.data, envelope]);
      await client.query("UPDATE checkouts SET status='COMMITTED',payment_saga_id=$2,order_id=$3 WHERE id=$1", [snapshot.id, event.data.sagaId, orderId]);
      await client.query("UPDATE carts SET state='COMMITTED' WHERE session_id=$1", [snapshot.session_id]);
      await client.query('COMMIT');
      return orderView(pool, orderId);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  return { createCheckout, getCheckout, retryCheckout, reconcilePending, projectCommittedPayment, orderView: id => orderView(pool, id) };
}
