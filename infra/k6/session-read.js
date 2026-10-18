import http from 'k6/http';
import exec from 'k6/execution';
import { Rate, Trend } from 'k6/metrics';
const target = (__ENV.TARGET_URL || 'http://127.0.0.1:18080').replace(/\/$/, '');
const rate = Number(__ENV.RATE || 100);
const duration = __ENV.DURATION || '180s';
const match = /^(\d+)(s|m)$/.exec(duration);
if (!match || !Number.isInteger(rate) || rate < 1) throw new Error('Use positive RATE and DURATION such as 180s or 3m');
const steadyMs = Number(match[1]) * (match[2] === 'm' ? 60000 : 1000);
const failures = new Rate('steady_unexpected_failures');
const latency = new Trend('steady_latency_ms', true);
export const options = {
  scenarios: { read: { executor: 'ramping-arrival-rate', startRate: Math.min(rate, 10), timeUnit: '1s', preAllocatedVUs: 50, maxVUs: 500,
    stages: [{ target: rate, duration: '30s' }, { target: rate, duration }, { target: 0, duration: '5s' }, { target: 0, duration: __ENV.COOLDOWN || '360s' }], gracefulStop: '10s' } },
  thresholds: { steady_unexpected_failures: ['rate<0.01'], dropped_iterations: ['count==0'] },
  summaryTrendStats: ['avg', 'p(95)', 'max'],
};
export default function () {
  const elapsed = Date.now() - exec.scenario.startTime;
  const steady = elapsed >= 30000 && elapsed < 30000 + steadyMs;
  const headers = __ENV.INTERNAL_API_SECRET ? { authorization: `Bearer ${__ENV.INTERNAL_API_SECRET}` } : {};
  const response = http.get(`${target}/v1/tables/${encodeURIComponent(__ENV.TABLE_CODE || 'SAGE-12')}`, { headers, tags: { phase: steady ? 'steady' : 'ramp' }, timeout: '4s' });
  if (steady) { failures.add(response.status !== 200); latency.add(response.timings.duration); }
}
export function handleSummary(data) {
  return { [`${__ENV.EVIDENCE_DIR || '.'}/read-summary.json`]: JSON.stringify({ recordedAt: new Date().toISOString(), target, tableCode: __ENV.TABLE_CODE || 'SAGE-12', rate, duration, directSession: !!__ENV.INTERNAL_API_SECRET, ...data }, null, 2) };
}
