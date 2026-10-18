# Role B progress

Branch: `feat/cloud-observability`. Isolated worktree: `/tmp/tablesync-role-b`.
Original main and A's worktree remain untouched.

## Prerequisites and coordination — 2026-10-18

- Inspected main (`079b178`), its existing `.gitignore`/index/memory changes,
  and A's worktree before creating this worktree. Preserved all existing work.
- Merged published FOUNDATION CHECKPOINT `66ea50c32401a8c6fd8a639d24d43b58d359463d`.
- A explicitly approved C1 scope and supplied stable product checkpoint
  `a85efae46bda7420093b294f494a47176851c52d`; merged that committed checkpoint.
- Shared service/dependency/container changes are isolated handoff commits for
  A to review and integrate. No edits occur in A's worktree.

## C1 — implemented and unit verified

- Commit: this C1 commit (`feat: expose application metrics and dependency health`).
- Added `@tablesync/telemetry` with exact dependency `prom-client@15.1.3`.
  Per-app registries expose bounded request counters/histograms; health and
  scrape requests are excluded. Unknown paths share `unmatched`.
- `/livez` checks process health. `/readyz` checks dependencies with a one-second
  deadline. Existing `/health` remains compatible and is not a Kubernetes probe.
- Session refreshes OPEN seating count from PostgreSQL every 15 seconds.
  Failed/stale samples disappear; availability and source time are separate.
  Replica aggregation must use `max`, not `sum`. Removed gateway room gauge.
- Shared Fastify options generate request IDs, omit URLs/bodies from request
  serialization, and redact credentials. SIGTERM drains HTTP and closes external
  resources with a 20-second deadline. Broker readiness follows close/error events.
- Checks: three module tests and five service/lifecycle health tests pass;
  existing workspace suites pass on Node 22.23.3/npm 10.9.9. `git diff --check`
  passes. Initial module check failed before implementation. A gauge test exposed
  `Gauge.reset()` emitting zero; `Gauge.remove()` now omits unavailable samples.
- Environment: offline clean install lacked cached packages. Approved network
  install succeeded, with zero audit vulnerabilities. Node's sandboxed child
  runner suppresses useful failure output; final workspace run passed outside
  sandbox. Initial baseline attempt during missing dependencies was not a pass.
- Integration request: A cherry-picks this focused commit, including service
  hooks, four workspace declarations and lockfile. Images must build from root
  with the workspace lockfile (C2). No API, event or migration contract changed.
- Limits: dependency failure/recovery is injected in unit checks. Real cluster
  scraping, process shutdown and dependency outage acceptance remain C2/C3.

## C2 shared image handoff — 2026-10-18

- Commit: this focused handoff (`build: use locked workspace images for cluster deployment`).
- Scope approved by A: four root-context service Dockerfiles, Compose build
  contexts, Next standalone config, web image/health route and `.dockerignore`.
- All five images build successfully with Node 22.23.3/npm 10.9.9 and `npm ci`.
  Node base is pinned to the pulled multi-architecture digest recorded in the
  Dockerfiles and `infra/k8s/versions.env`. Runtime user is `node`.
- Service images include the telemetry workspace and the existing migration
  runner/SQL. Next standalone output includes workspace file tracing and static
  assets. Supabase public build arguments remain explicit; secrets stay runtime.
- A must integrate this focused commit before rebuilding its Compose services.
  A's running containers, volumes and local environment remain untouched.
- Cluster files and runtime acceptance remain separate C2 work on B's branch.

## C2 — deployed and runtime verified, 2026-10-18

- Commit: this C2 commit (`feat: deploy the service stack to local Kubernetes`).
- Profile/context/namespace `tablesync`, Minikube v1.37.0, Kubernetes/kubectl
  v1.34.1; Docker driver, 4 CPU quota and 6144 MiB requested. Published SHA-256
  checksums verified for downloaded Minikube/kubectl binaries.
- Bootstrap exits 0: all eight workload pods Ready, revision-named migration
  Job completes, server dry-run passes, private ClusterIP services, PVCs bound.
  Images deployed from `fdd1b426ce24`; all five image builds pass.
- Real application flow commits order `04865ecb-472b-449b-be60-26529ebf1864`;
  actual Order restart preserves the same ID. Migration rerun says already
  current and preserves the one order. Evidence is in `infra/k8s/evidence`.
- Real PostgreSQL outage initially exposed unhandled idle-pool errors, causing
  application restarts. Correction `e745250` is integrated by A as `c877793`.
  Rerun passes: Session/Order/Payment/gateway stay live (200), readiness becomes
  503, then recovers; all corrected application restart counts remain zero.
- A Redis listener `5555ae2` is cherry-picked as `fdd1b42`; real Redis outage is
  not rehearsed. No more broad failure runs or suites after A reports the user
  deadline. Remaining work prioritizes functional monitoring/Ops/scaling demo.
- `kubectl top pods` reports real per-workload data; sample consumption is
  Session 45m/28Mi, gateway 41m/28Mi, Order 33m/24Mi, Payment 33m/23Mi,
  web 56m/46Mi, PostgreSQL 6m/29Mi, Redis 8m/9Mi, RabbitMQ 148m/131Mi.
- Bootstrap now reuses a healthy profile; repeated `minikube start` restarted
  node containers on this host. A bootstrap run also failed after its file was
  edited during execution; stable-file rerun passed. No volume/data deletion.
- Quick start: `PATH=/tmp/tablesync-bin:$PATH IMAGE_TAG=fdd1b426ce24 bash
  infra/k8s/bootstrap.sh`; forward `service/web` port 3000. Use a Docker-group
  shell. Real Supabase public settings must be image build arguments.
- C3/C4/C5 remain separate gates. A owns final shared docs/main integration.
