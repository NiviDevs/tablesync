import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { createRegistry } from '../../session/src/registry.js';
import { createCartStore } from '../src/cart.js';
import { createCheckoutStore } from '../src/checkout.js';
import { createPaymentStore } from '../../payment/src/persistence.js';
import { createOutbox } from '../src/outbox.js';

async function setup(t, { lostReply = false, failFirst = false } = {}) {
  const { pool } = await testDatabase(t);
  const registry = createRegistry({ pool });
  const guest = await registry.joinTable({ code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() });
  const cart = createCartStore({ pool, sessionClient: registry.getSession });
  await cart.setQuantity({ sessionId: guest.table.session.id, participantId: guest.participant.id, menuItemId: 'paneer', quantity: 2, expectedRevision: 0 });
  const payment = createPaymentStore({ pool, allowTestOutcomes: true });
  let first = true;
  const paymentClient = { getByCheckout: payment.getByCheckout, async persistSaga(input) {
    const result = await payment.persistSaga(failFirst && first ? { ...input, payments: input.payments.map(p => ({ ...p, outcome: 'failure' })) } : input);
    const drop = lostReply && first; first = false;
    if (drop) throw new Error('injected lost HTTP reply');
    return result.saga;
  } };
  const store = createCheckoutStore({ pool, sessionClient: registry.getSession, paymentClient });
  return { pool, store, cart, guest, input: { sessionId: guest.table.session.id, participantId: guest.participant.id, expectedRevision: 1, operationKey: randomUUID() } };
}

test('competing operation keys freeze one snapshot, saga, and order with immutable prices', async t => {
  const { pool, store, cart, input } = await setup(t);
  const [a, b] = await Promise.all([store.createCheckout(input), store.createCheckout({ ...input, operationKey: randomUUID() })]);
  assert.equal(a.id, b.id);
  await assert.rejects(cart.setQuantity({ ...input, menuItemId: 'paneer', quantity: 3 }), { statusCode: 409 });
  await assert.rejects(store.createCheckout({ ...input, expectedRevision: 2 }), { statusCode: 409 });
  await pool.query("UPDATE menu_items SET unit_price_minor=1 WHERE id='paneer'");
  const event = (await pool.query("SELECT envelope FROM payment_outbox WHERE envelope->>'type'='payment.saga_committed.v2'")).rows[0].envelope;
  await store.projectCommittedPayment(event);
  await store.projectCommittedPayment(event);
  await store.projectCommittedPayment({ ...event, id: randomUUID() });
  for (const table of ['checkouts', 'saga_state', 'consolidated_orders']) {
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 1);
  }
  const view = await store.getCheckout(a.id);
  assert.ok(view.orderId);
  assert.equal((await pool.query('SELECT total_amount_minor FROM consolidated_orders')).rows[0].total_amount_minor, 68000);
  const published = [];
  const channel = { publish(_exchange, _type, bytes) { published.push(JSON.parse(bytes)); }, async waitForConfirms() {} };
  await assert.rejects(createOutbox({ pool, getChannel: () => channel, afterConfirm() { throw new Error('injected Order crash'); } }).flushOutbox(), /injected Order crash/);
  await createOutbox({ pool, getChannel: () => channel }).flushOutbox();
  assert.equal(published[0].id, published[1].id);
});

test('lost reply after Payment commit reconciles without another charge', async t => {
  const { pool, store, input } = await setup(t, { lostReply: true });
  const pending = await store.createCheckout(input);
  assert.equal(pending.status, 'PENDING');
  await store.reconcilePending();
  assert.equal((await store.getCheckout(pending.id)).status, 'COMMITTED');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM saga_state')).rows[0].count, 1);
});

test('terminal failed attempt creates no order and explicit retry preserves its audit row', async t => {
  const { pool, store, input } = await setup(t, { failFirst: true });
  const failed = await store.createCheckout(input);
  assert.equal(failed.status, 'FAILED');
  const retry = await store.retryCheckout({ id: failed.id, operationKey: randomUUID() });
  assert.notEqual(retry.id, failed.id);
  const events = (await pool.query("SELECT envelope FROM payment_outbox WHERE envelope->>'type'='payment.saga_committed.v2'")).rows;
  assert.equal(events.length, 1);
  await store.projectCommittedPayment(events[0].envelope);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM checkouts')).rows[0].count, 2);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM consolidated_orders')).rows[0].count, 1);
});
