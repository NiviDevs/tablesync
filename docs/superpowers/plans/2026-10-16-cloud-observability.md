# TableSync cloud observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for a contributor implementing tasks directly, or superpowers:subagent-driven-development when the user explicitly selects delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce live operational graphs and measured local Kubernetes autoscaling for the actual application.

**Architecture:** Instrument existing services, deploy the same images to Minikube, and collect metrics through Prometheus. Grafana provides detailed charts; a protected Ops endpoint supplies bounded summary data.

**Tech Stack:** Minikube, Kubernetes HPA/Metrics Server, Prometheus, Grafana, kube-state-metrics, RabbitMQ Prometheus plugin, prom-client, k6.

**Spec:** [Approved rebuild specification](../../REBUILD_SPEC.md), approved in conversation on 2026-10-16. This execution plan remains pending review; no implementation has started.

## Global Constraints

Read [the shared plan](2026-10-16-assessment-foundation.md), its trust boundary, and the approved spec. F0/F1 precede work. Scrape every 15 seconds; refresh dashboards every five seconds; mark samples stale after 45 seconds. HPA starts at 60% CPU, 1–3 replicas; it scales Session only. Keep metrics private, credentials server-side, and load generation local.

## Review Focus

- An unregistered URL creates unbounded metric labels (C1).
- Database failure restarts healthy processes indefinitely (C1/C2).
- Three desired replicas include Pending pods due to insufficient memory (C2/C5).
- Prometheus is healthy but its application scrape is stale (C4).
- Keep-alive traffic reaches only one Session pod despite replica growth (C5).

## File boundaries

B owns `packages/telemetry`, `infra/k8s`, `infra/monitoring`, `infra/k6`, and `apps/web/app/ops`. A integrates service hook patches, package/lockfile changes, gateway route registration, and shared layout edits. No new backend telemetry service: the singleton gateway contains the read-only Ops adapter.

## C1: Service metrics and truthful health

**Files:** create `packages/telemetry/package.json`, `packages/telemetry/src/index.js`, `packages/telemetry/test/metrics.test.js`; modify four service package files and server hook registration through A; create health tests beside each service's existing tests.
**Interfaces:** `registerTelemetry(app,{service,registry})` registers `/metrics`, request counter `tablesync_http_requests_total`, and histogram `tablesync_http_request_duration_seconds`. `registerHealth(app,{checkDependencies})` registers `/livez` and `/readyz`; dependency checks have a one-second deadline. Existing `/health` remains a documented compatibility route.

- [ ] Test two successful requests increment the expected series; 5xx increments only its status class; many unknown paths share route label `unmatched`; `/metrics`/health probes are excluded from business request statistics. Labels are exactly service, method, route template, status_class; duration bucket labels are added by the library.
- [ ] Test `/livez` stays 200 during DB failure while `/readyz` becomes 503 within its deadline. Recovery returns 200 without restarting. Run `node --test packages/telemetry/test/metrics.test.js` and the owning health tests; observe failure before implementation.
- [ ] Implement Fastify hooks with `prom-client`, per-app registries for test isolation, and duration buckets `[0.005,0.01,0.025,0.05,0.1,0.25,0.5,1,2.5,5]` seconds. Readiness checks only dependencies required for serving; bounded checks may run concurrently. Broker readiness uses a live channel/connection state, not whether a variable was assigned once.
- [ ] Add Session's `tablesync_active_seating_sessions` from a cached database count refreshed every 15 seconds; remove misleading gateway room gauge from Ops. Because each Session replica reports the same business count, aggregate using `max`, not `sum`. On DB count failure, expose availability separately and omit the stale business sample.
- [ ] Add structured request IDs and redact authorization, cookies, internal keys, guest tokens, and contact fields. Handle SIGTERM with HTTP drain and database/broker close within 20 seconds. Run metric/health tests and existing service tests. Commit `feat: expose application metrics and dependency health`.

## C2: Reproducible images and local Kubernetes

**Files:** modify service Dockerfiles and Compose through A; create `apps/web/Dockerfile`, `.dockerignore`, `infra/k8s/base/{kustomization,namespace,config,postgres,redis,rabbitmq,applications,migrate-job}.yaml`, `infra/k8s/bootstrap.sh`, `infra/k8s/versions.env`, `infra/k8s/secret.env.example`, `infra/k8s/check.sh`.
**Interfaces:** namespace/profile `tablesync`; ClusterIP service names `web`, `api-gateway`, `session`, `order`, `payment`, `postgres`, `redis`, `rabbitmq`. Bootstrap takes `IMAGE_TAG` (Git revision), builds/loads images, deploys dependencies, runs migration Job, then applications. No cluster deletion or data reset.

- [ ] Build from repository root with the committed workspace lockfile and `npm ci`; the new telemetry workspace must resolve inside each image. Pin the tested Node base digest and component image versions in versions.env during execution; no `latest`. Build Next standalone output and pass runtime server secrets only at deployment.
- [ ] Start `minikube start -p tablesync --driver=docker --cpus=4 --memory=6144`; enable Metrics Server. If memory/driver prerequisites fail, record the blocker and adjust within measured host capacity. Do not assume this command has been verified by this plan.
- [ ] Define startup, liveness, and readiness probes using C1 endpoints. Web gets a lightweight `/api/health` route. Set 30-second termination grace. Apply ConfigMaps plus an ignored generated Secret from `secret.env.example`; never put actual secrets in `versions.env`.
- [ ] Start resource requests/limits as follows: Session 100m/128Mi request, 500m/256Mi limit; gateway/Order/Payment each 100m/128Mi and 500m/256Mi; web 200m/256Mi and 1000m/512Mi; PostgreSQL 200m/256Mi and 1000m/512Mi; Redis 50m/64Mi and 250m/128Mi; RabbitMQ 200m/256Mi and 1000m/512Mi. These are initial budgets requiring observed tuning, not promised sufficiency.
- [ ] Use single-instance StatefulSets/PVCs for PostgreSQL and RabbitMQ. Enable RabbitMQ's Prometheus plugin in its tested image. Keep Redis transient. Run the F1 migration runner as a unique Job per image tag, wait for success before application rollout, and make reapplication safe. Preserve existing schema/data on rerun.
- [ ] Run `kubectl --context=tablesync apply --dry-run=server -k infra/k8s/base`, bootstrap, `kubectl --context=tablesync -n tablesync get pods`, and `kubectl --context=tablesync -n tablesync top pods`. `check.sh` fails on missing Ready pods, failed migration, or unreachable readiness endpoints. Record versions and pod requests/limits.
- [ ] Verify process restart preserves a committed test order; check no management/database service has public ingress. Commit `feat: deploy the service stack to local Kubernetes`.

## C3: Prometheus and provisioned Grafana dashboards

**Files:** create `infra/monitoring/{kustomization,prometheus,grafana,kube-state-metrics,rbac}.yaml`, `infra/monitoring/prometheus.yml`, `infra/monitoring/grafana/{datasources.yaml,dashboards.yaml,tablesync.json}`, `infra/monitoring/check.sh`; update versions.env.
**Interfaces:** Prometheus ClusterIP `prometheus:9090`; Grafana `grafana:3000`. Dashboards named `TableSync / Application` and `TableSync / Kubernetes`; environment label `local-minikube` on every panel.

- [ ] Configure native Prometheus service/pod discovery with private scrape targets for four services, kube-state-metrics, kubelet/cAdvisor, and RabbitMQ. Use the mounted service-account CA/token and least-privilege read RBAC; do not disable TLS verification. Keep Metrics Server independent: it supplies HPA, not Grafana history.
- [ ] Allocate initial Prometheus request 250m/512Mi, limit 1000m/1024Mi; Grafana 100m/128Mi and 500m/256Mi; kube-state-metrics 50m/64Mi and 250m/128Mi. Keep 24-hour retention and a 2 GiB local metric volume. Check total budget with C2 before adding components.
- [ ] Provision panels for request rate, p95, 5xx fraction, CPU/memory per pod, desired/ready replicas, HPA current/target/conditions, active sessions, and RabbitMQ ready/unacknowledged messages. Validate names against scraped series from pinned versions instead of guessing Kubernetes metric names.
- [ ] Use application queries `sum by(service)(rate(tablesync_http_requests_total[1m]))` and `histogram_quantile(0.95,sum by(le,service)(rate(tablesync_http_request_duration_seconds_bucket[1m])))`. Error rate divides 5xx request rate by total rate; return no-data for a zero denominator. CPU is reported in cores and memory in bytes/MiB with correct units.
- [ ] `check.sh` verifies every required scrape target and metric family, runs `promtool check config`, and confirms provisioned dashboards load. Send real requests, observe counter changes, and compare displayed ready replicas to `kubectl get deployment session`. Failure is unavailable, never a hardcoded healthy value.
- [ ] Run the check script and preserve screenshots/queries with timestamps. Commit `feat: provision real application and Kubernetes dashboards`.

## C4: Protected custom Ops overview

**Files:** create `services/api-gateway/src/ops.js`, `services/api-gateway/test/ops.test.js`, `apps/web/lib/ops.ts`; modify gateway route registration through A and `apps/web/app/ops/page.tsx`.
**Interfaces:** `createOpsReader({prometheusUrl,fetch,now})` exposes `readOverview()`. Shared return type:

```ts
type MetricValue = { value: number | null; sampleAt: string | null;
  state: 'fresh' | 'stale' | 'unavailable' };
type OpsOverview = { environment: 'local-minikube'; fetchedAt: string;
  services: { name: string; health: MetricValue; requestsPerSecond: MetricValue;
    p95Seconds: MetricValue; errorFraction: MetricValue }[];
  session: { desiredReplicas: MetricValue; readyReplicas: MetricValue;
    cpuCores: MetricValue; memoryBytes: MetricValue; activeSeatingSessions: MetricValue };
  grafanaUrl: string };
```

- [ ] Test a valid zero remains fresh, NaN/empty series is unavailable, failed requests are unavailable, and samples older than 45 seconds are stale. Include a healthy Prometheus response with an old source sample; `fetchedAt` must not reset source freshness. Test a slow source returns within three seconds and an ordinary staff token gets 403.
- [ ] Run `node --test services/api-gateway/test/ops.test.js` and observe failure. Implement fixed allowlisted PromQL queries, bounded fetch deadlines, and a five-second cache. Determine freshness from source sample timestamps (using timestamp queries where necessary), not the time Prometheus evaluated an aggregate.
- [ ] Register `/v1/ops/overview` behind operator authorization. Add no raw query, URL, Kubernetes mutation, or load-test parameters. Detailed time-series exploration remains in Grafana; configure Grafana authentication and keep direct access private/port-forwarded.
- [ ] Replace all fake Ops bars, events, and topology states. Poll every five seconds; retain stale values only with a visible stale label/sample time. Source failures show unavailable. Link to the provisioned Grafana dashboard; the custom page is a summary, not another dashboard engine.
- [ ] Run Ops tests, web typecheck/build, and manually stop a scrape target. Confirm the UI no longer claims healthy service state after the freshness threshold. Commit `feat: render a protected live operations overview`.

## C5: Calibrated load, HPA, and recovery evidence

**Files:** create `infra/k8s/session-hpa.yaml`, `infra/k6/session-read.js`, `infra/k6/cart-correctness.js`, `infra/k6/README.md`, `infra/k8s/capture-scaling.sh`; keep existing health smoke explicitly separate. Read-load work depends on P1/P2 read safety and C2/C3. Checkout/recovery acceptance additionally waits for P3 and the service-backed smoke checks.
**Interfaces:** k6 variables `TARGET_URL`, `TABLE_CODE`, `RATE`, `DURATION`; output summary JSON to a caller-selected evidence directory. Read scenario targets gateway `/v1/tables/:code`, which must make a real Session read per request; record no gateway response cache for this experiment.

- [ ] Seed one known table without load-time writes. Run a tiny read test and assert session/cart row counts remain unchanged. The correctness script separately joins synthetic guests, sets quantities, retries, and checks one checkout/order; never run its mutation workload against hosted data.
- [ ] Implement a constant-arrival-rate read scenario with controlled ramp, sustained load, and cooldown. Count unexpected HTTP failures; set `rate<0.01` for the steady phase using a dedicated metric/tag. Export p95 and dropped iterations; insufficient k6 capacity is visible, not a passing result. Do not set an unmeasured latency SLO.
- [ ] Establish baseline at one Session replica. Calibrate offered rates starting low (for example 10, 25, 50 requests/second), observing host/DB/gateway and Session CPU. Cap the calibration effort at two hours. If Session is I/O-bound and HPA cannot trigger, record evidence and request a target/workload adjustment rather than adding busy loops.
- [ ] Create autoscaling/v2 HPA: min 1, max 3, CPU utilization target 60%, scale-up stabilization 0 seconds, scale-down stabilization 300 seconds, at most one scale-down pod per 60 seconds. Session CPU request starts at C2's 100m; tune only with recorded rationale. Metrics Server must report a valid target before testing.
- [ ] Run the same offered load with HPA, capture every five seconds: UTC time, HPA status, desired/ready replicas, pod CPU/memory, application counters and k6 output. Verify per-pod request counters increase on added pods. If gateway keep-alive pins all traffic to one pod, test a bounded Session HTTP client pool that distributes connections or choose an explicit direct-Service experiment and label that bypass; never claim unobserved distribution.
- [ ] Continue zero/low traffic cooldown for at least 360 seconds and longer if needed to observe one ready replica. Run the same metrics/export capture through cooldown. Compare latency/throughput/error results honestly; scale-up alone does not prove improvement.
- [ ] During a separate controlled recovery test, delete one identified Session pod, observe replacement, and confirm the already committed order still exists. Do not delete PVCs or databases. Check no Pending replicas were counted as successful scaling.
- [ ] Acceptance: one to at least two Ready Session pods, later return to one, less than 1% unexpected steady-state failures, no lost committed order, and complete timestamped evidence. Mark blocked with the precise measurement if any condition fails. Commit `test: add reproducible load and autoscaling evidence` only after actual evidence exists; scripts alone remain implemented/unverified.

## Coverage and handoff

C1 covers honest service state; C2 covers deployment/probes/storage/resources; C3/C4 cover graphs and summary access; C5 covers real load/scaling/recovery. KEDA, node autoscaling, tracing, and remote load controls are excluded. Hand verified results to F2 without expanding scope.
