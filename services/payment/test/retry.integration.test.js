import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { createRegistry } from '../../session/src/registry.js';
import { createPaymentStore } from '../src/persistence.js';
import { createOutbox } from '../src/outbox.js';

test('concurrent Payment retries persist one saga and reject changed payloads', async t => {
  const { pool } = await testDatabase(t);
  const guest = await createRegistry({ pool }).joinTable({ code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() });
  const store = createPaymentStore({ pool });
  const checkoutId = randomUUID();
  const input = { checkoutId, idempotencyKey: checkoutId, sessionId: guest.table.session.id,
    payments: [{ participantId: guest.participant.id, amountMinor: 34000, outcome: 'success' }] };
  const results = await Promise.all([store.persistSaga(input), store.persistSaga(input)]);
  assert.equal(results[0].saga.id, results[1].saga.id);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM saga_state')).rows[0].count, 1);
  await assert.rejects(store.persistSaga({ ...input, payments: [{ ...input.payments[0], amountMinor: 1 }] }), { statusCode: 409 });
});

test('a crash after broker confirmation retries the stored event ID', async t => {
  const { pool } = await testDatabase(t);
  const guest = await createRegistry({ pool }).joinTable({ code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() });
  const checkoutId = randomUUID();
  await createPaymentStore({ pool }).persistSaga({ checkoutId, idempotencyKey: checkoutId, sessionId: guest.table.session.id,
    payments: [{ participantId: guest.participant.id, amountMinor: 34000, outcome: 'success' }] });
  const published = [];
  const channel = { publish(_exchange, _type, bytes) { published.push(JSON.parse(bytes)); }, async waitForConfirms() {} };
  const crashing = createOutbox({ pool, getChannel: () => channel, afterConfirm() { throw new Error('injected crash'); } });
  await assert.rejects(crashing.flushOutbox(), /injected crash/);
  await createOutbox({ pool, getChannel: () => channel }).flushOutbox();
  assert.equal(published[0].id, published[1].id);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM payment_outbox WHERE published_at IS NULL')).rows[0].count, 0);
});

test('failed multi-payer simulation persists compensation and no committed event', async t => {
  const { pool } = await testDatabase(t);
  const registry = createRegistry({ pool });
  const a = await registry.joinTable({ code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() });
  const b = await registry.joinTable({ code: 'SAGE-12', name: 'Noor', joinKey: randomUUID() });
  const ids = [a.participant.id, b.participant.id].sort();
  const checkoutId = randomUUID();
  const result = await createPaymentStore({ pool, allowTestOutcomes: true }).persistSaga({ checkoutId, idempotencyKey: checkoutId,
    sessionId: a.table.session.id, payments: ids.map((id, i) => ({ participantId: id, amountMinor: 34000, outcome: i ? 'failure' : 'success' })) });
  assert.equal(result.saga.status, 'FAILED');
  assert.deepEqual(result.saga.intents.map(i => i.status).sort(), ['FAILED', 'REFUNDED']);
  assert.equal((await pool.query('SELECT status FROM platform_fee_ledger')).rows[0].status, 'VOIDED');
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM payment_outbox WHERE envelope->>'type'='payment.saga_committed.v2'")).rows[0].count, 0);
});
