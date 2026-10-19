import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpsReader, registerOpsRoutes } from '../src/ops.js';

const now = 1800000000000;

test('Ops returns bounded history, preserves gaps, and shares cached refreshes', async () => {
  const requests = [];
  const reader = createOpsReader({ prometheusUrl: 'http://prometheus:9090', now: () => now, fetch: async input => {
    const url = new URL(input);
    requests.push(url);
    const range = url.pathname.endsWith('query_range');
    const timestamp = url.searchParams.get('query').includes('timestamp(') || url.searchParams.get('query').includes('sample_timestamp_seconds');
    return Response.json({ status: 'success', data: { resultType: range ? 'matrix' : 'vector', result: [range
      ? { values: [[now / 1000 - 30, '2'], [now / 1000 - 15, 'NaN'], [now / 1000, '0']] }
      : { value: [now / 1000, timestamp ? String(now / 1000) : '1'] }] } });
  } });
  const [first, second] = await Promise.all([reader.readOverview(), reader.readOverview()]);
  assert.equal(first, second);
  const count = requests.length;
  assert.equal(await reader.readOverview(), first);
  assert.equal(requests.length, count);
  assert.equal(first.services.length, 4);
  assert.equal(first.services[0].health.state, 'fresh');
  assert.deepEqual(first.history.services[0].requestsPerSecond, [[now / 1000 - 30, 2], [now / 1000 - 15, null], [now / 1000, 0]]);
  assert.equal(first.history.end - first.history.start, 900);
  assert.equal(first.history.step, 15);
  const ranges = requests.filter(url => url.pathname.endsWith('query_range'));
  assert.equal(ranges.length, 16);
  for (const url of ranges) {
    assert.equal(url.searchParams.get('start'), String(first.history.start));
    assert.equal(url.searchParams.get('end'), String(first.history.end));
    assert.equal(url.searchParams.get('step'), '15');
    assert.match(url.searchParams.get('query'), /and on\(\) \(time\(\) - .* < 45\)/);
  }
});

test('Ops distinguishes source failure, no traffic and stale source samples', async () => {
  const reader = createOpsReader({ prometheusUrl: 'http://prometheus:9090', now: () => now, fetch: async input => {
    const url = new URL(input);
    const query = url.searchParams.get('query');
    const range = url.pathname.endsWith('query_range');
    if (range && query.includes('service="session"')) return new Response('', { status: 503 });
    if (range) return Response.json({ status: 'success', data: { resultType: 'matrix', result: [] } });
    return Response.json({ status: 'success', data: { resultType: 'vector', result: [{ value: [now / 1000, String(now / 1000 - 60)] }] } });
  } });
  const result = await reader.readOverview();
  assert.equal(result.services[0].health.state, 'stale');
  assert.deepEqual(result.history.services[0].requestsPerSecond, []);
  assert.equal(result.history.services[1].requestsPerSecond, null);
  const unavailable = await createOpsReader({ now: () => now }).readOverview();
  assert.equal(unavailable.services[0].health.state, 'unavailable');
  assert.equal(unavailable.history.session.cpuCores, null);
});

test('Ops history keeps operator-only access and rejects arbitrary query parameters', async () => {
  let handler;
  registerOpsRoutes({ get(path, callback) { assert.equal(path, '/v1/ops/overview'); handler = callback; } }, { reader: { readOverview: () => 'overview' } });
  const reply = { code(status) { this.status = status; return this; }, send(body) { return body; }, header(name, value) { assert.equal(name, 'cache-control'); assert.equal(value, 'private, no-store'); } };
  await handler({ query: {} }, reply);
  assert.equal(reply.status, 403);
  await handler({ identity: { roles: ['operator'] }, query: { query: 'arbitrary' } }, reply);
  assert.equal(reply.status, 400);
  assert.equal(await handler({ identity: { roles: ['operator'] }, query: {} }, reply), 'overview');
});
