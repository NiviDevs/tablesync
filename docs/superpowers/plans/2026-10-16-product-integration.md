# TableSync product integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for a contributor implementing tasks directly, or superpowers:subagent-driven-development when the user explicitly selects delegation. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the guest and restaurant journey use one safe, persistent service backend.

**Architecture:** Session owns seating, Order owns cart/snapshot/kitchen state, and Payment retains its deterministic Saga. Gateway validates identities; Next.js proxies a single public API.

**Tech Stack:** Existing Fastify/PostgreSQL/Redis/RabbitMQ, Next.js/TypeScript, Supabase staff identity, Node tests, Playwright.

**Spec:** [Approved rebuild specification](../../REBUILD_SPEC.md), approved in conversation on 2026-10-16. This execution plan remains pending review; no implementation has started.

## Global Constraints

Read [the shared plan](2026-10-16-assessment-foundation.md), including its exact types, routes, trust boundary, and global constraints. F0/F1 must be committed first. No direct browser business-table writes, new domain services, independent-payer claims, destructive resets, or unlabelled simulations.

## Review Focus

- Concurrent first joins produce one active session (P1).
- A client retries a set-quantity request after a lost response (P2).
- Broker restart or duplicate delivery does not create another order (P3).
- A guest remains open while staff closes the table (P4).
- Guest/ordinary staff tokens cannot read Ops or mutate another identity (P1/P5).

## File boundaries

Split only touched responsibilities out of large server files. Keep `server.js` as a composition/startup file. New modules are `session/src/registry.js`, `order/src/cart.js`, `order/src/checkout.js`, `order/src/kitchen.js`, `payment/src/persistence.js`, and one outbox module per producer. Gateway gets `src/auth.js` and `src/routes.js`; web gets `lib/api.ts` and small guest/kitchen components. Do not perform unrelated reformatting.

## P1: Table registry, joining, and credential boundary

**Owner:** A. Depends on F1.
**Files:** create `infra/postgres/migrations/004-table-registry.sql`, `services/session/src/registry.js`, `services/session/test/registry.integration.test.js`, `services/api-gateway/src/auth.js`, `services/api-gateway/test/auth.test.js`; modify Session/gateway servers, packages, `.env.example`.
**Interfaces:** `createRegistry({pool})` returns `getTable(code)`, `joinTable({code,name,joinKey})`, `getSession(id)`, `listTables(restaurantId)`; return the shared TableView/member shapes. `createAuth({issuer,audience,jwks,staffAssignments,guestSecret})` exposes `verifyStaff(token)`, `issueGuest({participantId,sessionId})`, `verifyGuest(token)`.

- [ ] Write registry integration tests with real PostgreSQL: unknown `getTable` returns 404 without changing session count; ten simultaneous first joins share one session; repeated joinKey returns the same participant; the same key with a different name/table returns 409. Expected assertions include `new Set(results.map(r=>r.table.session.id)).size === 1` and unchanged counts after reads.
- [ ] Write auth tests using locally generated signing keys: invalid signature/issuer/audience/expiry fails; a valid staff token without membership is 403; an ordinary staff role cannot access Ops; a guest token cannot act for another session. Run `node --test services/api-gateway/test/auth.test.js` and registry integration with `TEST_DATABASE_URL`; confirm failing assertions or missing modules before implementation.
- [ ] Add a known-table registry, session lifecycle columns, partial uniqueness for active sessions, and unique join keys. Backfill existing codes/identity additively. Seed Juniper House and SAGE-12 explicitly; do not create tables during reads. Preserve closed sessions and remove the old all-history uniqueness on session table code only when the replacement active constraint exists.
- [ ] Implement concurrent join using database transactions and conflict-safe inserts. Generate participant IDs server-side. Issue HS256 guest JWTs with a dedicated secret, explicit issuer/audience, and eight-hour expiry; validate membership/session status on writes. Supabase staff JWT verification uses JWKS and a server-only JSON mapping of subject to restaurant/roles. Do not trust user metadata for roles.
- [ ] Use `jose` for JWT validation, with explicit algorithm allowlists. Provision real staff/operator subjects through existing Supabase sign-in for rehearsal; unit tests use local keys. Verify redirects/callbacks separately rather than making CI depend on email delivery.
- [ ] Enforce internal bearer credentials, sanitize forwarded identity headers, cap body size at 16 KiB, and rate-limit join to 30/minute/IP and mutations to 120/minute/credential. Add tests for oversized payload and spoofed internal headers. Keep singleton gateway limits process-local for this scope and document that boundary.
- [ ] Run registry/auth tests, existing Session/gateway tests, and migration tests. Commit `feat: add table registry and scoped access`.

## P2: Cart concurrency and explicit money units

**Files:** create `infra/postgres/migrations/005-cart-revisions.sql`, `services/order/src/cart.js`, `services/order/test/cart.integration.test.js`; modify Order/gateway routes and contracts.
**Interfaces:** `createCartStore({pool,sessionClient})` exposes `readCart(sessionId)`, `setQuantity({sessionId,participantId,menuItemId,quantity,expectedRevision})`, `removeItem({...})`. Returns CartView. Menu prices use `unitPriceMinor`; paneer is 34000 INR minor units.

- [ ] Add tests: setting quantity 2 twice with the same old revision cannot increment to 4; a stale revision returns 409; another owner's ID is ignored/rejected; quantity 0/21/fractional is rejected; empty cart reads do not insert rows. Assert paneer quantity 2 yields `{amountMinor:68000,currency:'INR'}`.
- [ ] Run `node --test services/order/test/cart.integration.test.js` against the disposable integration database and confirm failure before implementation.
- [ ] Add explicit minor-unit columns and a migration marker. Backfill old rupee columns exactly once by multiplying by 100; leave original columns intact for baseline rollback. Cover cart items, orders/items, Saga totals/fees, payment intents, and fee ledger in owner-specific follow-up SQL within this migration sequence. Test a second migration run leaves 34000 unchanged. Do not silently repurpose existing v1 fields.
- [ ] Implement set/remove inside a transaction locking the cart, checking revision and EDITING state, and incrementing revision once. Check Session OPEN state; all cart writes also honor the local seal flag from P4, which serializes closure. Use server-owned menu prices and names; a browser price never changes totals.
- [ ] Run cart/migration tests and gateway route tests with forged price/owner input. Commit `fix: make cart updates atomic and money explicit`.

## P3: Frozen checkout, payment retry, and durable order projection

**Files:** create `infra/postgres/migrations/006-checkout-snapshots.sql`, `infra/postgres/migrations/007-payment-outbox.sql`, `services/order/src/checkout.js`, `services/order/src/outbox.js`, `services/payment/src/persistence.js`, `services/payment/src/outbox.js`, `services/order/test/checkout.integration.test.js`, `services/payment/test/retry.integration.test.js`; modify Order/Payment/gateway servers, Saga integration, event contracts/tests, EVENTS.
**Interfaces:** Order `createCheckout({sessionId,participantId,operationKey,expectedRevision})`, `getCheckout(id)`, `retryCheckout({id,operationKey})`, `reconcilePending()` return CheckoutView. Payment `persistSaga({checkoutId,sessionId,idempotencyKey,payments})` returns the same saga for the same payload; mismatched payload/key is 409. Outbox `flushOutbox()` publishes stored envelopes with confirm-channel acknowledgement.

- [ ] Write concurrent integration assertions: same revision plus different operation keys produces one snapshot/Saga/order; replayed key with altered payload returns 409; cart mutation after freeze returns 409; order price remains the frozen price after menu changes. Tests inspect persisted counts, not only response codes.
- [ ] Add injected-fault tests: drop HTTP reply after Payment commit, restart Payment after DB commit before publish, restart Order after publish before outbox marking, deliver the committed event twice, and retry terminal compensated failure. Assert one order, stable event IDs across retries, compensated failed attempt creates no order, and a new successful attempt can create exactly one order. Existing deterministic Saga success/failure/timeout tests remain.
- [ ] Run the new integration tests and observe failures. Implement checkout rows/lines with unique operation key and one non-failed attempt per cart revision, a frozen total/currency, and a persistent status. Lock the cart for snapshot creation. Failed explicit retry makes a new attempt identity while preserving the prior snapshot/audit history; never delete the failed attempt.
- [ ] Make Order orchestrate Payment using checkoutId as its idempotency key. Store Payment state and event outbox rows in the same transaction. Protect concurrent same-key requests with transaction locking/uniqueness; return the winning result after conflict. Include a canonical payload fingerprint so reused keys cannot change payer amounts.
- [ ] Publish `payment.saga_committed.v2`; project solely from the identified immutable snapshot. Check session, currency, and total match. Add unique checkout ID on consolidated orders. Persist order and `order.confirmed.v2` outbox in one transaction; event IDs are stored once.
- [ ] Run bounded background reconciliation every five seconds, with timeouts and graceful shutdown. Resolve Payment by checkoutId before any resubmission. A network timeout stays PENDING. Reconcile a verified terminal failure to FAILED and unlock for an explicit retry; committed payment stays frozen until order delivery. Each service queries only its owned tables or another service's API.
- [ ] Give malformed/permanently mismatched events a dead-letter path after bounded retries; do not hot-loop requeue forever. Retriable broker failures keep durable outbox entries. Test a malformed event cannot starve the following valid event.
- [ ] Run payment/Order/contract tests plus `npm run test:integration`. Commit `fix: persist immutable checkout and reliable payment delivery`.

## P4: Kitchen lifecycle, safe closure, and browser integration

**Files:** create `infra/postgres/migrations/008-kitchen-lifecycle.sql`, `services/order/src/kitchen.js`, `services/order/test/kitchen.integration.test.js`, `services/session/test/close.integration.test.js`, `apps/web/lib/api.ts`, `apps/web/app/api/backend/[...path]/route.ts`, `apps/web/components/guest-cart.tsx`, `apps/web/components/kitchen-ticket.tsx`; modify guest/restaurant pages, auth callback, gateway routes, next config, `.env.example`.
**Interfaces:** `advanceOrder({orderId,restaurantId,status}) -> OrderView`; `sealSession(sessionId)` / `unsealSession(sessionId)` are idempotent Order operations. Session `closeSession({sessionId,restaurantId}) -> TableView` resumes CLOSING safely. Web `api<T>(path,options) -> Promise<T>` preserves ApiError codes.

- [ ] Test valid sequential kitchen transitions; repeated target succeeds; skips/backward transitions and foreign restaurant access fail. Test closing with unfinished orders fails. Race closure against cart update/checkout and assert no new purchase enters a sealed/closed session. Crash after sealing and retry closure; it must finish without erasing the order.
- [ ] Run kitchen/closure tests to see failure. Extend order status constraint, implement compare-and-set updates, and implement the shared plan's CLOSING/seal protocol. A conflict restores OPEN; a transport uncertainty remains CLOSING with a retryable status. Closed-session reuse starts a new session ID.
- [ ] Add a same-origin web proxy that forwards only documented routes/methods to `GATEWAY_URL`; never accept an arbitrary upstream URL. Read staff access tokens from existing server Supabase session helpers; pass guest bearer tokens from requests. Drop internal headers, bound body size, preserve upstream status, and use a five-second request timeout. Keep session cookies secure and check Origin on cookie-authenticated mutations.
- [ ] Switch browser calls from `lib/demo.ts` to `lib/api.ts`. Store guest token/join key per table in sessionStorage; never use it as a server authority without verification. Poll every two seconds without overlapping requests; abort on unmount. Show stale data after three missed refreshes, retry controls, and expired-token rejoin behavior.
- [ ] Replace per-guest paid flags with table-level simulated checkout and persistent operationKey per attempt. Show payment committed/order pending distinctly. Add quantity/removal controls, owner table cards, kitchen transitions, and session close. Remove client-only plan limits. Generate QR from the current configured web origin with a local QR library rather than a third-party image endpoint.
- [ ] Preserve Supabase identity helpers, but remove the demo helper from active imports after end-to-end checks. Do not delete hosted data or rewrite old migrations. Run typecheck/build and lifecycle integration tests. Commit `feat: connect guest and kitchen screens to services`.

## P5: Critical browser journey and access regression coverage

**Files:** create `apps/web/playwright.config.ts`, `apps/web/e2e/restaurant-flow.spec.ts`, `apps/web/e2e/access.spec.ts`, `scripts/integration-test.mjs`; modify root/web scripts, CI, STATUS. Fixtures use synthetic data and isolated PostgreSQL only.
**Interfaces:** `npm run test:e2e` runs Playwright against the documented integration environment; `npm run test:integration` runs real-database service suites and refuses non-test database names. Identity fixtures use a local JWKS test issuer enabled only in the isolated test environment, never public production mode.

- [ ] Write two-context Playwright assertions: guests join SAGE-12, each adds a line, both see the updated total within three seconds, only own lines are editable, double submit creates one kitchen order, staff serves and closes, and the next seating has a different ID. Refresh during PENDING and recover the same checkout.
- [ ] Add access checks for anonymous staff mutation, wrong guest scope, ordinary staff accessing Ops, forged internal headers, cross-origin staff mutation, and expired guest token. Expect 401/403 without data leakage. Test unknown table UI and dependency failure states.
- [ ] Run `npm run test:e2e`; fix observed defects within owning modules. Assert persisted orders survive a service restart in integration checks. Keep database reset restricted to explicitly named disposable test resources.
- [ ] Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:integration`, `npm run test:e2e`. Record failures honestly; complete P5 only when required checks pass. Commit `test: verify the service-backed restaurant journey`.

## Coverage and handoff

P1/P2 cover identity, table/session ownership, and read safety; P3 covers Saga/snapshot/outbox correctness; P4 covers lifecycle and UI; P5 provides the full journey. Independent diner payments, CRM, and optional analytics remain deferred. Stop at P5 and hand the result to F2; do not invent a new product scope.
