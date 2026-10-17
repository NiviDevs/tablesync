import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAuth } from '../src/auth.js';
import { buildApp } from '../server.js';

test('cart routes derive owner from guest token and reject forged price/owner fields', async t => {
  const auth = createAuth({ guestSecret: 'synthetic-guest-test-secret-over-32-bytes' });
  const identity = { participantId: randomUUID(), sessionId: randomUUID() };
  const token = await auth.issueGuest(identity);
  const table = { restaurantId: randomUUID(), session: { id: identity.sessionId, status: 'OPEN', participants: [{ id: identity.participantId, name: 'Maya' }] } };
  const calls = [];
  const app = buildApp({ runtime: 'services', auth, internalSecret: 'synthetic-private-secret', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify(String(url).includes('/sessions/id/') ? table : { revision: 1 }));
  } });
  t.after(() => app.close());
  const url = `/v1/sessions/${identity.sessionId}/cart/items/paneer`;
  const headers = { authorization: `Bearer ${token}`, 'x-participant-id': randomUUID() };
  for (const forged of [{ ownerId: randomUUID() }, { unitPriceMinor: 1 }]) {
    assert.equal((await app.inject({ method: 'PUT', url, headers, payload: { quantity: 2, expectedRevision: 0, ...forged } })).statusCode, 400);
  }
  assert.equal((await app.inject({ method: 'PUT', url, headers, payload: { quantity: 2, expectedRevision: 0 } })).statusCode, 200);
  assert.equal(calls.at(-1).options.headers['x-participant-id'], identity.participantId);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { quantity: 2, expectedRevision: 0 });
  assert.equal((await app.inject({ url: `/v1/sessions/${randomUUID()}/cart`, headers })).statusCode, 403);
});
