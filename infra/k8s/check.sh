#!/usr/bin/env bash
set -euo pipefail
k=(kubectl --context=tablesync -n tablesync)
for target in statefulset/postgres statefulset/rabbitmq deployment/redis deployment/session deployment/order deployment/payment deployment/api-gateway deployment/web; do
  "${k[@]}" rollout status "$target" --timeout=240s
done
[[ -n "${IMAGE_TAG:-}" ]] || { echo 'Set IMAGE_TAG to the deployed revision' >&2; exit 1; }
"${k[@]}" wait --for=condition=complete "job/migrate-${IMAGE_TAG,,}" --timeout=10s
for pair in session:8081 order:8082 payment:8083 api-gateway:8080 web:3000; do
  app=${pair%:*}; port=${pair#*:}; path=/readyz
  [[ "$app" != web ]] || path=/api/health
  "${k[@]}" exec "deployment/$app" -- node -e "fetch('http://127.0.0.1:$port$path').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
done
"${k[@]}" get pods
"${k[@]}" top pods
# ClusterIP is required for every TableSync service; no public DB/management ports.
"${k[@]}" get services -o json | python3 -c 'import json,sys; assert all(s["spec"]["type"]=="ClusterIP" for s in json.load(sys.stdin)["items"])'
