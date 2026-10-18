import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../server.js';

test('payment API rejects non-deterministic or incomplete saga requests', async () => {
  const app = buildApp({ internalSecret: 'synthetic-internal-test-secret' });
  const response = await app.inject({ method: 'POST', url: '/v1/payment-sagas', headers: { authorization: 'Bearer synthetic-internal-test-secret' }, payload: { sessionId: 'missing' } });
  assert.equal(response.statusCode, 400);
  await app.close();
});
