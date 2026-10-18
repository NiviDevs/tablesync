#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export TABLESYNC_CLOUD_ACTION="${1:-${TABLESYNC_CLOUD_ACTION:-start}}"
case "$TABLESYNC_CLOUD_ACTION" in start|open|stop) ;; *) echo 'Use npm run cloud, cloud:open or cloud:stop'; exit 1;; esac
if ! docker info >/dev/null 2>&1; then
  if [[ "$(uname -s)" == Linux && -z "${TABLESYNC_DOCKER_GROUP_READY:-}" ]] && id -nG "$(id -un)" | tr ' ' '\n' | grep -qx docker; then
    exec newgrp docker <<'SH'
exec env TABLESYNC_DOCKER_GROUP_READY=1 bash scripts/cloud.sh
SH
  fi
  echo 'Start Docker Desktop/Engine and retry.' >&2
  exit 1
fi
source infra/k8s/tools.sh
if [[ "$TABLESYNC_CLOUD_ACTION" == stop ]]; then
  minikube stop -p tablesync
  echo 'Cluster stopped. Persistent data is preserved.'
  exit 0
fi
if [[ "$TABLESYNC_CLOUD_ACTION" == start ]]; then
  node scripts/demo.mjs stop
  bash infra/k8s/bootstrap.sh
  kubectl --context=tablesync apply -k infra/monitoring
  for service in prometheus grafana kube-state-metrics; do
    kubectl --context=tablesync -n tablesync rollout status "deployment/$service" --timeout=240s
  done
fi
web_port="${WEB_PORT:-3000}"
grafana_port="${GRAFANA_PORT:-3001}"
forward_pids=()
cleanup() { for pid in "${forward_pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT
trap 'exit 0' INT TERM
kubectl --context=tablesync -n tablesync port-forward service/web "$web_port:3000" &
forward_pids+=("$!")
kubectl --context=tablesync -n tablesync port-forward service/grafana "$grafana_port:3000" &
forward_pids+=("$!")
echo
echo "Cloud demo: http://localhost:$web_port"
echo "Owner/operator login: http://localhost:$web_port/restaurant/sign-in"
echo "Grafana: http://localhost:$grafana_port"
echo 'Keep this terminal open. Ctrl+C closes browser forwarding; cloud:stop stops the cluster.'
wait -n "${forward_pids[@]}"
