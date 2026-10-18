import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { createRegistry } from '../../session/src/registry.js';
import { createCartStore } from '../src/cart.js';
import { createCheckoutStore } from '../src/checkout.js';
import { createPaymentStore } from '../../payment/src/persistence.js';
import { createKitchen } from '../src/kitchen.js';

test('kitchen transitions are scoped, sequential, and repeatable; sealing waits for served orders', async t => {
  const { pool } = await testDatabase(t);
  const registry = createRegistry({ pool });
  const joined = await registry.joinTable({ code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() });
  const sessionId = joined.table.session.id;
  const cart = createCartStore({ pool, sessionClient: registry.getSession });
  await cart.setQuantity({ sessionId, participantId: joined.participant.id, menuItemId: 'paneer', quantity: 1, expectedRevision: 0 });
  const payment = createPaymentStore({ pool });
  const checkout = createCheckoutStore({ pool, sessionClient: registry.getSession, paymentClient: {
    getByCheckout: payment.getByCheckout, persistSaga: async input => (await payment.persistSaga(input)).saga,
  } });
  await checkout.createCheckout({ sessionId, participantId: joined.participant.id, expectedRevision: 1, operationKey: randomUUID() });
  const kitchen = createKitchen({ pool, orderView: checkout.orderView });
  await assert.rejects(kitchen.sealSession(sessionId), { statusCode: 409 });
  const event = (await pool.query("SELECT envelope FROM payment_outbox WHERE envelope->>'type'='payment.saga_committed.v2'")).rows[0].envelope;
  const order = await checkout.projectCommittedPayment(event);
  const input = { orderId: order.id, restaurantId: joined.table.restaurantId };
  await assert.rejects(kitchen.advanceOrder({ ...input, status: 'READY' }), { statusCode: 409 });
  await assert.rejects(kitchen.advanceOrder({ ...input, restaurantId: randomUUID(), status: 'PREPARING' }), { statusCode: 403 });
  await assert.rejects(kitchen.sealSession(sessionId), { statusCode: 409 });
  for (const status of ['PREPARING', 'READY', 'SERVED']) {
    assert.equal((await kitchen.advanceOrder({ ...input, status })).status, status);
    assert.equal((await kitchen.advanceOrder({ ...input, status })).status, status);
  }
  await assert.rejects(kitchen.advanceOrder({ ...input, status: 'READY' }), { statusCode: 409 });
  await kitchen.sealSession(sessionId);
  await kitchen.sealSession(sessionId);
  assert.equal((await pool.query('SELECT sealed FROM carts WHERE session_id=$1', [sessionId])).rows[0].sealed, true);
});
