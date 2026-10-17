import assert from 'node:assert/strict';

// F0 uses the legacy read route, which may create the SAGE-12 session/cart.
// Replace with the side-effect-free table registry route when P1 lands.
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
  const session = await get('/v1/table-sessions/SAGE-12');
  assert.equal(session.runtime, 'services');
  assert.equal(session.tableCode, 'SAGE-12');
  assert.match(session.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.ok(Array.isArray(session.participants));
  assert.ok(Array.isArray(session.items));
  assert.ok(Number.isInteger(session.subtotal) && session.subtotal >= 0);
  const repeated = await get('/v1/table-sessions/SAGE-12');
  assert.equal(repeated.id, session.id, 'repeated reads must retain the session identity');
  console.log('Service smoke passed: persisted Session/Order read through the gateway.');
} catch (error) {
  console.error(`Service smoke failed: ${error.message}`);
  process.exitCode = 1;
}
