import { randomUUID } from 'node:crypto';
const statuses = ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'];
const fail = (statusCode, code, message) => { throw Object.assign(new Error(message), { statusCode, code }); };
export function createKitchen({ pool, orderView }) {
  async function listOrders(restaurantId) {
    const rows = (await pool.query('SELECT id FROM consolidated_orders WHERE restaurant_id=$1 AND checkout_id IS NOT NULL ORDER BY created_at DESC LIMIT 100', [restaurantId])).rows;
    return Promise.all(rows.map(row => orderView(row.id)));
  }
  async function advanceOrder({ orderId, restaurantId, status }) {
    if (!statuses.includes(status)) fail(400, 'INVALID_ORDER_STATUS', 'Unknown kitchen status');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const row = (await client.query('SELECT * FROM consolidated_orders WHERE id=$1 FOR UPDATE', [orderId])).rows[0];
      if (!row) fail(404, 'ORDER_NOT_FOUND', 'Order not found');
      if (row.restaurant_id !== restaurantId) fail(403, 'RESTAURANT_SCOPE_MISMATCH', 'Order belongs to another restaurant');
      if (status !== row.status && statuses.indexOf(status) !== statuses.indexOf(row.status) + 1) fail(409, 'INVALID_ORDER_TRANSITION', 'Orders advance one step at a time');
      if (status !== row.status) await client.query('UPDATE consolidated_orders SET status=$2 WHERE id=$1', [orderId, status]);
      await client.query('COMMIT');
      return orderView(orderId);
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function sealSession(sessionId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO carts(id,session_id) VALUES($1,$2) ON CONFLICT(session_id) DO NOTHING', [randomUUID(), sessionId]);
      const cart = (await client.query('SELECT * FROM carts WHERE session_id=$1 FOR UPDATE', [sessionId])).rows[0];
      const pending = (await client.query("SELECT id FROM checkouts WHERE session_id=$1 AND (status='PENDING' OR (status='COMMITTED' AND order_id IS NULL)) LIMIT 1", [sessionId])).rowCount;
      const unfinished = (await client.query("SELECT id FROM consolidated_orders WHERE session_id=$1 AND status <> 'SERVED' LIMIT 1", [sessionId])).rowCount;
      if (pending || unfinished) fail(409, 'UNFINISHED_ORDERS', 'Finish pending payments and serve orders before closing');
      await client.query('UPDATE carts SET sealed=true WHERE id=$1', [cart.id]);
      await client.query('COMMIT');
      return { sealed: true };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async function unsealSession(sessionId) { await pool.query('UPDATE carts SET sealed=false WHERE session_id=$1', [sessionId]); return { sealed: false }; }
  return { listOrders, advanceOrder, sealSession, unsealSession };
}
