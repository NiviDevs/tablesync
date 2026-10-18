import { randomUUID } from 'node:crypto';
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

const probes = new Set(['/metrics', '/health', '/livez', '/readyz']);
const bounded = (operation, timeoutMs) => {
  let timer;
  return Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Dependency deadline exceeded')), timeoutMs);
  })]).finally(() => clearTimeout(timer));
};

export const fastifyOptions = {
  bodyLimit: 16 * 1024,
  genReqId: () => randomUUID(),
  logger: {
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie',
      'req.headers.x-internal-key', 'body', 'guestToken', 'phone', 'email'],
    serializers: { req: request => ({ method: request.method, hostname: request.hostname, remoteAddress: request.ip }) },
  },
};

export function registerTelemetry(app, { service, registry = new Registry() }) {
  const labels = ['service', 'method', 'route', 'status_class'];
  const requests = new Counter({ name: 'tablesync_http_requests_total', help: 'Completed business HTTP requests', labelNames: labels, registers: [registry] });
  const duration = new Histogram({ name: 'tablesync_http_request_duration_seconds', help: 'Business HTTP request duration in seconds',
    labelNames: labels, buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5], registers: [registry] });
  app.addHook('onRequest', async request => { request.telemetryStart = process.hrtime.bigint(); });
  app.addHook('onResponse', async (request, reply) => {
    if (probes.has(request.url.split('?')[0])) return;
    const values = { service, method: request.method, route: request.routeOptions?.url ?? 'unmatched', status_class: `${Math.floor(reply.statusCode / 100)}xx` };
    requests.inc(values);
    duration.observe(values, Number(process.hrtime.bigint() - request.telemetryStart) / 1e9);
  });
  app.get('/metrics', async (_request, reply) => reply.type(registry.contentType).send(await registry.metrics()));
  return registry;
}

export function registerHealth(app, { checkDependencies, timeoutMs = 1000 }) {
  app.get('/livez', async () => ({ status: 'ok' }));
  app.get('/readyz', async (_request, reply) => {
    try {
      if (await bounded(checkDependencies, timeoutMs) === false) throw new Error('Dependency unavailable');
      return { status: 'ready' };
    } catch { return reply.code(503).send({ status: 'unavailable' }); }
  });
}

export function registerActiveSessions(app, { registry, count, now = Date.now }) {
  let sample = null, sampledAt = 0, pending;
  const gauge = new Gauge({ name: 'tablesync_active_seating_sessions', help: 'Open durable seating sessions; aggregate replicas with max', registers: [registry],
    collect() { this.remove(); if (sample !== null && now() - sampledAt <= 45000) this.set(sample); } });
  new Gauge({ name: 'tablesync_active_seating_sessions_available', help: 'Availability of the durable seating count', registers: [registry],
    collect() { this.set(sample !== null && now() - sampledAt <= 45000 ? 1 : 0); } });
  new Gauge({ name: 'tablesync_active_seating_sessions_sample_timestamp_seconds', help: 'Source time of the durable seating count', registers: [registry],
    collect() { this.remove(); if (sample !== null && now() - sampledAt <= 45000) this.set(sampledAt / 1000); } });
  function refresh() {
    if (pending) return pending;
    pending = bounded(count, 1000).then(value => {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid session count');
      sample = value; sampledAt = now();
    }).catch(() => { sample = null; gauge.remove(); }).finally(() => { pending = undefined; });
    return pending;
  }
  const timer = setInterval(refresh, 15000);
  timer.unref();
  app.addHook('onReady', refresh);
  app.addHook('onClose', async () => clearInterval(timer));
  return refresh;
}

export function trackBroker(connection, channel) {
  let ready = true;
  for (const source of [connection, channel]) {
    source.on('error', () => { ready = false; });
    source.on('close', () => { ready = false; });
  }
  return () => ready;
}

export function registerShutdown(app, closeDependencies) {
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 20000);
    try { await app.close(); await closeDependencies(); }
    catch (error) { app.log.error({ err: error }, 'shutdown failed'); process.exitCode = 1; }
    finally { clearTimeout(deadline); }
  }
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}
