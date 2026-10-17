> Historical handoff: P4/P5 continuation results are recorded in [A.md](A.md).

# Role A session handoff — 2026-10-17

Resume TableSync Role A only. The user paused this session to conserve tokens.
Keep work basic and focused on the educational demo. Do not make live Supabase
account provisioning a prerequisite or add extra production infrastructure.

## Workspace and ownership

- Work in `/tmp/tablesync-role-a`, branch `feat/product-integration`.
- Original `/home/nevedya/Projects/tablesync` remains clean on `main` at `079b178`.
- Inspect status first. Preserve all uncommitted P4 work; do not reset/stash/clean.
- A owns domain services, gateway auth/product routes, migrations/contracts,
  guest/restaurant UI, shared CSS, manifests/lockfile, Compose/Dockerfiles, CI.
- B owns telemetry, Kubernetes, monitoring, k6, Ops UI/lib, dedicated Ops adapter.
  Do not edit B-owned files. Do not merge main or unfinished peer branches.
- No subagents were used. Continue one task at a time with focused commits.

Read AGENTS.md, PROJECT_STATE, STATUS, REBUILD_SPEC, TEAM_HANDOFF, the shared
foundation plan and product-integration plan, plus `docs/progress/A.md`.
The executing-plans skill was found at
`/home/nevedya/.codex/.tmp/plugins/plugins/superpowers/skills/executing-plans/SKILL.md`.
The user's latest direction favors a straightforward educational implementation.

## Completed commits

| Task | Commit | Evidence |
|---|---|---|
| F0 | `97a8733` | Node/npm pin, CI, normal build checking, service smoke; clean install/tests/typecheck/build and Compose passed |
| F1 | `66ea50c32401a8c6fd8a639d24d43b58d359463d` | **FOUNDATION CHECKPOINT published for B**; HTTP types/API docs, repeatable migration runner and six PostgreSQL tests |
| P1 | `696f572` | Registry, concurrent join, scoped guest/staff auth, internal bearer checks; local tests and Compose smoke passed |
| P2 | `ac2294f` | Atomic cart quantities/revisions, owner checks, minor-unit columns/catalog; cart/migration/gateway tests passed |
| P3 | `9177a38` | Frozen checkout, Payment fingerprint/idempotency/outbox, v2 order projection/outbox, reconciliation, bounded consumer retries |

P3 final verification: all workspace tests and **19 real PostgreSQL integration
tests** passed, including on a fresh disposable database. Shared types compiled.
An actual Compose gateway→Payment→RabbitMQ→Order checkout delivered one order
for 68000 paise, and replay retained its checkout ID. Fault/restart cases in the
automated suites use injected failures; a real broker-restart rehearsal was not
performed. Remote CI was added but not run. Live Supabase sign-in is unverified.

## P4 is in progress and UNCOMMITTED

Implemented backend pieces:

- `008-kitchen-lifecycle.sql`: order statuses CONFIRMED/PREPARING/READY/SERVED.
- `services/order/src/kitchen.js`: sequential/idempotent/scoped transitions,
  restaurant listing, seal/unseal with pending-payment/unfinished-order checks.
- Session registry close protocol: persist CLOSING, request Order seal, persist
  CLOSED; restore OPEN on business conflict; leave CLOSING on uncertain response.
  It serializes close requests and joins using database locks.
- Session/Order/gateway routes for kitchen listing/status and session close.
- Compose Session now receives ORDER_SERVICE_URL.
- Added kitchen and closure integration tests. Their missing-module red run was
  observed; **all 3 lifecycle tests now pass**. `git diff --check` passes.
- Installed `qrcode@1.5.4` and `@types/qrcode@1.5.5` in web (30 packages added).
  Package manifest/lockfile changes are uncommitted. QR UI is not implemented.

Uncommitted paths at handoff:

```text
apps/web/package.json
package-lock.json
docker-compose.yml
services/api-gateway/src/routes.js
services/order/server.js
services/session/server.js
services/session/src/registry.js
infra/postgres/migrations/008-kitchen-lifecycle.sql (new)
services/order/src/kitchen.js (new)
services/order/test/kitchen.integration.test.js (new)
services/session/test/close.integration.test.js (new)
docs/progress/A.md and this handoff (session notes)
```

**No P4 frontend work has been written yet.** Guest and restaurant pages still
import `lib/demo.ts` and use Supabase business tables. No browser API adapter,
same-origin backend proxy, guest-cart component or kitchen-ticket component yet.
P4 has not been committed or marked complete. P5 has not started.

## Immediate next work

1. Review existing P4 backend diff; add a direct closure-versus-checkout/cart
   race assertion if needed. Three existing lifecycle tests cover sequential
   transitions, uncertain seal response/retry, and restoration on conflict.
2. Implement `apps/web/lib/api.ts` and allowlisted
   `apps/web/app/api/backend/[...path]/route.ts`: preserve errors/status, bound
   bodies, five-second upstream timeout, strip internal headers, use staff
   Supabase session token or explicit bearer, check Origin for staff mutations.
3. Replace guest/restaurant demo imports with the frozen service APIs. Keep the
   existing visual style. Guest token/join key and checkout operation key live in
   per-table/session sessionStorage. Poll every two seconds without overlap;
   abort on unmount; show stale/error/closed/rejoin states. Preserve operation key
   across lost reply/refresh. Show payment committed/order pending separately.
4. Provide own-line quantity/remove controls; explicit table-level simulated
   payment label; restaurant table cards, sequential kitchen actions, safe close,
   and local QR generation from the current web origin. Remove old paid flags,
   phone requirement, client-only plan limits and third-party QR image URL.
5. Run P4 checks, update progress and commit. Then P5 Playwright journey/access
   tests and final product checks. Stop at P5; F2 cluster rehearsal is joint work.

Use `packages/contracts/src/http.ts`, `docs/API.md`, and `docs/EVENTS.md` as the
agreed contract. Do not invent another backend/auth path. Supabase sign-in can
remain configuration-dependent; local generated-key identity fixtures are the
planned isolated test mechanism. Do not ask the user to provision accounts again.

## Runtime and commands

```bash
cd /tmp/tablesync-role-a
export PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH
npm test
TEST_DATABASE_URL=postgresql://tablesync:tablesync@localhost:5432/tablesync_test_ci npm run test:integration
npm run typecheck
npm run build
```

- Node **22.23.3**, bundled npm **10.9.9**; system Node is 26 and must not be used.
- During F0 the old browser build required synthetic public Supabase variables:
  `NEXT_PUBLIC_SUPABASE_URL=https://build-only.supabase.co` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=build-only-placeholder`. After removing
  active demo imports this requirement may disappear. Do not restore
  `ignoreBuildErrors`. Next's detached TypeScript child returned empty output
  inside the sandbox; approved builds outside the sandbox passed.
- Docker Engine **29.9.0**, Compose **5.6.0**, installed by the user. Docker group
  changes required an approved `newgrp docker` shell for this existing session.
  If a new session still gets socket permission denied, refresh the assigned
  group. Do not change socket permissions. Git metadata writes may also require
  sandbox escalation because `.git` is protected.
- Running Compose project: **tablesync-role-a-f0**. Seven healthy containers,
  images/schema at P3 (001–007), **not the uncommitted P4 images/schema**.
  App DB `tablesync` contains synthetic data and a committed, unserved P3 order.
  Disposable test DBs: `tablesync_test_ci`, `tablesync_test_foundation`.
- Ignored worktree `.env` already contains random INTERNAL_API_SECRET and
  GUEST_TOKEN_SECRET. Preserve it; do not print or commit it. No staff subjects
  configured. Ports: gateway 8080, Postgres 5432, Redis 6379, Rabbit 5672/15672.
- Before P4 runtime smoke: apply 008 with the migration runner, then rebuild the
  same isolated Compose project. Do not delete volumes/data. B may be working
  concurrently; inspect container/worktree state before changing anything.
- Temporary logs: `/tmp/tablesync-p4-db.log` (3 passing lifecycle tests),
  `/tmp/tablesync-p3-final-integration.log` (19 passes),
  `/tmp/tablesync-p3-final-unit.log`, `/tmp/tablesync-p3-compose.log`.
- `/tmp/tablesync-p3-smoke.mjs` demonstrates actual checkout, but **do not blindly
  rerun it**: the existing seating's cart is now committed. Use a new seating or
  isolated test setup after serving/closing the existing synthetic order.
- Private F0 backup: `/tmp/tablesync-f0-pre-migrations.sql`, outside Git.
- Previous live tool session IDs are session-local; do not rely on them.

P4 frontend implementation, typecheck/build, current full integration run,
browser tests, staff sign-in rehearsal, and B/F2 infrastructure integration remain.
