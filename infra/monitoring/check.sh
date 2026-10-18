#!/usr/bin/env bash
set -euo pipefail
k=(kubectl --context=tablesync -n tablesync)
for app in prometheus grafana kube-state-metrics; do "${k[@]}" rollout status "deployment/$app" --timeout=600s; done
"${k[@]}" exec deployment/prometheus -- promtool check config /etc/prometheus/prometheus.yml
"${k[@]}" exec -i deployment/api-gateway -- node --input-type=module <<'JS'
import assert from 'node:assert/strict';
const base = 'http://prometheus:9090';
const targets = await (await fetch(`${base}/api/v1/targets`)).json();
const active = targets.data.activeTargets;
assert.ok(active.length >= 7, `Expected seven targets, found ${active.length}`);
assert.ok(active.every(target => target.health === 'up'), JSON.stringify(active.map(t => ({ job: t.labels.job, health: t.health, error: t.lastError }))));
const names = (await (await fetch(`${base}/api/v1/label/__name__/values`)).json()).data;
for (const name of ['tablesync_http_requests_total', 'tablesync_http_request_duration_seconds_bucket',
  'tablesync_active_seating_sessions', 'kube_deployment_status_replicas_available',
  'container_cpu_usage_seconds_total', 'container_memory_working_set_bytes',
  'rabbitmq_queue_messages_ready', 'rabbitmq_queue_messages_unacked']) assert.ok(names.includes(name), `Missing ${name}`);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), targets: active.map(t => ({ job: t.labels.job, service: t.labels.service, health: t.health })), metricFamilies: names.length }, null, 2));
JS
"${k[@]}" exec deployment/grafana -- sh -c 'test -s /var/lib/grafana/dashboards/application.json && test -s /var/lib/grafana/dashboards/kubernetes.json'
