import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { createRegistry } from '../src/registry.js';
import { createCartStore } from '../../order/src/cart.js';
import { createKitchen } from '../../order/src/kitchen.js';
import { createCheckoutStore } from '../../order/src/checkout.js';

test('closure seals cart writes, survives uncertain reply, and preserves the old seating', async t => {
  const { pool } = await testDatabase(t);
  const kitchen = createKitchen({ pool });
  let drop = true;
  const registry = createRegistry({ pool, orderClient: { async sealSession(id) {
    await kitchen.sealSession(id);
    if (drop) { drop = false; throw new Error('injected lost seal reply'); }
  } } });
  const joined = await registry.joinTable({ code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() });
  const sessionId = joined.table.session.id;
  const input = { sessionId, restaurantId: joined.table.restaurantId };
  await assert.rejects(registry.closeSession(input), { statusCode: 503 });
  assert.equal((await registry.getSession(sessionId)).session.status, 'CLOSING');
  const cart = createCartStore({ pool, sessionClient: registry.getSession });
  await assert.rejects(cart.setQuantity({ sessionId, participantId: joined.participant.id, menuItemId: 'paneer', quantity: 1, expectedRevision: 0 }), { statusCode: 409 });
  await registry.closeSession(input);
  await registry.closeSession(input);
  assert.equal((await registry.getSession(sessionId)).session.status, 'CLOSED');
  const next = await registry.joinTable({ code: 'SAGE-12', name: 'Noor', joinKey: randomUUID() });
  assert.notEqual(next.table.session.id, sessionId);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM table_sessions')).rows[0].count, 2);
});

test('unfinished-order conflict restores OPEN without deleting the seating', async t => {
  const { pool } = await testDatabase(t);
  const registry = createRegistry({ pool, orderClient: { async sealSession() { throw Object.assign(new Error('unfinished order'), { statusCode: 409 }); } } });
  const joined = await registry.joinTable({ code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() });
  await assert.rejects(registry.closeSession({ sessionId: joined.table.session.id, restaurantId: joined.table.restaurantId }), { statusCode: 409 });
  assert.equal((await registry.getSession(joined.table.session.id)).session.status, 'OPEN');
});

test('closure blocks cart and checkout requests that already read OPEN', async t => {
  const { pool } = await testDatabase(t);
  const kitchen = createKitchen({ pool });
  const registry = createRegistry({ pool, orderClient: kitchen });
  const joined = await registry.joinTable({ code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() });
  const sessionId = joined.table.session.id;
  const input = { sessionId, participantId: joined.participant.id, menuItemId: 'paneer', quantity: 1, expectedRevision: 0 };
  await createCartStore({ pool, sessionClient: registry.getSession }).setQuantity(input);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let arrived = 0;
  let ready;
  const bothRead = new Promise(resolve => { ready = resolve; });
  const sessionClient = async id => {
    const table = await registry.getSession(id);
    if (++arrived === 2) ready();
    await gate;
    return table;
  };
  const cart = createCartStore({ pool, sessionClient });
  const checkout = createCheckoutStore({ pool, sessionClient, paymentClient: {} });
  const writes = Promise.all([
    assert.rejects(cart.setQuantity({ ...input, quantity: 2, expectedRevision: 1 }), { statusCode: 409 }),
    assert.rejects(checkout.createCheckout({ ...input, expectedRevision: 1, operationKey: randomUUID() }), { statusCode: 409 }),
  ]);
  await bothRead;
  try { await registry.closeSession({ sessionId, restaurantId: joined.table.restaurantId }); }
  finally { release(); }
  await writes;
  assert.equal((await registry.getSession(sessionId)).session.status, 'CLOSED');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM checkouts')).rows[0].count, 0);
  assert.equal((await pool.query('SELECT quantity FROM cart_items')).rows[0].quantity, 1);
});
