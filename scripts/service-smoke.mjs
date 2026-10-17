import assert from 'node:assert/strict';

// P1 registry reads are side-effect-free, including for unknown table codes.
const base = new URL(process.env.GATEWAY_URL ?? 'http://localhost:8080');
assert.ok(['http:', 'https:'].includes(base.protocol), 'GATEWAY_URL must use HTTP(S)');

async function get(path) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, `${path} must return 200`);
  return response.json();
}

try {
  const health = await get('/health');
  assert.equal(health.service, 'api-gateway');
  assert.equal(health.status, 'ok');
  assert.equal(health.runtime, 'services', 'smoke requires the persisted service runtime');
  const table = await get('/v1/tables/SAGE-12');
  assert.equal(table.code, 'SAGE-12');
  assert.match(table.restaurantId, /^[0-9a-f-]{36}$/i);
  if (table.session) {
    assert.match(table.session.id, /^[0-9a-f-]{36}$/i);
    assert.ok(['OPEN', 'CLOSING'].includes(table.session.status));
    assert.ok(Array.isArray(table.session.participants));
  }
  const repeated = await get('/v1/tables/SAGE-12');
  assert.equal(repeated.session?.id, table.session?.id, 'repeated reads must retain the seating identity');
  console.log('Service smoke passed: persisted side-effect-free table read through the gateway.');
} catch (error) {
  console.error(`Service smoke failed: ${error.message}`);
  process.exitCode = 1;
}
