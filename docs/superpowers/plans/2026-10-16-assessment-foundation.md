# TableSync shared foundation and integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for a contributor implementing tasks directly, or superpowers:subagent-driven-development when the user explicitly selects delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish shared contracts and a runnable baseline before two contributors work independently.

**Architecture:** Preserve the four existing services. Product and infrastructure plans share this contract and converge in one integrated demonstration.

**Tech Stack:** Existing Node.js/Fastify, Next.js/TypeScript, PostgreSQL, Redis, RabbitMQ; Minikube, Prometheus, Grafana, k6.

**Spec:** [Approved rebuild specification](../../REBUILD_SPEC.md), approved in conversation on 2026-10-16. This execution plan remains pending review; no implementation has started.

## Global Constraints

- Seated guests, not advance reservations.
- Keep backend JavaScript and frontend TypeScript; a language rewrite is not a prerequisite.
- Use the same application images and contracts for Compose and Kubernetes.
- Represent money in integer minor units with an explicit currency.
- Gateway, Order, Payment, and web initially have one replica; only Session is the initial HPA candidate.
- Preserve existing data. No automatic Supabase-to-service migration, destructive reset, real payments, or new domain service.
- No fake telemetry. Temporary public access is not cloud-hosted compute.
- Both child plans inherit all constraints here and in the approved spec.

## Review Focus

1. Two guests join an empty table simultaneously: exactly one seating session (P1).
2. Retried checkout has a different operation key: the same frozen revision cannot be bought twice (P3).
3. Payment commits but the HTTP reply is lost: reconciliation completes without a second charge (P3/P4).
4. Monitoring stops while a page remains open: old values become stale, not healthy or zero (C4).
5. A seating session closes while a guest edits: no write can slip into a closed session (P1/P2/P4).

## Plan order and ownership

1. A and B complete F0 and F1 together. A owns the shared contract commit.
2. A follows [the product plan](2026-10-16-product-integration.md): P1–P5.
3. B follows [the infrastructure plan](2026-10-16-cloud-observability.md): C1–C5. C1 hooks are merged with A; C5 waits for P1/P2 read safety.
4. Both complete F2 after P5/C5.

Use separate branches/worktrees when implementation begins. A owns gateway/domain/schema/web product changes; B owns `infra/k8s`, `infra/monitoring`, `infra/k6`, and the Ops page. B submits service instrumentation hooks separately for A to integrate. A owns root package/lockfile changes; both agree dependency additions before installation.

Each task ends with its listed checks, a STATUS evidence entry, and a focused commit. Do not claim test commands in this plan have already passed. Missing Docker or identity-provider configuration is a prerequisite to resolve, not an excuse to mark a gate complete.

## Shared contract to commit in F1

Create `packages/contracts/src/http.ts` as the browser-facing type source. Create `docs/API.md` documenting these exact routes and meanings. Do not expose internal services publicly.

### Data types

```ts
export type Money = { amountMinor: number; currency: 'INR' };
export type OrderStatus = 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED';
export type CheckoutStatus = 'PENDING' | 'COMMITTED' | 'FAILED';
export type CartLine = { id: string; ownerId: string; menuItemId: string;
  name: string; quantity: number; unitPriceMinor: number };
export type TableView = { code: string; name: string; restaurantId: string;
  session: null | { id: string; status: 'OPEN' | 'CLOSING' | 'CLOSED'; openedAt: string;
    participants: { id: string; name: string }[] } };
export type CartView = { sessionId: string; revision: number;
  state: 'EDITING' | 'PENDING' | 'COMMITTED' | 'FAILED';
  items: CartLine[]; total: Money };
export type CheckoutView = { id: string; sessionId: string; status: CheckoutStatus;
  paymentSagaId: string | null; orderId: string | null; total: Money; simulated: true };
export type OrderView = { id: string; sessionId: string; restaurantId: string;
  tableCode: string; status: OrderStatus; items: CartLine[]; total: Money; createdAt: string };
export type ApiError = { error: { code: string; message: string }; requestId: string };
```

Use UUIDs for server-issued IDs, uppercase canonical table codes, quantities 1–20, guest names 1–80 trimmed characters, and integer prices. Reject malformed payloads with 400, missing credentials with 401, wrong scope with 403, missing entities with 404, state/key conflicts with 409, rate excess with 429, and unavailable dependencies with 503. Preserve those codes through the web proxy.

### Public API (gateway)

| Method/path | Request | Response and authorization |
|---|---|---|
| GET `/v1/tables/:code` | None | `TableView`; public; no writes |
| GET `/v1/menu?tableCode=...` | Known table | `{items: {id,name,description,emoji,unitPriceMinor,available}[],currency:'INR'}`; public |
| POST `/v1/table-sessions/join` | `{tableCode,name,joinKey}`; UUID joinKey | 201 `{table:TableView,participant:{id,name},guestToken}`; replay 200 |
| GET `/v1/sessions/:id/cart` | Guest bearer token | `CartView`; member only; no writes |
| PUT `/v1/sessions/:id/cart/items/:menuItemId` | `{quantity,expectedRevision}` | `CartView`; set own quantity; no increment endpoint |
| DELETE `/v1/sessions/:id/cart/items/:menuItemId` | `{expectedRevision}` | `CartView`; own line only |
| POST `/v1/sessions/:id/checkouts` | `{operationKey,expectedRevision}` | 202 `CheckoutView` until order delivery; 200 replay; any member simulates the table |
| GET `/v1/checkouts/:id` | Member bearer token | `CheckoutView`; committed payment with null orderId means delivery pending |
| POST `/v1/checkouts/:id/retry` | `{operationKey}` | New attempt only after terminal failed/compensated state; ordinary retries use original create request |
| GET `/v1/restaurant/tables` | Staff bearer token | `{tables:TableView[]}` scoped to membership |
| GET `/v1/restaurant/orders` | Staff bearer token | `{orders:OrderView[]}`; most recent 100 scoped to membership |
| PATCH `/v1/orders/:id/status` | `{status:OrderStatus}` | `OrderView`; staff; same target idempotent, skipped/reversed transition 409 |
| POST `/v1/sessions/:id/close` | Staff bearer token | `TableView`; reject unfinished orders/checkouts; same close idempotent |
| GET `/v1/ops/overview` | Operator bearer token | Defined in C4; no arbitrary query arguments |

Normal public checkout always uses deterministic success. Failure/timeout controls remain test-only internal inputs, enabled explicitly in isolated test environments. The UI must say **Simulate table payment — no money is collected**. Do not retain “your share” as the action label for paying the whole table.

### Internal API and trust boundary

Service calls require a shared internal bearer secret and occur only on private networking. Gateway derives guest/staff context from verified credentials; services accept forwarded `x-participant-id`, `x-session-id`, and `x-restaurant-id` only with that internal credential. The public proxy drops caller-supplied internal headers. Keep the internal secret server-only, outside images and logs.

- Session implements public table/join/list data through corresponding internal routes and `GET /v1/sessions/id/:id`; reads never create data. Gateway issues the guest token after Session returns its server-generated identity.
- Order implements cart/menu/order routes and owns `POST /v1/checkouts` with `{sessionId,participantId,operationKey,expectedRevision}`. `GET /v1/checkouts/:id` exposes its stored snapshot status.
- Order calls Payment `POST /v1/payment-sagas` with `{checkoutId,sessionId,idempotencyKey,payments:[{participantId,amountMinor,outcome}]}`. `idempotencyKey` equals checkoutId. Payment exposes `GET /v1/payment-sagas/by-checkout/:checkoutId` for reconciliation.
- Order owns `POST /v1/sessions/:id/seal` and `/unseal` for close coordination. Sealing locks the cart and refuses pending or unfinished orders. Session marks `CLOSING`, seals Order, then marks `CLOSED`; retries resume this sequence. If sealing returns a business conflict, Session restores `OPEN`. Unknown transport outcome stays `CLOSING` until reconciliation; do not blindly unlock it.
- Introduce `payment.saga_committed.v2` with `checkoutId`, `sagaId`, `sessionId`, `totalAmountMinor`, and `currency:'INR'`. Introduce matching `order.confirmed.v2` money/snapshot fields. Existing v1 contracts remain documented for legacy data; do not silently change their units. New consumers ignore legacy events for the new path and record that exclusion.
- Event envelopes retain id, type, version, occurredAt, correlationId, data. New v2 event envelopes use numeric `version: 2`. Use the stored outbox ID as event ID. Broker publish confirmation precedes marking an event published.

## F0: Reproducible baseline

**Owner:** A, with B checking container tooling.
**Files:** modify root `package.json`, `package-lock.json`, `apps/web/package.json`, `apps/web/next.config.ts`, `.env.example`; create `.nvmrc`, `scripts/service-smoke.mjs`, `.github/workflows/ci.yml`; update DEPLOYMENT and STATUS.
**Interfaces:** produces `npm run smoke:services` and a recorded supported Node/npm pair; wire `npm run test:integration` when P3 provides runnable suites and finalize it in P5. CI uses that same pair; no platform-specific global dependencies in app scripts.

- [ ] Record `git rev-parse HEAD`, `node --version`, `npm --version`, `docker version`, and existing `npm test`, `npm run typecheck`, `npm run build` results in STATUS. A failed command remains a baseline failure.
- [ ] Use the existing container's Node 22 major initially; resolve and record an exact supported patch and matching npm during execution. Verify package engine compatibility before updating the lockfile. Pin all CI/container runtimes to the tested pair; do not use Node 26 to retain a known workaround.
- [ ] Restore normal build type checking after the pinned runtime builds. Replace `next lint` with an actual configured ESLint command or remove it from required gates with a documented reason; do not claim it passed.
- [ ] Add a service smoke script using Node assertions against gateway health, the existing `/v1/table-sessions/SAGE-12` route, and its persisted service runtime. This baseline route may create its session; document that legacy side effect. Switch the script to the side-effect-free `/v1/tables/SAGE-12` contract when P1 lands. It must fail if the runtime is `local-demo`, return nonzero on a failed check, and never erase data.
- [ ] Add CI `npm ci`, `npm test`, `npm run typecheck`, `npm run build`; add Compose integration after P3 provides its tests. Avoid secrets for unit/build jobs; use synthetic credentials only for isolated Compose tests.
- [ ] Run the recorded baseline checks again; commit `chore: establish reproducible development checks`. Docker installation itself is environment setup, not a repository code change.

## F1: Contract checkpoint and migration runner

**Owner:** A; B reviews ports, health, and metric requirements before branching.
**Files:** create `packages/contracts/src/http.ts`, `docs/API.md`, `infra/postgres/migrate.mjs`, `infra/postgres/test/migrations.test.mjs`; modify `packages/contracts/src/events.ts`, event tests, `.env.example`, and `docs/EVENTS.md` when v2 producers land.
**Interfaces:** migration runner takes `DATABASE_URL` and `MIGRATIONS_DIR`, records filename/checksum in `schema_migrations`, applies SQL once under a PostgreSQL advisory lock, and fails on modified applied files. Internal service ports remain gateway 8080, Session 8081, Order 8082, Payment 8083; web 3000.

- [ ] Commit the exact shared HTTP types and API semantics above. Confirm both contributors use these names and money units before caller implementation.
- [ ] Add migration integration tests: two runs preserve row counts; concurrent runners apply once; modifying an applied migration is rejected. Run `node --test infra/postgres/test/migrations.test.mjs` against a disposable test database and observe failure before implementation.
- [ ] Implement the runner using the existing `pg` dependency through a declared workspace/root dependency. Bootstrap the existing schema as version 001 and run 002/003 idempotently; do not modify their SQL contents. Existing volumes are backed up and baselined only after verifying expected schema. Treat Supabase migrations as a separate history and leave them untouched.
- [ ] Run the migration tests and service smoke; document additive-schema rollback constraints. Commit `feat: define service contracts and repeatable migrations`.

## F2: Final integration and teammate rehearsal

**Owners:** A and B. Depends on P5 and C5.
**Files:** finish `docs/DEPLOYMENT.md`, `docs/DEMO.md`, `docs/DEFENSE.md`, `docs/STATUS.md`, README; create `docs/evidence/README.md` and a dated evidence directory.
**Interfaces:** produces a tested setup/runbook and evidence index. No new product features.

- [ ] Have the other contributor follow DEPLOYMENT on a clean cluster/namespace without verbal corrections. Include exact tool/image versions, secrets setup, migrations, seeds, builds, startup, and non-destructive shutdown.
- [ ] Run unit/contract tests, typecheck, build, disposable Compose integration, and Playwright journey. Record each result and revision once; do not expand testing without a new failure or unresolved concern.
- [ ] Open the local web origin through a Quick Tunnel only after access tests pass. Regenerate QR URLs for its current address. Verify two phones/browsers, checkout delivery, kitchen progression, and an operator-only Ops view. Keep load testing on loopback/private access.
- [ ] Capture C5 metrics, k6 results, actual pod replacement, cooldown, and a backup recording of a real rehearsal. Redact tokens and personal data. Note external identity-provider/network dependence and tunnel lifetime.
- [ ] Update current-state claims and mark only verified capabilities complete. Keep limitations about local compute, simulated money, one node, and unproven latency improvements visible. Commit `docs: record verified assessment demonstration`.

## Self-review and handoff

Coverage: product/access/snapshot/migration requirements map to P1–P5; orchestration/observability/scaling map to C1–C5; CI and repeatability map to F0/F1/F2. Optional analytics and persistent cloud hosting intentionally have no task. All five Review Focus cases map to explicit tests in child plans.

Implementation is not authorized by specification approval alone. Review these three linked plans before execution. Intended handoff is to the user's teammates/smaller agents; this session has not selected or started an execution agent.
