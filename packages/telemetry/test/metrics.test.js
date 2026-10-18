import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerTelemetry, registerHealth, registerActiveSessions } from '../src/index.js';

test('requests use bounded route labels and exclude probes; registries are isolated', async () => {
  const app = Fastify();
  const registry = registerTelemetry(app, { service: 'session' });
  registerHealth(app, { checkDependencies: async () => true });
  app.get('/tables/:code', () => ({ ok: true }));
  app.get('/broken', (_request, reply) => reply.code(503).send());
  for (const url of ['/tables/A', '/tables/B', '/broken', '/unknown/A', '/unknown/B', '/livez', '/readyz']) await app.inject(url);
  const metrics = (await app.inject('/metrics')).body;
  assert.match(metrics, /service="session",method="GET",route="\/tables\/:code",status_class="2xx"} 2/);
  assert.match(metrics, /route="unmatched",status_class="4xx"} 2/);
  assert.match(metrics, /route="\/broken",status_class="5xx"} 1/);
  assert.doesNotMatch(metrics, /route="\/(metrics|livez|readyz)"/);
  assert.doesNotMatch(metrics, /unknown\/|tables\/A/);
  const counter = await registry.getSingleMetric('tablesync_http_requests_total').get();
  assert.deepEqual(Object.keys(counter.values[0].labels).sort(), ['method', 'route', 'service', 'status_class']);
  const other = Fastify();
  registerTelemetry(other, { service: 'session' });
  assert.doesNotMatch((await other.inject('/metrics')).body, /route="\/tables/);
  await app.close(); await other.close();
});

test('liveness survives dependency failure; readiness times out and recovers', async () => {
  let healthy = false;
  const app = Fastify();
  registerHealth(app, { checkDependencies: () => healthy ? true : new Promise(() => {}), timeoutMs: 50 });
  const started = Date.now();
  assert.equal((await app.inject('/readyz')).statusCode, 503);
  assert.ok(Date.now() - started < 500);
  assert.equal((await app.inject('/livez')).statusCode, 200);
  healthy = true;
  assert.equal((await app.inject('/readyz')).statusCode, 200);
  await app.close();
});

test('active sessions omit failed or stale samples instead of retaining old counts', async () => {
  let fail = false, time = 1000;
  const app = Fastify();
  const registry = registerTelemetry(app, { service: 'session' });
  const refresh = registerActiveSessions(app, { registry, now: () => time, count: async () => {
    if (fail) throw new Error('DB unavailable');
    return 0;
  } });
  await refresh();
  assert.match((await app.inject('/metrics')).body, /tablesync_active_seating_sessions 0/);
  time += 46000;
  assert.doesNotMatch((await app.inject('/metrics')).body, /\ntablesync_active_seating_sessions /);
  fail = true; await refresh();
  const metrics = (await app.inject('/metrics')).body;
  assert.match(metrics, /tablesync_active_seating_sessions_available 0/);
  assert.doesNotMatch(metrics, /\ntablesync_active_seating_sessions /);
  await app.close();
});
