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
