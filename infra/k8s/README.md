# Local Kubernetes

This deploys the actual service application to the private `tablesync` Minikube
profile. It does not provision hosted compute. Payments are simulated.

Prerequisites: Docker daemon access, Bash, Python 3, Git, Minikube and kubectl.
Use the versions in `versions.env`. Verify downloaded binaries against their
published SHA-256 checksums. Keep at least 6 GiB available for the cluster and
capacity for the host browser and load generator.

Run from the repository root, with Docker access:

```sh
export IMAGE_TAG=$(git rev-parse --short=12 HEAD)
bash infra/k8s/bootstrap.sh
kubectl --context=tablesync -n tablesync port-forward service/web 3000:3000
```

Bootstrap creates random local credentials once in ignored
`infra/k8s/.local/secret.env` with mode 0600. Reuse this file on every run. To
provide credentials explicitly, copy `secret.env.example`, replace placeholders,
and set `SECRET_FILE`. Never commit this file or publish Secret YAML/logs.
Changing a Secret does not change credentials already stored inside PostgreSQL
or RabbitMQ volumes; coordinate any rotation explicitly.

For Supabase staff/operator sign-in, supply `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` when building, and configure the matching
staff issuer/JWKS/assignments in the local secret file. The default build-only
identity values allow local application startup but do not provide staff login.
Staff membership and the operator role remain server-controlled.

Bootstrap builds root-context images with the workspace lockfile, loads them,
starts dependencies, runs a revision-named migration Job, validates rendered
manifests using server dry-run, and then rolls out application pods. Migration
failure stops deployment. Reusing the same revision reuses its completed Job;
new revisions use new Jobs and the checksum-aware migration runner. Do not edit
applied SQL or use volume deletion to retry migrations.

```sh
IMAGE_TAG=<deployed-revision> bash infra/k8s/check.sh
kubectl --context=tablesync -n tablesync get pods,pvc
kubectl --context=tablesync -n tablesync top pods
kubectl --context=tablesync -n tablesync get deployments -o wide
```

All Services are ClusterIP. Only forward the web port for guest access. Do not
publish database, broker, Prometheus, Kubernetes, or metrics ports. Application
probes use `/livez` and `/readyz`; web uses `/api/health`. Legacy `/health` is
compatibility-only. Dependency readiness failure does not trigger liveness
restart. PostgreSQL and RabbitMQ use persistent volumes; Redis is transient.

Stop without deleting state:

```sh
minikube stop -p tablesync
```

Runtime evidence and measured limits are recorded in `docs/progress/B.md`.
Manifests alone do not establish successful deployment, persistence or scaling.
