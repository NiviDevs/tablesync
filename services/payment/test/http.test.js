import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../server.js';

test('payment API rejects non-deterministic or incomplete saga requests', async () => {
  const app = buildApp();
  const response = await app.inject({ method: 'POST', url: '/v1/payment-sagas', payload: { sessionId: 'missing' } });
  assert.equal(response.statusCode, 400);
  await app.close();
});
