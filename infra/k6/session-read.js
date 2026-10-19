import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
const target = (__ENV.TARGET_URL || 'http://127.0.0.1:18080').replace(/\/$/, '');
const rate = Number(__ENV.RATE || 25);
const duration = __ENV.DURATION || '180s';
const match = /^(\d+)(s|m)$/.exec(duration);
if (!match || Number(match[1]) < 1 || !Number.isInteger(rate) || rate < 1) throw new Error('Use positive RATE and DURATION such as 180s or 3m');
const steadyMs = Number(match[1]) * (match[2] === 'm' ? 60000 : 1000);
const failures = new Rate('steady_unexpected_failures');
const latency = new Trend('steady_latency_ms', true);
export const options = {
  scenarios: {
    read: { executor: 'ramping-arrival-rate', startRate: Math.min(rate, 10), timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 500,
      stages: [{ target: rate, duration: '30s' }, { target: rate, duration }, { target: 0, duration: '5s' }], gracefulStop: '10s' },
    // Arrival-rate executors finish early at zero load; an idle VU keeps observation running.
    cooldown: { executor: 'constant-vus', exec: 'cooldown', vus: 1, duration: __ENV.COOLDOWN || '360s',
      startTime: `${35 + steadyMs / 1000}s`, gracefulStop: '0s' },
  },
  thresholds: { checks: ['rate>0.99'], http_req_failed: ['rate<0.01'], steady_unexpected_failures: ['rate<0.01'], dropped_iterations: ['count==0'] },
  summaryTrendStats: ['avg', 'p(95)', 'max'],
};
export default function () {
  const elapsed = Date.now() - exec.scenario.startTime;
  const steady = elapsed >= 30000 && elapsed < 30000 + steadyMs;
  const headers = __ENV.INTERNAL_API_SECRET ? { authorization: `Bearer ${__ENV.INTERNAL_API_SECRET}` } : {};
  const response = http.get(`${target}/v1/tables/${encodeURIComponent(__ENV.TABLE_CODE || 'SAGE-12')}`, { headers, tags: { phase: steady ? 'steady' : 'ramp' }, timeout: '4s' });
  const valid = check(response, { 'known table returned': result => {
    try { return result.status === 200 && result.json('code') === (__ENV.TABLE_CODE || 'SAGE-12'); }
    catch { return false; }
  } });
  if (steady) { failures.add(!valid); latency.add(response.timings.duration); }
}
export function cooldown() { sleep(1); }
export function handleSummary(data) {
  return {
    stdout: JSON.stringify({ requests: data.metrics.http_reqs?.values.count, steadyFailureRate: data.metrics.steady_unexpected_failures?.values.rate,
      steadyP95Ms: data.metrics.steady_latency_ms?.values['p(95)'], droppedIterations: data.metrics.dropped_iterations?.values.count ?? 0 }, null, 2) + '\n',
    [`${__ENV.EVIDENCE_DIR || '.'}/read-summary.json`]: JSON.stringify({ recordedAt: new Date().toISOString(), target, tableCode: __ENV.TABLE_CODE || 'SAGE-12', rate, duration, directSession: !!__ENV.INTERNAL_API_SECRET, ...data }, null, 2),
  };
}
