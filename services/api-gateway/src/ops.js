const services = ['api-gateway', 'session', 'order', 'payment'];
const unavailable = () => ({ value: null, sampleAt: null, state: 'unavailable' });
const sourceTime = selector => `max(timestamp(${selector}))`;

export function createOpsReader({ prometheusUrl, fetch = globalThis.fetch, now = Date.now,
  grafanaUrl = 'http://localhost:3001/d/tablesync-application', environment = process.env.OPS_ENVIRONMENT ?? 'local-minikube' } = {}) {
  let cached, expires = 0, pending;
  async function query(expression, range) {
    if (!prometheusUrl) throw new Error('Prometheus is not configured');
    const controller = new AbortController();
    let timer;
    try {
      return await Promise.race([(async () => {
        const url = new URL(range ? '/api/v1/query_range' : '/api/v1/query', prometheusUrl);
        url.searchParams.set('query', expression);
        if (range) for (const [key, value] of Object.entries(range)) url.searchParams.set(key, value);
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Metrics source unavailable');
        const body = await response.json();
        if (body.status !== 'success' || body.data?.resultType !== (range ? 'matrix' : 'vector') || body.data.result.length > 1) throw new Error('No unique sample');
        if (range) return (body.data.result[0]?.values ?? []).map(([time, value]) => [time, Number.isFinite(Number(value)) ? Number(value) : null]);
        if (body.data.result.length !== 1) throw new Error('No sample');
        const value = Number(body.data.result[0].value[1]);
        if (!Number.isFinite(value)) throw new Error('No finite sample');
        return value;
      })(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('Metrics deadline')); }, 2500); })]);
    } finally { clearTimeout(timer); }
  }
  async function metric(expression, timestampExpression) {
    try {
      const [value, timestamp] = await Promise.all([query(expression), query(timestampExpression)]);
      if (timestamp <= 0 || timestamp * 1000 > now() + 5000) return unavailable();
      return { value, sampleAt: new Date(timestamp * 1000).toISOString(), state: now() - timestamp * 1000 > 45000 ? 'stale' : 'fresh' };
    } catch { return unavailable(); }
  }
  async function history(expression, timestampExpression, range) {
    try {
      // Exclude old source samples rather than drawing a live line through an outage.
      return await query(`(${expression}) and on() (time() - (${timestampExpression}) < 45)`, range);
    } catch { return null; }
  }
  async function load() {
    const end = Math.floor(now() / 15000) * 15;
    const range = { start: end - 900, end, step: 15 };
    const result = { environment, fetchedAt: new Date(now()).toISOString(), services: [], session: {}, grafanaUrl,
      history: { start: range.start, end, step: range.step, services: [], session: {} } };
    const serviceSamples = Promise.all(services.map(async name => {
      const selector = `tablesync_http_requests_total{service="${name}"}`;
      const rate = `sum(rate(${selector}[1m]))`;
      const p95 = `histogram_quantile(0.95,sum by(le)(rate(tablesync_http_request_duration_seconds_bucket{service="${name}"}[1m])))`;
      const errors = `(sum(rate(tablesync_http_requests_total{service="${name}",status_class="5xx"}[1m])) or vector(0)) / ${rate}`;
      const [health, requestsPerSecond, p95Seconds, errorFraction, requestHistory, latencyHistory, errorHistory] = await Promise.all([
        metric(`min(up{job="tablesync-applications",service="${name}"})`, sourceTime(`up{job="tablesync-applications",service="${name}"}`)),
        metric(rate, sourceTime(selector)),
        metric(p95, sourceTime(`tablesync_http_request_duration_seconds_count{service="${name}"}`)),
        metric(errors, sourceTime(selector)),
        history(rate, sourceTime(selector), range), history(p95, sourceTime(`tablesync_http_request_duration_seconds_count{service="${name}"}`), range),
        history(errors, sourceTime(selector), range),
      ]);
      return { name, health, requestsPerSecond, p95Seconds, errorFraction,
        history: { requestsPerSecond: requestHistory, p95Seconds: latencyHistory, errorFraction: errorHistory } };
    }));
    const desired = 'kube_deployment_spec_replicas{namespace="tablesync",deployment="session"}';
    const ready = 'kube_deployment_status_replicas_available{namespace="tablesync",deployment="session"}';
    const cpu = 'container_cpu_usage_seconds_total{namespace="tablesync",pod=~"session-.*",container="session"}';
    const memory = 'container_memory_working_set_bytes{namespace="tablesync",pod=~"session-.*",container="session"}';
    const [serviceResults, desiredReplicas, readyReplicas, cpuCores, memoryBytes, activeSeatingSessions, desiredHistory, readyHistory, cpuHistory, memoryHistory] = await Promise.all([
      serviceSamples,
      metric(`max(${desired})`, sourceTime(desired)), metric(`max(${ready})`, sourceTime(ready)),
      metric(`sum(rate(${cpu}[1m]))`, sourceTime(cpu)), metric(`sum(${memory})`, sourceTime(memory)),
      metric('max(tablesync_active_seating_sessions)', 'max(tablesync_active_seating_sessions_sample_timestamp_seconds)'),
      history(`max(${desired})`, sourceTime(desired), range), history(`max(${ready})`, sourceTime(ready), range),
      history(`sum(rate(${cpu}[1m]))`, sourceTime(cpu), range), history(`sum(${memory})`, sourceTime(memory), range),
    ]);
    result.services = serviceResults.map(({ history, ...service }) => service);
    result.history.services = serviceResults.map(({ name, history }) => ({ name, ...history }));
    result.history.session = { desiredReplicas: desiredHistory, readyReplicas: readyHistory, cpuCores: cpuHistory, memoryBytes: memoryHistory };
    result.session = { desiredReplicas, readyReplicas, cpuCores, memoryBytes, activeSeatingSessions };
    return result;
  }
  return { async readOverview() {
    if (cached && now() < expires) return cached;
    if (!pending) pending = load().then(result => { cached = result; expires = now() + 5000; return result; }).finally(() => { pending = undefined; });
    return pending;
  } };
}

export function registerOpsRoutes(app, { reader }) {
  app.get('/v1/ops/overview', async (request, reply) => {
    // Product middleware verifies JWTs and sets operator identity before this handler.
    if (!request.identity?.roles?.includes('operator')) return reply.code(403).send({ error: { code: 'OPERATOR_REQUIRED', message: 'Operator access required' }, requestId: request.id });
    if (Object.keys(request.query).length) return reply.code(400).send({ error: { code: 'INVALID_OPS_QUERY', message: 'This endpoint accepts no query parameters' }, requestId: request.id });
    reply.header('cache-control', 'private, no-store');
    return reader.readOverview();
  });
}
