import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../server.js';

test('private Session routes reject forged identity without a bearer secret', async t => {
  const pool = { query() { throw new Error('unauthorized request touched the database'); } };
  const app = buildApp({ pool, internalSecret: 'synthetic-internal-test-secret' });
  t.after(() => app.close());
  const response = await app.inject({ url: '/v1/tables/SAGE-12', headers: { 'x-participant-id': 'spoof', 'x-restaurant-id': 'spoof' } });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json().error.code, 'INTERNAL_AUTH_REQUIRED');
});
