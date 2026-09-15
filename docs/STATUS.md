# Status

## Completed

- Product, architecture, event, decision, demo, and defense documentation baseline.
- Workspace structure for web, contracts, services, and infrastructure.
- Customer/restaurant/ops navigation shell with seeded, explicitly local demo state.
- API gateway table-session endpoints, WebSocket fan-out, individual cart ownership, and focused integration tests.
- Deterministic mock payment Saga domain implementation with success, failure, timeout, and compensation tests.
- Running Docker Compose integration: PostgreSQL schema, Redis presence, RabbitMQ event exchange/audit queue, Session service, Order service, and gateway service composition.
- Verified end-to-end through the Compose gateway: join participant, automatic collaborative session, persisted owned cart items, Redis presence, RabbitMQ events, and rejection of non-participant cart ownership.
- Payment Compose service with persisted, idempotent deterministic Saga state, intent attempts, compensation outcome, platform-fee ledger representation, and RabbitMQ event publication.
- Order-owned, idempotent consumer for committed payment Sagas that snapshots carts into consolidated orders and publishes `order.confirmed.v1` through a transactional outbox.

## In progress

- Restaurant rendering of consolidated orders.
- Durable table-session collaboration and cart persistence.

## Broken / not yet integrated

- Authentication is a local role selector; Supabase Auth is not configured.
- Local standalone gateway development defaults to explicitly volatile demo state. Compose runs `TABLESYNC_RUNTIME=services`, where Session/Order persist to Postgres, Session uses Redis presence, and both publish RabbitMQ events.
- Ops telemetry and autoscaling are not rendered as live metrics yet.
- Checkout is explicitly simulated UPI behavior; committed Sagas create a consolidated order, while failed or compensated Sagas do not.

## Known limitations

- No payment action represents a real monetary transaction.
- Kubernetes manifests and observability configuration are scaffolding until verified against a local K3s environment.
- Next.js 16's internal TypeScript config parser fails on the current Node 26 runtime. `npm run typecheck` remains mandatory and passes; production build skips its duplicate internal typecheck until the toolchain is aligned.
