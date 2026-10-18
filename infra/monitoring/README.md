# Private monitoring

Deploy after the application cluster is Ready:

```sh
kubectl --context=tablesync apply -k infra/monitoring
bash infra/monitoring/check.sh
kubectl --context=tablesync -n tablesync port-forward service/grafana 3001:3000
```

Grafana username is `operator`. Password is `GRAFANA_ADMIN_PASSWORD` in ignored
`infra/k8s/.local/secret.env`. Anonymous access and signup are disabled. The two
provisioned dashboards are `TableSync / Application` and `TableSync / Kubernetes`.
Both identify `local-minikube`, refresh every five seconds, and show gaps when
source data is unavailable. Prometheus scrapes every 15 seconds, retaining up
to 24 hours within a 2 GiB persistent volume. No public monitoring ingress exists.

Metrics Server supplies HPA; Prometheus supplies dashboard history. cAdvisor
collection uses the Kubernetes API proxy with its mounted service account CA and
token. TLS verification stays enabled. Kubernetes discovery reads only the
TableSync namespace; node/proxy access is required for cAdvisor.

Gateway Ops configuration uses `PROMETHEUS_URL=http://prometheus:9090` and
`GRAFANA_URL=http://localhost:3001/d/tablesync-application`. The browser receives
neither credentials nor arbitrary query access. HPA panels remain empty until
the Session HPA is deployed. Initial request-rate/histogram panels need at least
two scrapes with real application traffic.
