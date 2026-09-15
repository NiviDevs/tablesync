# Status

## Completed

- Product, architecture, event, decision, demo, and defense documentation baseline.
- Workspace structure for web, contracts, services, and infrastructure.
- Landing/customer/restaurant pages and an Ops preview shell; there is no login or role selector.
- API gateway table-session endpoints, WebSocket fan-out, individual cart ownership, and focused integration tests.
- Deterministic mock payment Saga domain implementation with success, failure, timeout, and compensation tests.
- Running Docker Compose integration: PostgreSQL schema, Redis presence, RabbitMQ event exchange/audit queue, Session service, Order service, and gateway service composition.
- Verified end-to-end through the Compose gateway: join participant, automatic collaborative session, persisted owned cart items, Redis presence, RabbitMQ events, and rejection of non-participant cart ownership.
- Payment Compose service with persisted, idempotent deterministic Saga state, intent attempts, compensation outcome, platform-fee ledger representation, and RabbitMQ event publication.
- Order-owned, idempotent consumer for committed payment Sagas that snapshots carts into consolidated orders and publishes `order.confirmed.v1` through a transactional outbox.
- Product-flow refresh implemented: landing page, table-link/name entry, checkout sheet, and restaurant board polling projected `SAGE-12` orders. Mobile layout and full browser interactions remain unverified.
- Supabase SDKs installed in the web workspace; browser/server helpers and Next.js 16 proxy refresh existing sessions using `getClaims()`. Local project settings live in ignored `apps/web/.env.local`.
- A reviewable Supabase hosted-demo migration now seeds Juniper House, Table 12 (`SAGE-12`), and the four existing menu items. It models anonymous guest names, a one-time private table-host phone contact, and shared cart data with RLS. It has not been applied to the hosted project yet.

## In progress

- Independent diner payment confirmations and shared waiting/payment status.
- Cart quantity/removal controls, checkout snapshot/locking, safe retries and prevention of repeated payment for purchased items.
- Restaurant workflow actions: accept, prepare, and complete a consolidated order (not implemented yet).
- Four-browser end-to-end coverage, visual checks, CI and hosted preview.
- Apply `supabase/migrations/202609150001_hosted_demo.sql` to the connected Supabase project, then connect Vercel and set the public environment values before publishing the hosted-demo slice.

## Broken / not yet integrated

- Supabase client/session-refresh plumbing is configured locally. Guests remain intentionally login-free; staff email sign-in, callbacks, roles, tenant permissions and gateway JWT validation are not implemented. No authenticated session refresh against the hosted project has been verified.
- Local standalone gateway development defaults to explicitly volatile demo state. Compose runs `TABLESYNC_RUNTIME=services`, where Session/Order persist to Postgres, Session uses Redis presence, and both publish RabbitMQ events.
- Ops telemetry and autoscaling are not rendered as live metrics yet.
- Checkout is explicitly simulated UPI behavior; committed Sagas create a consolidated order, while failed or compensated Sagas do not.
- The UI says “your share,” but one checkout request simulates the whole table, defaulting other diners to success. Each click generates a new key and leaves purchased items in the cart; independent payment and retry semantics are incomplete.
- Order projects the cart at event-consumption time, not an immutable checkout snapshot. A changed total causes projection retries; payment commit does not prove restaurant delivery. Payment publication has a database-to-broker delivery gap, and Order outbox retries currently generate new event IDs.
- Restaurant/menu/table details remain seeded; QR generation, menu editing and table lifecycle are absent. The restaurant board only queries SAGE-12.
- Landing and restaurant pages are a focused Review 1 product shell, not a tenant CMS, CRM, or production restaurant console yet.

## Known limitations

- No payment action represents a real monetary transaction.
- Kubernetes, Prometheus/Grafana and autoscaling are planned, not verified deployments. No CI workflow or hosted preview is configured in this repository.
- Existing unit/API checks and a previous Compose success/failure smoke test do not establish four-diner correctness. The refreshed UI has passed typecheck/build and HTTP checks only.
- Next.js 16's internal TypeScript config parser fails on the current Node 26 runtime. `npm run typecheck` remains mandatory and passes; production build skips its duplicate internal typecheck until the toolchain is aligned.
