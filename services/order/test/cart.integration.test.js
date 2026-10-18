import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { testDatabase } from '../../../scripts/test-database.mjs';
import { createRegistry } from '../../session/src/registry.js';
import { createCartStore } from '../src/cart.js';

async function setup(t) {
  const { pool } = await testDatabase(t);
  const registry = createRegistry({ pool });
  const guest = await registry.joinTable({ code: 'SAGE-12', name: 'Maya', joinKey: randomUUID() });
  return { pool, registry, guest, store: createCartStore({ pool, sessionClient: registry.getSession }),
    input: { sessionId: guest.table.session.id, participantId: guest.participant.id, menuItemId: 'paneer', quantity: 2, expectedRevision: 0 } };
}

test('empty reads do not create carts; lost-response retries do not increment quantities', async t => {
  const { store, pool, input } = await setup(t);
  assert.equal((await store.readCart(input.sessionId)).revision, 0);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM carts')).rows[0].count, 0);
  const result = await store.setQuantity(input);
  assert.deepEqual(result.total, { amountMinor: 68000, currency: 'INR' });
  assert.equal(result.revision, 1);
  await assert.rejects(store.setQuantity(input), { statusCode: 409 });
  assert.equal((await store.readCart(input.sessionId)).items[0].quantity, 2);
  assert.equal((await store.readCart(input.sessionId)).items[0].unitPriceMinor, 34000);
});

test('quantity, membership, and frozen/sealed session checks precede mutations', async t => {
  const { store, pool, input } = await setup(t);
  for (const quantity of [0, 21, 1.5]) await assert.rejects(store.setQuantity({ ...input, quantity }), { statusCode: 400 });
  await assert.rejects(store.setQuantity({ ...input, participantId: randomUUID() }), { statusCode: 403 });
  await store.setQuantity(input);
  await pool.query("UPDATE carts SET state='PENDING'");
  await assert.rejects(store.setQuantity({ ...input, expectedRevision: 1 }), { statusCode: 409 });
  await pool.query("UPDATE carts SET state='EDITING',sealed=true");
  await assert.rejects(store.setQuantity({ ...input, expectedRevision: 1 }), { statusCode: 409 });
});

test('one guest cannot remove another guest line', async t => {
  const { store, registry, input } = await setup(t);
  await store.setQuantity(input);
  const other = await registry.joinTable({ code: 'SAGE-12', name: 'Noor', joinKey: randomUUID() });
  await store.removeItem({ ...input, participantId: other.participant.id, expectedRevision: 1 });
  assert.equal((await store.readCart(input.sessionId)).items[0].ownerId, input.participantId);
  const empty = await store.removeItem({ ...input, expectedRevision: 1 });
  assert.equal(empty.items.length, 0);
  assert.equal(empty.total.amountMinor, 0);
});
