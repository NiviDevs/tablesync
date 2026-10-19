#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source infra/k8s/versions.env
mode="${1:-compose}"
workload="${2:-read}"
case "$mode/$workload" in compose/read|compose/smoke|kubernetes/read|kubernetes/smoke) ;; *) echo 'Usage: bash infra/k6/run.sh [compose|kubernetes] [read|smoke]' >&2; exit 1;; esac
export EVIDENCE_DIR="${EVIDENCE_DIR:-$PWD/infra/k6/.local/$(date -u +%Y%m%dT%H%M%SZ)-$$}"
mkdir -p "$EVIDENCE_DIR"
EVIDENCE_DIR=$(cd "$EVIDENCE_DIR" && pwd)
export TABLE_CODE="${TABLE_CODE:-SAGE-12}"
export TARGET_URL="${TARGET_URL:-http://127.0.0.1:$([[ "$mode" == compose ]] && echo 8080 || echo 18080)}"
TARGET_URL="${TARGET_URL%/}"
if [[ ! "$TARGET_URL" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?$ ]]; then
  echo 'Load runner requires a loopback HTTP gateway URL, without a path.' >&2
  exit 1
fi
pids=()
cleanup() { for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ "$mode" == kubernetes ]]; then
  source infra/k8s/tools.sh
  if [[ "$workload" == read ]]; then
    kubectl --context=tablesync apply -f infra/k8s/session-hpa.yaml
    kubectl --context=tablesync -n tablesync wait --for=condition=ScalingActive horizontalpodautoscaler/session --timeout=90s
  fi
  gateway_port="${TARGET_URL##*:}"
  [[ "$gateway_port" =~ ^[0-9]+$ ]] || gateway_port=80
  kubectl --context=tablesync -n tablesync port-forward service/api-gateway "$gateway_port:8080" > "$EVIDENCE_DIR/gateway-forward.log" 2>&1 &
  pids+=("$!")
  for attempt in {1..20}; do
    kill -0 "${pids[0]}" 2>/dev/null || { echo "Gateway forwarding failed. See $EVIDENCE_DIR/gateway-forward.log" >&2; exit 1; }
    curl --fail --silent --max-time 1 "$TARGET_URL/health" >/dev/null && break
    sleep 1
  done
  # Check the forwarding process again so an occupied port cannot pass preflight.
  kill -0 "${pids[0]}" 2>/dev/null || { echo 'Gateway forwarding failed.' >&2; exit 1; }
fi
table_path=$(node -p 'encodeURIComponent(process.argv[1])' "$TABLE_CODE")
curl --fail --silent --show-error --max-time 5 "$TARGET_URL/v1/tables/$table_path" > "$EVIDENCE_DIR/preflight.json" || {
  echo "Gateway/table preflight failed. Start npm run $([[ "$mode" == compose ]] && echo demo || echo cloud) and check TABLE_CODE." >&2
  exit 1
}
if [[ "$mode" == kubernetes && "$workload" == read ]]; then
  export PROMETHEUS_LOCAL_URL="${PROMETHEUS_LOCAL_URL:-http://127.0.0.1:19090}"
  prometheus_port="${PROMETHEUS_LOCAL_URL##*:}"
  [[ "$prometheus_port" =~ ^[0-9]+$ ]] || { echo 'PROMETHEUS_LOCAL_URL needs an explicit local port.' >&2; exit 1; }
  kubectl --context=tablesync -n tablesync port-forward service/prometheus "$prometheus_port:9090" > "$EVIDENCE_DIR/prometheus-forward.log" 2>&1 &
  pids+=("$!")
  for attempt in {1..20}; do
    kill -0 "${pids[1]}" 2>/dev/null || { echo 'Prometheus forwarding failed.' >&2; exit 1; }
    curl --fail --silent --max-time 1 "$PROMETHEUS_LOCAL_URL/-/ready" >/dev/null && break
    sleep 1
  done
  curl --fail --silent --show-error --max-time 3 "$PROMETHEUS_LOCAL_URL/-/ready" >/dev/null
  kill -0 "${pids[1]}" 2>/dev/null || { echo 'Prometheus forwarding failed.' >&2; exit 1; }
  bash infra/k8s/capture-scaling.sh > "$EVIDENCE_DIR/capture.log" 2>&1 &
  pids+=("$!")
fi
script=session-read.js
[[ "$workload" == smoke ]] && script=smoke.js
if [[ "$mode" == compose ]]; then
  export DURATION="${DURATION:-60s}" COOLDOWN="${COOLDOWN:-15s}"
else
  export DURATION="${DURATION:-180s}" COOLDOWN="${COOLDOWN:-360s}"
fi
echo "Read-only $mode $workload: $TARGET_URL, table $TABLE_CODE. Evidence: $EVIDENCE_DIR"
echo "Read workload: ${RATE:-25} requests/s, 30s ramp, $DURATION steady, 5s ramp-down, $COOLDOWN cooldown. Smoke: 10s."
docker run --rm --user "$(id -u):$(id -g)" --network=host -v "$PWD/infra/k6:/scripts:ro" -v "$EVIDENCE_DIR:/evidence" \
  -e TARGET_URL -e TABLE_CODE -e RATE="${RATE:-25}" -e DURATION -e COOLDOWN -e EVIDENCE_DIR=/evidence \
  "$K6_IMAGE" run "/scripts/$script" | tee "$EVIDENCE_DIR/k6-output.txt"
if [[ "$mode" == kubernetes && "$workload" == read ]]; then
  echo 'Inspect Ready replicas, per-pod counters and cooldown in scaling.jsonl; a successful load run alone does not prove scaling.'
fi
