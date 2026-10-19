# Service API contract — foundation checkpoint

The F1 browser types in `packages/contracts/src/http.ts` and the routes below
are the agreed target for P1–P4 and C4. **F1 defines the contract; it does not
implement these routes.** The legacy `/v1/table-sessions/:code` interface remains
until its replacements pass product checks. No direct Supabase business writes
belong in the new path.

## Common semantics

- Server-issued IDs are UUIDs. Table codes use uppercase canonical spelling.
- Guest names are trimmed, 1–80 characters. Quantities are integers from 1–20.
- Money uses integer INR minor units (paise): paneer is `34000`, two portions
  total `{amountMinor:68000,currency:'INR'}`. Legacy v1 rupee fields keep their
  original meaning; P2 adds columns and an explicit one-time conversion.
- Errors are `ApiError`: `{error:{code,message},requestId}`. Malformed input is
  400, missing/invalid credentials 401, wrong scope/membership 403, absent entity
  404, stale state/key conflict 409, rate limit 429, unavailable dependency 503.
  A body exceeding 16 KiB returns 413.
  The browser proxy preserves the status and error code.
- Public mutation bodies are bounded to 16 KiB. Join is limited to 30/min/IP;
  mutations to 120/min/credential. Initial singleton gateway limits are local
  to its process. Browser polling is every two seconds, without overlap.
- Public checkout always simulates deterministic success for all table payers.
  UI action: **Simulate table payment — no money is collected**. Failure/timeout
  controls exist only in explicitly enabled isolated internal tests.

## Public gateway routes

| Method/path | Request | Response and access |
|---|---|---|
| GET `/v1/tables/:code` | None | `TableView`; public, no writes even for unknown codes |
| GET `/v1/menu?tableCode=...` | Known table | `{items:{id,name,description,emoji,unitPriceMinor,available}[],currency:'INR'}`; public |
| POST `/v1/table-sessions/join` | `{tableCode,name,joinKey}`; UUID joinKey | 201 `{table:TableView,participant:{id,name},guestToken}`; identical replay 200 |
| GET `/v1/sessions/:id/cart` | Guest bearer | `CartView`; member only, no writes |
| PUT `/v1/sessions/:id/cart/items/:menuItemId` | `{quantity,expectedRevision}` | `CartView`; sets own quantity, never increments |
| DELETE `/v1/sessions/:id/cart/items/:menuItemId` | `{expectedRevision}` | `CartView`; own line only |
| POST `/v1/sessions/:id/checkouts` | `{operationKey,expectedRevision}` | 202 `CheckoutView` until order delivery; 200 replay; member simulates the table |
| GET `/v1/checkouts/:id` | Member bearer | `CheckoutView`; payment committed with null orderId means delivery pending |
| POST `/v1/checkouts/:id/retry` | `{operationKey}` | New attempt only after terminal failed/compensated state; ordinary retry reuses original create request |
| GET `/v1/restaurant/tables` | Staff bearer | `{tables:TableView[]}` scoped to restaurant membership |
| GET `/v1/restaurant/orders` | Staff bearer | `{orders:OrderView[]}`; most recent 100 for that restaurant |
| PATCH `/v1/orders/:id/status` | `{status:OrderStatus}` | `OrderView`; staff only; repeated target succeeds; skip/reversal 409 |
| POST `/v1/sessions/:id/close` | Staff bearer | `TableView`; reject unfinished orders/checkouts; repeated close succeeds |
| GET `/v1/ops/overview` | Operator bearer | Current service/Session samples plus fixed Prometheus history; no query arguments |

Ops `history` contains Unix-second `start`/`end`, `step:15`, per-service
`requestsPerSecond`/`p95Seconds`/`errorFraction`, and Session
`desiredReplicas`/`readyReplicas`/`cpuCores`/`memoryBytes`. Each history series is
an array of `[Unix seconds, number|null]` pairs covering the last 15 minutes.
A failed query is `null`; an absent series is `[]`; non-finite values become
null points. Source samples older than 45 seconds are excluded. Current sample
fields keep their existing value, source timestamp and freshness state.

Replay of a joinKey with a different name/table is 409. A client-supplied
participant ID or price never establishes ownership or overrides server prices.
A stale cart revision is 409; refresh before changing a request. A frozen cart
rejects edits. Competing checkout operation keys for one revision produce one
snapshot, Saga, and order. Uncertain network outcomes remain PENDING until
Payment reconciliation; they must not unlock the cart or charge again.

Session states are OPEN, CLOSING, CLOSED. Cart states are EDITING, PENDING,
COMMITTED, FAILED; checkout states are PENDING, COMMITTED, FAILED. Kitchen order
status advances CONFIRMED → PREPARING → READY → SERVED. Closed seatings remain
historical; a later join creates a different session ID.

## Identity and private services

Guest credentials are dedicated-secret HS256 JWTs, issued by the gateway for a
server-generated participant/session with an explicit issuer/audience and eight
hour expiry. Writes check current membership and seating status. Staff JWTs
are verified with Supabase JWKS (signature, allowlisted algorithm, issuer,
audience, expiry); server-controlled subject assignments determine restaurant
membership and roles. A valid login without assignment is 403. Operator access
requires the operator role; ordinary staff and guests cannot read Ops.

All private routes require a server-only internal bearer credential. Only then
are `x-participant-id`, `x-session-id`, and `x-restaurant-id` trusted. Gateway and
web proxy discard caller-supplied internal identity headers. The Next.js proxy
uses one configured `GATEWAY_URL`, only documented routes/methods, five-second
timeouts, and same-origin checks on cookie-authenticated staff mutations.

| Private owner | Interface |
|---|---|
| Session, 8081 | Internal equivalents of table lookup/join/list; `GET /v1/sessions/id/:id`; reads never insert |
| Order, 8082 | Internal equivalents of menu/cart/orders; `POST /v1/checkouts` with `{sessionId,participantId,operationKey,expectedRevision}`; `GET /v1/checkouts/:id` |
| Order | `POST /v1/sessions/:id/seal` and `/unseal`; locks cart, refuses pending/unfinished purchases |
| Payment, 8083 | `POST /v1/payment-sagas` with `{checkoutId,sessionId,idempotencyKey,payments:[{participantId,amountMinor,outcome}]}`; key equals checkoutId |
| Payment | `GET /v1/payment-sagas/by-checkout/:checkoutId` for reconciliation before resubmission |

Gateway stays on 8080, web on 3000. Existing `/health` is process health, not
proof that dependencies are ready. B's C1 adds distinct readiness and real
metrics; do not use the legacy room gauge as durable active-session telemetry.
Gateway remains a singleton; process-local browser rooms are not cross-replica
delivery. Service ownership and shared dependency changes remain with A.

To close: Session persists CLOSING, requests Order sealing, then persists CLOSED.
A business conflict restores OPEN. An uncertain transport outcome stays CLOSING
and retry resumes coordination. All Order mutations honor the local seal. No
service reads another service's owned tables to bypass these interfaces.

## Event transition

P3 introduces `payment.saga_committed.v2` with `checkoutId`, `sagaId`, `sessionId`,
`totalAmountMinor`, `currency:'INR'`, and corresponding `order.confirmed.v2`
snapshot/money fields. Envelopes retain `id,type,version,occurredAt,correlationId,data`
with numeric version 2. Outbox IDs remain event IDs across retries; broker
confirmation precedes published marking. Consumers deduplicate event and
checkout IDs and reject permanent mismatches through a bounded dead-letter path.
V2 Order projection uses only the immutable snapshot. It ignores legacy v1
events for the new path. F1 does not change v1 producers or their rupee units;
[EVENTS.md](EVENTS.md) and event tests change with the P3 producers.

## Checkpoint integration

P1 implements table lookup, joining, table listing, and the credential boundary.
In service runtime the unsafe legacy gateway table/cart/checkout routes are no
longer registered; product callers move to the frozen routes above in P2–P4.
The explicitly labelled local-demo runtime remains only as the historical demo
and is rejected by the service smoke. Private Session lookup now returns
TableView; the legacy internal Order client adapts that shape until P3.

B must merge the published FOUNDATION CHECKPOINT before dependent work. C1/C2
may use these stable ports, Node 22.23.3/npm 10.9.9, and `npm run db:migrate` with
`DATABASE_URL`/`MIGRATIONS_DIR`. Gateway Ops registration, instrumentation hooks,
Dockerfile/Compose changes, and shared dependencies require an A handoff.
Future breaking contract proposals require agreement before implementation.

## Owner menu and business features — 2026-10-18

These additive routes use the existing staff bearer credential, restaurant
membership and same-origin proxy. They do not change event contracts.

| Method/path | Body/query | Result |
|---|---|---|
| GET `/v1/restaurant/menu` | None | `{items:MenuItem[],currency:'INR'}` including unavailable dishes |
| POST `/v1/restaurant/menu` | `{name,description,emoji,unitPriceMinor,available}` | 201 saved `MenuItem`, with server-generated ID |
| PUT `/v1/restaurant/menu/:id` | Same complete dish fields | Updated dish within the staff restaurant; otherwise 404 |
| GET `/v1/restaurant/analytics` | `days=1,7,30,90` and optional `date=YYYY-MM-DD` | `RestaurantAnalytics`; default 30 days ending today in Asia/Kolkata |
| POST `/v1/restaurant/tables` | `{name}` | 201 `TableView`; generated QR table code |
| DELETE `/v1/restaurant/tables/:code` | None | `{removed:true}`; only unused tables can be removed |

Dish names are 1–120 characters, descriptions at most 500 characters, icons
1–16 Unicode code points, and prices integer paise from 100 to 10,000,000.
Availability is a boolean. Hiding a dish blocks new additions without removing
old lines or order history. Menu edits apply when a guest next adds or changes
that dish; frozen checkout/order snapshots retain their recorded name and price.

Analytics count only SERVED orders from the service backend, using each order's
creation date in Asia/Kolkata. Both end dates are inclusive. Sales are simulated
amounts, not bank receipts or profit. All orders within the selected period are
aggregated, without the kitchen listing's 100-order limit. Empty days return zero.
The response includes period totals, distinct ordering participants, quantities,
daily order counts and sales, dish quantities/order counts/sales and table totals.
Changing the dashboard to one day gives dish performance for that day.

Tables with seating history cannot be deleted; close their seating to reuse them.
The table registry locks creation/deletion against joins and retains historical
sessions. No schema migration or new dependency is required for these features.
