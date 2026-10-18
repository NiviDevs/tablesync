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

- Prerequisite: foundation `66ea50c`. Commit: `696f572`.
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

## P2 — complete, 2026-10-17

- Prerequisite: P1 `696f572`. Commit: `ac2294f`.
- Atomic set/remove with cart revisions, token-derived ownership, server menu
  prices, frozen/sealed checks, and integer INR minor units.
- Migration 005 adds minor columns/catalog and records the one-time conversion;
  original rupee columns and earlier SQL remain unchanged.
- Checks: missing-module red run; ten real-database cart/migration tests pass;
  all workspace tests including gateway forged-owner/price regression pass;
  `git diff --check` passes. Paneer ×2 = 68000 paise; a stale retry cannot add more.
- No B-owned files or public contract changes. Next: P3 immutable checkout.

## P3 — complete, 2026-10-17

- Prerequisite: P2 `ac2294f`. Commit: `9177a38`.
- Added immutable checkout attempts, Payment payload idempotency, stored event
  envelopes/outboxes, v2 snapshot projection, reconciliation, and bounded bad-event
  handling. Original Saga success/failure/timeout tests remain intact.
- Migrations 006/007 are additive. Event contracts and EVENTS.md updated together;
  v1 units/history remain explicit and the new consumer excludes v1.
- Checks: missing-module red run; corrected a SQL UUID/text comparison found by
  real database tests. Final workspace tests and 19 integration tests pass, also
  on a freshly created disposable database. Shared types compile; whitespace passes.
- Injected checks cover lost HTTP response, duplicate delivery, failed compensation,
  new failed-attempt identity, and restart after publish/before marking in both
  outboxes. These are injected faults, not a recorded real broker restart.
- Actual Compose gateway→Payment→RabbitMQ→Order smoke passed: immutable total
  68000 paise, replay retained the checkout ID, and a persistent order was delivered.
- CI adds isolated database/Compose checks; remote CI has not been executed.
- Integration request: Order now needs PAYMENT_SERVICE_URL. Apply 006/007 before
  new images; B must preserve the v2 durable queue/dead-letter setup and avoid
  replacing persisted outbox IDs. Next: P4 kitchen/closure and browser wiring.

## P4 — historical handoff snapshot, 2026-10-17

- Backend kitchen/closure, migration 008, routes, and three passing lifecycle
  integration tests are uncommitted. Web QR dependency installation succeeded.
- Browser adapter/proxy and guest/restaurant migration have not started.
- Current running Compose images/schema remain at P3. Preserve all local work.
- Resume using [the detailed handoff](A-HANDOFF.md). P4 is not complete; P5 pending.

## P4 — complete, 2026-10-17

- Commit: `b8fc4b7` (`feat: connect guest and kitchen screens to services`).
- Preserved and finished the handoff's kitchen/closure backend and migration 008.
- Guest and restaurant pages now use the allowlisted same-origin service proxy;
  no active product import uses the Supabase demo helper. Staff identity helpers
  remain, with a clear configuration message when sign-in is unavailable.
- Added own-line quantity/removal controls, table payment simulation, durable
  browser retry identity, two-second non-overlapping polling, expired/closed/stale
  states, kitchen transitions, table occupancy and locally generated QR codes.
- Four real PostgreSQL lifecycle tests pass, including writes that read OPEN
  before closure seals the cart. Typecheck and production build pass. The build
  needs execution outside this sandbox due to empty TypeScript child output.
- Migration 008 applied to the existing synthetic Compose database. P5 will
  verify the complete browser journey and access boundary on isolated data.
- Limitations: live Supabase sign-in, phone QR access, menu editing, business
  analytics and B's Ops/cluster integration are not verified by P4.

## P5 — complete, 2026-10-17

- Commit: this P5 commit (`test: verify the service-backed restaurant journey`).
- Added Playwright, a local generated-key staff identity, and an isolated harness
  running the actual gateway, Session, Order, Payment and production web server.
  It uses a unique schema in the disposable database and a unique RabbitMQ vhost.
- Final results: all workspace tests pass; all 23 PostgreSQL integration tests
  pass; typecheck and production build pass; all 3 browser tests pass (31.4 s);
  `git diff --check` passes. CI includes browser installation/build/tests but has
  not been run remotely. See [reproduction commands](P5-TESTING.md).
- Browser evidence: independent guests share updates within three seconds,
  edit only their own lines, and submit one table-level simulated order. A lost
  HTTP reply and refresh during a real Payment-process outage preserve checkout
  identity. One persisted order survives an actual Order-process restart.
  Staff progress through preparing/ready/served, close the seating, and the next
  join receives a new session ID. QR data is generated locally.
- Access evidence: anonymous and guest staff calls, foreign session credentials,
  expired guest tokens, ordinary staff Ops access, forged internal headers,
  cross-origin mutation, oversized bodies and non-allowlisted routes are rejected.
  Unknown-table reads preserve row counts. Injected dependency failure shows
  stale state and recovers after refresh. Browser artifacts are ignored by Git.
- Browser tests exposed and fixed two web proxy bugs: Origin must compare with
  the public Host rather than Next's internal bind hostname; empty POST streams
  must not acquire a JSON content type. Tests also corrected fixture module mode,
  accessibility selectors and the required name entry for a new seating.
- Running Compose project `tablesync-role-a-f0` rebuilt successfully at P4,
  migration 008 applied, and side-effect-free gateway service smoke passed.
  No application volume was deleted; no B-owned file changed. Main remains main.
- Limits: Supabase email/callback/cookie refresh and real phone/tunnel access are
  unverified. Test credentials are temporary and do not configure normal staff
  sign-in. The seeded menu remains read-only; dish editing and daily analytics
  are not implemented. Ops/telemetry/scaling stay with B; F2 is still joint work.

## Owner feature completion — 2026-10-18

- User requested direct feature implementation and explicitly skipped further
  automated testing. Scope expands beyond P5 to the remaining owner features.
- Added dish creation/editing, descriptions, emoji, rupee price inputs and
  availability controls at `/restaurant/menu`, using the existing Order catalog.
- Added `/restaurant/dashboard`: simulated sales, served-order count, quantity,
  average order, ordering guest count, daily chart/counts, per-dish performance,
  table sales, current occupancy and seated guest count. Filters cover 1/7/30/90
  days through a selected date; clicking a chart day opens its dish breakdown.
- Analytics use all served orders in the period and Asia/Kolkata order dates;
  there are no fabricated sales figures or 100-order truncation.
- Restored table creation and removal for unused tables; seating history stays.
- Added common owner navigation and updated the landing copy to match table-level
  simulated payments. Existing staff authentication and private service ownership
  apply to every new route. No new dependency, migration or event contract.
- Automated test suites were not run for this expansion, as requested. Production
  compilation is recorded separately; P5 test results apply to the earlier code.
- Ops/infrastructure remain B-owned. Live Supabase identity and phone/tunnel
  access still depend on the existing environment; no accounts were provisioned.
- Production build passes with the new owner routes. Existing Compose Session,
  Order and gateway images rebuilt and started successfully; no volumes deleted.
