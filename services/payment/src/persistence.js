import { randomUUID, createHash } from 'node:crypto';
import { runSplitPaymentSaga } from './saga.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (statusCode, code, message) => { throw Object.assign(new Error(message), { statusCode, code }); };
const legacyRupees = minor => Math.ceil(minor / 100);

export function createPaymentStore({ pool, allowTestOutcomes = false }) {
  async function sagaView(db, id) {
    const row = (await db.query('SELECT * FROM saga_state WHERE id=$1', [id])).rows[0];
    if (!row) return null;
    const intents = (await db.query(`SELECT id AS "intentId",participant_id AS "participantId",amount_minor AS "amountMinor",outcome,status
      FROM payment_intents WHERE saga_id=$1 ORDER BY created_at,id`, [id])).rows;
    return { id: row.id, checkoutId: row.checkout_id, sessionId: row.session_id, status: row.status,
      total: { amountMinor: row.total_amount_minor, currency: row.currency }, simulated: true, intents };
  }
  async function getByCheckout(checkoutId) {
    if (!uuid.test(checkoutId)) fail(400, 'INVALID_CHECKOUT_ID', 'A valid checkout ID is required');
    const row = (await pool.query('SELECT id FROM saga_state WHERE checkout_id=$1', [checkoutId])).rows[0];
    return row ? sagaView(pool, row.id) : null;
  }
  async function persistSaga({ checkoutId, sessionId, idempotencyKey, payments }) {
    if (!uuid.test(checkoutId) || !uuid.test(sessionId) || idempotencyKey !== checkoutId || !Array.isArray(payments) || !payments.length ||
      payments.some(p => !uuid.test(p?.participantId) || !Number.isSafeInteger(p.amountMinor) || p.amountMinor <= 0 ||
        !(allowTestOutcomes ? ['success', 'failure', 'timeout'] : ['success']).includes(p.outcome)) ||
      new Set(payments.map(p => p.participantId)).size !== payments.length) fail(400, 'INVALID_PAYMENT', 'Checkout ID and deterministic minor-unit payments are required');
    const canonical = payments.map(p => ({ participantId: p.participantId, amountMinor: p.amountMinor, outcome: p.outcome })).sort((a, b) => a.participantId.localeCompare(b.participantId));
    const total = canonical.reduce((sum, p) => sum + p.amountMinor, 0);
    if (!Number.isSafeInteger(total) || total > 2147483647) fail(400, 'INVALID_PAYMENT_TOTAL', 'Payment total exceeds supported minor-unit range');
    const fingerprint = createHash('sha256').update(JSON.stringify({ checkoutId, sessionId, payments: canonical })).digest('hex');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [checkoutId]);
      const previous = (await client.query('SELECT id,payload_fingerprint FROM saga_state WHERE checkout_id=$1::uuid OR idempotency_key=$1::text', [checkoutId])).rows[0];
      if (previous) {
        if (previous.payload_fingerprint !== fingerprint) fail(409, 'PAYMENT_KEY_CONFLICT', 'Payment key cannot change its payload');
        const saga = await sagaView(client, previous.id);
        await client.query('COMMIT');
        return { replayed: true, saga };
      }
      const result = await runSplitPaymentSaga({ sagaId: randomUUID(), payments: canonical.map(p => ({ ...p, amount: p.amountMinor })) });
      const feeMinor = Math.ceil(total / 100);
      await client.query(`INSERT INTO saga_state(id,idempotency_key,session_id,status,total_amount,platform_fee,completed_at,
        total_amount_minor,platform_fee_minor,currency,checkout_id,payload_fingerprint)
        VALUES($1,$2,$3,$4,$5,$6,now(),$7,$8,'INR',$9,$10)`,
      [result.sagaId, checkoutId, sessionId, result.status, legacyRupees(total), legacyRupees(feeMinor), total, feeMinor, checkoutId, fingerprint]);
      for (const attempt of result.attempts) {
        const refunded = result.compensations.some(c => c.intentId === attempt.intentId);
        const outcome = canonical.find(p => p.participantId === attempt.participantId).outcome;
        await client.query(`INSERT INTO payment_intents(id,saga_id,participant_id,amount,amount_minor,outcome,status) VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [attempt.intentId, result.sagaId, attempt.participantId, legacyRupees(attempt.amount), attempt.amount, outcome, refunded ? 'REFUNDED' : attempt.states.at(-1)]);
        await client.query('INSERT INTO payment_attempts(intent_id,provider,state_history) VALUES($1,$2,$3)', [attempt.intentId, 'mock', JSON.stringify(attempt.states)]);
      }
      await client.query('INSERT INTO platform_fee_ledger(saga_id,amount,amount_minor,status) VALUES($1,$2,$3,$4)',
        [result.sagaId, legacyRupees(feeMinor), feeMinor, result.status === 'COMMITTED' ? 'RECORDED' : 'VOIDED']);
      for (const event of result.events) {
        const committed = event.type === 'payment.saga_committed.v1';
        const envelope = { id: randomUUID(), version: committed ? 2 : 1, occurredAt: new Date().toISOString(), correlationId: checkoutId,
          type: committed ? 'payment.saga_committed.v2' : event.type,
          data: committed ? { checkoutId, sagaId: result.sagaId, sessionId, totalAmountMinor: total, currency: 'INR' } : { ...event.data, sessionId } };
        await client.query('INSERT INTO payment_outbox(id,envelope) VALUES($1,$2)', [envelope.id, envelope]);
      }
      const saga = await sagaView(client, result.sagaId);
      await client.query('COMMIT');
      return { replayed: false, saga };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  return { persistSaga, getByCheckout };
}
