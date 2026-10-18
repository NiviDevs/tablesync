#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
source infra/k8s/versions.env
: "${IMAGE_TAG:=$(git rev-parse --short=12 HEAD)}"
[[ "$IMAGE_TAG" =~ ^[a-f0-9]{7,40}$ ]] || { echo 'IMAGE_TAG must be a lowercase Git revision (7–40 hex digits)' >&2; exit 1; }
export IMAGE_TAG
secret_file="${SECRET_FILE:-infra/k8s/.local/secret.env}"
if [[ ! -f "$secret_file" ]]; then
  mkdir -p "$(dirname "$secret_file")"
  SECRET_FILE="$secret_file" python3 - <<'PY'
import os, secrets
password, broker = secrets.token_hex(24), secrets.token_hex(24)
values = dict(POSTGRES_PASSWORD=password, DATABASE_URL=f'postgresql://tablesync:{password}@postgres:5432/tablesync',
    RABBITMQ_DEFAULT_PASS=broker, RABBITMQ_URL=f'amqp://tablesync:{broker}@rabbitmq:5672',
    INTERNAL_API_SECRET=secrets.token_hex(32), GUEST_TOKEN_SECRET=secrets.token_hex(32),
    GRAFANA_ADMIN_PASSWORD=secrets.token_hex(24), STAFF_JWT_ISSUER='', STAFF_JWT_AUDIENCE='authenticated',
    STAFF_JWKS_URL='', STAFF_ASSIGNMENTS_JSON='{}')
with open(os.open(os.environ['SECRET_FILE'], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
    f.writelines(f'{key}={value}\n' for key, value in values.items())
PY
fi
if grep -q 'replace-with-' "$secret_file"; then echo 'Replace secret placeholders before bootstrap' >&2; exit 1; fi
if ! minikube -p tablesync status >/dev/null 2>&1; then
  minikube start -p tablesync --driver=docker --cpus=4 --memory=6144 --kubernetes-version="$KUBERNETES_VERSION"
fi
running_version=$(kubectl --context=tablesync get node tablesync -o jsonpath='{.status.nodeInfo.kubeletVersion}')
[[ "$running_version" == "$KUBERNETES_VERSION" ]] || { echo "Expected Kubernetes $KUBERNETES_VERSION; found $running_version" >&2; exit 1; }
minikube -p tablesync addons enable metrics-server
kubectl --context=tablesync apply -f infra/k8s/base/namespace.yaml
kubectl --context=tablesync -n tablesync create secret generic tablesync-secrets --from-env-file="$secret_file" --dry-run=client -o yaml |
  kubectl --context=tablesync -n tablesync apply -f -
for app in api-gateway session order payment web; do
  docker build -f "$( [[ "$app" == web ]] && echo apps/web || echo services/"$app" )/Dockerfile" \
    --build-arg NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-https://build-only.supabase.co}" \
    --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-build-only-placeholder}" \
    -t "tablesync/$app:$IMAGE_TAG" .
  minikube -p tablesync image load "tablesync/$app:$IMAGE_TAG"
done
kubectl --context=tablesync -n tablesync apply -f infra/k8s/base/config.yaml -f infra/k8s/base/postgres.yaml -f infra/k8s/base/redis.yaml -f infra/k8s/base/rabbitmq.yaml
for target in statefulset/postgres statefulset/rabbitmq deployment/redis; do
  kubectl --context=tablesync -n tablesync rollout status "$target" --timeout=240s
done
rendered=$(mktemp -d)
trap 'rm -rf "$rendered"' EXIT
cp infra/k8s/base/*.yaml "$rendered/"
sed -i "s|:dev|:$IMAGE_TAG|g; s|migrate-dev|migrate-${IMAGE_TAG,,}|g" "$rendered/applications.yaml" "$rendered/migrate-job.yaml"
kubectl --context=tablesync -n tablesync apply -f "$rendered/migrate-job.yaml"
kubectl --context=tablesync -n tablesync wait --for=condition=complete "job/migrate-${IMAGE_TAG,,}" --timeout=180s || {
  kubectl --context=tablesync -n tablesync logs "job/migrate-${IMAGE_TAG,,}"; exit 1;
}
# Server dry-run validates every rendered resource before application rollout.
kubectl --context=tablesync apply --dry-run=server -k "$rendered"
kubectl --context=tablesync -n tablesync apply -f "$rendered/applications.yaml"
bash infra/k8s/check.sh
