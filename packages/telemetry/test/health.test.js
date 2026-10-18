import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { trackBroker } from '../src/index.js';
import { buildApp as session } from '../../../services/session/server.js';
import { buildApp as order } from '../../../services/order/server.js';
import { buildApp as payment } from '../../../services/payment/server.js';
import { buildApp as gateway } from '../../../services/api-gateway/server.js';

for (const [name, buildApp] of Object.entries({ session, order, payment, gateway })) {
  test(`${name}: readiness fails and recovers without restarting live process`, async t => {
    let healthy = true;
    const app = buildApp({ runtime: 'services', internalSecret: 'test-internal', auth: {},
      pool: { query: async () => ({ rows: [{ count: '0' }] }) },
      checkDependencies: async () => { if (!healthy) throw new Error('DB down'); return true; } });
    t.after(() => app.close());
    assert.equal((await app.inject('/readyz')).statusCode, 200);
    healthy = false;
    assert.equal((await app.inject('/readyz')).statusCode, 503);
    assert.equal((await app.inject('/livez')).statusCode, 200);
    healthy = true;
    assert.equal((await app.inject('/readyz')).statusCode, 200);
  });
}

test('broker readiness follows connection and channel lifecycle', () => {
  for (const event of ['close', 'error']) for (const target of [0, 1]) {
    const sources = [new EventEmitter(), new EventEmitter()];
    const ready = trackBroker(...sources);
    assert.equal(ready(), true);
    sources[target].emit(event, new Error('closed'));
    assert.equal(ready(), false);
  }
});
