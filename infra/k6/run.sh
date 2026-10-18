#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source infra/k8s/tools.sh
source infra/k8s/versions.env
export EVIDENCE_DIR="${EVIDENCE_DIR:-$PWD/infra/k6/.local/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$EVIDENCE_DIR"
export EVIDENCE_DIR=$(cd "$EVIDENCE_DIR" && pwd)
kubectl --context=tablesync apply -f infra/k8s/session-hpa.yaml
kubectl --context=tablesync -n tablesync wait --for=condition=ScalingActive horizontalpodautoscaler/session --timeout=90s
kubectl --context=tablesync -n tablesync port-forward service/api-gateway 18080:8080 > "$EVIDENCE_DIR/gateway-forward.log" 2>&1 & gateway_pid=$!
kubectl --context=tablesync -n tablesync port-forward service/prometheus 19090:9090 > "$EVIDENCE_DIR/prometheus-forward.log" 2>&1 & prometheus_pid=$!
trap 'kill "$gateway_pid" "$prometheus_pid" "${capture_pid:-}" 2>/dev/null || true' EXIT
for attempt in {1..20}; do curl --fail --silent http://127.0.0.1:18080/v1/tables/SAGE-12 >/dev/null && break; sleep 1; done
bash infra/k8s/capture-scaling.sh > "$EVIDENCE_DIR/capture.log" 2>&1 & capture_pid=$!
echo "Read-only local load: ${RATE:-100} requests/s, ${DURATION:-180s} steady load, ${COOLDOWN:-360s} cooldown. Evidence: $EVIDENCE_DIR"
docker run --rm --user "$(id -u):$(id -g)" --network=host -v "$PWD/infra/k6:/scripts:ro" -v "$EVIDENCE_DIR:/evidence" -e TARGET_URL=http://127.0.0.1:18080 -e TABLE_CODE="${TABLE_CODE:-SAGE-12}" -e RATE="${RATE:-100}" -e DURATION="${DURATION:-180s}" -e COOLDOWN="${COOLDOWN:-360s}" -e EVIDENCE_DIR=/evidence "$K6_IMAGE" run /scripts/session-read.js | tee "$EVIDENCE_DIR/k6-output.txt"
echo 'Load ended. Inspect actual Ready replicas, per-pod counters and cooldown in scaling.jsonl; scripts alone are not scaling proof.'
