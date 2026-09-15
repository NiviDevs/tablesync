# Status

## Completed

- Product, architecture, event, decision, demo, and defense documentation baseline.
- Workspace structure for web, contracts, services, and infrastructure.
- Customer/restaurant/ops navigation shell with seeded, explicitly local demo state.
- API gateway table-session endpoints, WebSocket fan-out, individual cart ownership, and focused integration tests.
- Deterministic mock payment Saga domain implementation with success, failure, timeout, and compensation tests.
- Running Docker Compose integration: PostgreSQL schema, Redis presence, RabbitMQ event exchange/audit queue, Session service, Order service, and gateway service composition.
- Verified end-to-end through the Compose gateway: join participant, automatic collaborative session, persisted owned cart items, Redis presence, RabbitMQ events, and rejection of non-participant cart ownership.

## In progress

- Customer UI integration to API gateway live table-session behavior.
- Durable table-session collaboration and cart persistence.
- Payment Saga and restaurant order projection.
- Connect checkout UI/API and persist the payment Saga and accounting ledger.

## Broken / not yet integrated

- Authentication is a local role selector; Supabase Auth is not configured.
- Local standalone gateway development defaults to explicitly volatile demo state. Compose runs `TABLESYNC_RUNTIME=services`, where Session/Order persist to Postgres, Session uses Redis presence, and both publish RabbitMQ events.
- Ops telemetry and autoscaling are not rendered as live metrics yet.

## Known limitations

- No payment action represents a real monetary transaction.
- Kubernetes manifests and observability configuration are scaffolding until verified against a local K3s environment.
- Next.js 16's internal TypeScript config parser fails on the current Node 26 runtime. `npm run typecheck` remains mandatory and passes; production build skips its duplicate internal typecheck until the toolchain is aligned.
