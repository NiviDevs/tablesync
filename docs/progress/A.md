# Role A progress

Branch: `feat/product-integration`. Isolated worktree: `/tmp/tablesync-role-a`.
Starting revision: `079b178d108175af8024137fa463ad41c550c0cb`.
The original checkout remains on `main`; B-owned files are untouched.

## F0 — complete, 2026-10-17

- Scope: reproducible Node/npm pair, normal build type checking, CI, legacy
  service smoke, and deployment/evidence notes.
- Commit: `97a8733` (`chore: establish reproducible development checks`).
- Runtime: verified SHA-256 of official Node 22.23.3 Linux x64 archive; bundled
  npm 10.9.9. Installed under `/tmp`, without changing the system runtime.
- Initial host: Node 26.11.1/npm 12.2.0. Fresh-worktree tests/typecheck/build
  failed before dependency installation (missing Fastify/TypeScript/Next).
- `npm ci` on the pinned pair: passed after allowing registry network access.
  A second offline clean install with the final lockfile passed (134 packages).
- `npm test`: passed all four workspace suites (five test files).
- `npm run typecheck`: passed.
- `npm run build`: passed with normal TypeScript checking and synthetic public
  Supabase settings. Without settings, legacy demo prerendering fails. Inside
  the sandbox, Next's detached TypeScript subprocess returned empty output;
  outside the sandbox the build passed.
- Docker 29.9.0 and Compose 5.6.0 installed by the user during execution.
  Stale supplementary groups initially denied daemon access; an approved
  `newgrp docker` shell now accesses the daemon successfully.
- All four service images built and verified Node 22.23.3/npm 10.9.9.
- Isolated `docker compose -p tablesync-role-a-f0 up -d --build --wait --wait-timeout 180`: passed; all seven containers healthy.
- `npm run smoke:services`: passed through the services gateway; local-demo rejection also verified.
- `git diff --check`: passed.
- Contract/migration changes: none.
- Integration request: B should use the runtime pins from this branch once the
  FOUNDATION CHECKPOINT is published. F1 remains required before the foundation checkpoint.

## F1 — complete, 2026-10-17

- Prerequisite: F0 `97a8733`.
- Commit: this F1 commit (`feat: define service contracts and repeatable migrations`),
  FOUNDATION CHECKPOINT: `66ea50c32401a8c6fd8a639d24d43b58d359463d`.
- Added exact shared HTTP types and [API contract](../API.md). Public routes are
  specified, not yet implemented; P1–P4 supply them. Existing v1 events/units are
  unchanged; v2 types/producers/event documentation land together in P3.
- Added a declared root `pg` dependency (existing locked package), migration
  runner, and byte-identical 001 bootstrap of `init.sql`. Existing 002/003 and
  Supabase migrations are untouched.
- Red check: six real-PostgreSQL tests failed for the absent runner before
  implementation. Green check: all six passed in disposable database
  `tablesync_test_foundation` using unique temporary schemas.
- Verified repeat runs preserve rows; three concurrent runners apply once;
  changed applied SQL fails before later SQL; failed SQL rolls back; existing
  schema needs acknowledged backup and validated baseline; schema drift fails.
- Backed up isolated F0 synthetic database to `/tmp/tablesync-f0-pre-migrations.sql`
  outside Git, verified dump completion, baselined after schema validation,
  reran with no pending migrations, and passed service smoke again.
- Shared HTTP type source compiled with TypeScript strict/noEmit; diff whitespace
  and byte-preservation checks passed.
- Integration request to B: merge this FOUNDATION CHECKPOINT before dependent
  C1/C2 work. Ports remain 8080/8081/8082/8083 and web 3000. Use the documented
  Node/npm pair and migration CLI. Existing `/health` is process health; distinct
  readiness/metrics remain C1 work. Submit service hooks/shared dependency or
  Compose changes to A. Operator access/registration depends on P1 auth.
- Blockers: none for P1. B's contract/port/health review remains a coordination
  action; no B infrastructure implementation or measured telemetry is claimed.

## P1 — complete for local demo, 2026-10-17

- Prerequisite: foundation `66ea50c`. Commit: this P1 commit.
- Added 004 registry/lifecycle migration, conflict-safe joining, server-generated
  participant IDs, scoped guest JWTs, staff membership/operator checks, private
  service bearer checks, and bounded gateway requests.
- Red: registry/auth suites failed for missing modules. Green: auth/private HTTP
  tests and nine database checks passed; ten first joins share one seating and
  repeated/unknown reads preserve counts. Existing workspace tests also pass.
- Compose rebuild/health and side-effect-free registry smoke passed after 004.
- Runtime config uses ignored local random secrets. Supabase live sign-in and
  staff/operator account provisioning remain unverified; per user direction,
  local signing-key tests suffice to continue educational demo development.
- Integration request: B must pass INTERNAL_API_SECRET to all private services,
  GUEST_TOKEN_SECRET to gateway, and apply 004 before requests. Health/ports are
  unchanged. New service runtime uses the frozen API; legacy unsafe public
  gateway routes remain only in explicitly labelled local-demo mode.
- Next: P2 cart quantities, ownership, revisions, and explicit minor units.
