import http from 'k6/http';
import { check, sleep } from 'k6';
const target = (__ENV.TARGET_URL || 'http://127.0.0.1:8080').replace(/\/$/, '');
export const options = { vus: 2, duration: '10s', thresholds: { checks: ['rate==1'], http_req_failed: ['rate==0'] } };
export default function () {
  const result = http.get(`${target}/health`, { timeout: '4s' });
  check(result, { healthy: response => response.status === 200 });
  sleep(0.5);
}
export function handleSummary(data) {
  return { stdout: JSON.stringify({ requests: data.metrics.http_reqs?.values.count, checks: data.metrics.checks?.values.rate }, null, 2) + '\n',
    [`${__ENV.EVIDENCE_DIR || '.'}/smoke-summary.json`]: JSON.stringify({ recordedAt: new Date().toISOString(), target, ...data }, null, 2) };
}
