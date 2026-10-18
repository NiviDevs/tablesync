# Implementation and evidence ledger

Baseline: 2026-10-16. No runtime verification was performed during the documentation reset.

| Area | Status | Evidence / next proof |
|---|---|---|
| Documentation reset | Verified (documentation checks only) | Local links in 16 active Markdown documents resolve; `git diff --check` passes; 11 archived originals match the baseline revision. |
| Approved design and detailed execution plans | Documentation written; implementation pending | User approved the spec on 2026-10-16. Shared, product, and infrastructure plans await execution-plan review. |
| F0 development checks | Verified locally | Node 22.23.3/npm 10.9.9 clean install, unit/contract tests, typecheck, production build, image builds, and isolated Compose/service smoke passed on 2026-10-17. See [Role A progress](progress/A.md). |
| F1 contracts and migrations | Verified locally | HTTP contract defined for callers; six real-PostgreSQL migration tests pass. Isolated F0 backup/baseline/repeat and post-migration service smoke pass. Product routes and v2 producers remain P1–P4 work. |
| Browser product | Service-backed | Guest, tables and kitchen now use the gateway through the web proxy. See P4/P5 evidence below. |
| Service slice | Implemented, unverified | Compose and service source exist. Rerun tests and persistence/checkout smoke checks. |
| Staff and guest authorization | Verified with local test identities | Scoped guest JWTs, staff membership, origin and internal-header checks pass. Live Supabase sign-in remains unverified. |
| One authoritative browser/API path | Implemented | Guest and restaurant business calls use the services. Supabase is retained for staff identity only. |
| Checkout and kitchen correctness | Verified locally | Twenty-three PostgreSQL integration tests pass, including lifecycle and closure races. |
| Kubernetes deployment | Proposed | No manifests or verified cluster. |
| Prometheus/Grafana/Ops | Proposed | Preview UI and limited service metrics only. |
| HPA and k6 evidence | Proposed | Existing k6 asset checks health only. |
| Public QR access | Proposed | Tunnel and browser flow not verified. |
| Persistent cloud deployment | Deferred from critical path | Existing configuration is not deployment evidence. |
| CRM, reservations, broad analytics | Deferred | Outside the immediate assessment scope. |

## Add an evidence entry after each work package

```text
Work package:
Commit:
Date and environment:
Command or manual procedure:
Observed result:
Evidence path (if any):
Known limits:
```

Keep evidence small and reproducible. Do not commit credentials, customer data, or unredacted logs. Do not mark a row verified because a page rendered or a configuration file was added.

## Documentation reset evidence — 2026-10-16

- Scope: documentation only; source audit based on baseline commit `2c2deb5`.
- Local relative Markdown links: 16 active documents checked; all targets exist.
- Archive preservation: 11 historical originals compared byte-for-byte against baseline Git content.
- Diff whitespace: `git diff --check` passes.
- Limits: no application tests, hosted checks, migrations, or Kubernetes runs performed. The rebuild design remains proposed.

## Design approval and execution planning — 2026-10-16

- User approved REBUILD_SPEC after reviewing the documentation baseline.
- Added three linked plans: shared foundation/integration, product integration, and cloud observability.
- Plans define file ownership, public/internal interfaces, task dependencies, failure cases, verification commands, and acceptance evidence.
- No application code, dependencies, infrastructure, or database state changed. Plan test commands are instructions for future execution, not claimed passing results.
- Documentation verification: all relative links in 18 active/planning documents resolve; all three plans contain required sections and no TODO/TBD/FIXME placeholders; `git diff --check` passes.

## F0 baseline execution — 2026-10-17

- Work package: F0, Role A on `feat/product-integration`, isolated worktree
  `/tmp/tablesync-role-a`; starting revision `079b178d108175af8024137fa463ad41c550c0cb`.
- Commit: `97a8733` (`chore: establish reproducible development checks`).
- Environment: Linux x64. Initial host Node 26.11.1/npm 12.2.0; no fresh-worktree
  dependencies. Initial `npm test`, `npm run typecheck`, and `npm run build`
  failed for missing dependencies; these were not passing baseline results.
- Supported runtime: official Node 22.23.3 archive verified against its SHA-256,
  bundled npm 10.9.9. Runtime installed under `/tmp`, system runtime unchanged.
- Checks: `npm ci` passed (134 packages); `npm test` passed all four workspace
  suites; `npm run typecheck` passed; production build passed with TypeScript
  checking enabled and synthetic public Supabase settings from CI.
- Observed failures: without Supabase settings, legacy demo prerendering fails.
  Sandboxed Next.js detached TypeScript CLI capture was empty; approved build
  outside the sandbox passed. The old comment attributing this to Node 26 was
  removed with `ignoreBuildErrors`.
- Docker: user installed Docker Engine 29.9.0/Compose 5.6.0 during execution.
  Access verified through a shell refreshing the account's Docker group.
- Smoke rejection check: pointed at an actual local-demo gateway, the new smoke
  script returned exit 1 as required.
- All four service images built and asserted the pinned runtime pair.
- `docker compose -p tablesync-role-a-f0 up -d --build --wait --wait-timeout 180`
  exited 0, with all seven containers healthy. `npm run smoke:services` passed
  through the gateway to persisted Session/Order data.
- Limits: CI workflow is added, not remotely executed. Migrations, browser integration, and Kubernetes remain unverified. Unsupported `next lint` was removed; lint is not a passing gate.

## F1 contract and migration checkpoint — 2026-10-17

- Work package: F1, following F0 `97a8733`, same Linux/Node/npm environment.
- Commit: this F1 commit (`feat: define service contracts and repeatable migrations`).
- Contract: exact HTTP types from the shared plan in `packages/contracts/src/http.ts`;
  [API.md](API.md) records route, ownership, money, identity, and retry semantics.
  This defines future callers; it does not claim new product routes work yet.
- Migration history: 001 copies `init.sql` unchanged; existing 002/003 and
  Supabase history remain byte-identical. Declared root `pg` uses the existing
  locked version. Runner uses a PostgreSQL advisory lock and transactional
  filename/checksum ledger; modified/missing applied history fails.
- Test procedure: `TEST_DATABASE_URL=.../tablesync_test_foundation node --test
  infra/postgres/test/migrations.test.mjs` against isolated PostgreSQL 16. All six
  tests first failed for the missing runner, then passed after implementation.
  Each test cleans only its own schema in the explicitly disposable database.
- Observed: repeat application preserves data, three concurrent runners apply
  once, checksum changes prevent later SQL, SQL errors roll back, explicit
  existing-schema baseline preserves rows, and schema mismatch rejects baseline.
- Isolated F0 database backed up privately under `/tmp`, checked for dump
  completion, validated/baselined, then rerun with no pending SQL. Service smoke
  passed afterward. No real customer/hosted database was accessed or migrated.
- Shared HTTP types compile with strict TypeScript/noEmit. `git diff --check`
  and original-SQL byte comparisons pass. V1 events are unchanged; v2 event
  implementations/tests/docs remain a single P3 change.
- Limits: backup restore was not rehearsed; application rollback must retain
  compatible additive schema. Browser journey, access controls, readiness,
  Kubernetes, metrics, and autoscaling remain unverified.

## P1–P3 product backend integration — 2026-10-17

- Prerequisites/commits: foundation `66ea50c`, P1 `696f572`, P2 `ac2294f`,
  P3 this commit. Role A worktree remains isolated; main and B-owned files untouched.
- Checks: workspace tests pass; 19 database integration tests pass on a fresh
  disposable PostgreSQL database. Shared HTTP/event types compile.
- Actual Compose checkout smoke passed through gateway, Payment, RabbitMQ, and
  Order. Replayed operation returned the same ID and delivered one persistent
  order for 68000 paise. This is a simulated table payment.
- Contracts/migrations: API.md and EVENTS.md record the new scoped routes, explicit
  money, immutable snapshots, v2 events, and preserved v1 history; additive 004–007.
- Fault evidence uses injected responses/confirm callbacks. No real broker-restart
  rehearsal, browser journey, live Supabase staff setup, or cluster claim yet.
- Per user direction, live staff account provisioning does not block the educational
  demo implementation; local generated-key auth tests remain the verification.

## P4 browser and lifecycle integration — 2026-10-17

- Work package: P4, Role A, `feat/product-integration`.
- Guest and restaurant business data now use the service API through an
  allowlisted same-origin Next.js proxy. Supabase remains staff identity only.
- Four PostgreSQL lifecycle tests, typecheck, production build and diff checks
  pass. Closure rejects cart/checkout requests even after an earlier OPEN read.
- UI supports shared cart ownership, simulated table payment/recovery, kitchen
  progression, seating closure, stale/error states and local QR generation.
- Migration 008 applied additively to the synthetic Compose database.
- Full browser/access verification is P5. Live identity, phones, menu editing,
  business analytics and infrastructure integration remain outside this evidence.

## P5 browser and access evidence — 2026-10-17

- Work package: P5 on `feat/product-integration`, following P4 `b8fc4b7`.
- Environment: local Linux, Node 22.23.3/npm 10.9.9, PostgreSQL/Redis/RabbitMQ
  from the existing isolated Compose project; production Next.js and Chromium.
- Results: workspace tests pass; 23 PostgreSQL integration tests pass;
  typecheck/build pass; 3 Playwright tests pass in 31.4 seconds; diff check passes.
- Actual service processes verify lost-response recovery, pending refresh,
  Payment restart, Order restart persistence, one order, kitchen progression,
  closure and distinct subsequent seating. Shared UI updates meet the tested
  three-second bound. Local generated-key identities verify access boundaries.
- Fixed proxy public-origin comparison and empty-POST forwarding based on the
  browser failures. Runtime Compose rebuild and gateway smoke also pass.
- [Commands and test isolation](progress/P5-TESTING.md). Remote CI is configured,
  not executed. Live Supabase sign-in, phone/tunnel and B/F2 infrastructure
  integration remain unverified. Dish editing and daily analytics remain absent.
