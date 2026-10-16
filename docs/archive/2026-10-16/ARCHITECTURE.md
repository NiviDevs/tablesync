# Architecture

```text
Next.js web -> API gateway -> auth | session | restaurant | order | payment | delivery
                             |       |           |          |
                          Postgres  Redis     RabbitMQ     Prometheus
```

The diagram is the target architecture. The running local slice contains Gateway, Session, Order and Payment. Auth, restaurant management and delivery are not integrated services. The gateway is the public edge and owns browser WebSocket fan-out. Services own their domain tables within one Review 1 PostgreSQL database. Redis is transient presence storage; RabbitMQ carries domain events. Session publishes participant events and Order publishes cart events.

The current Compose implementation makes this ownership concrete: the Session service owns `table_sessions` and `participants`, while Order owns `carts` and `cart_items`. The gateway composes their REST responses and owns browser WebSocket fan-out; it does not write either domain's database tables. RabbitMQ's `tablesync.audit` queue makes published local events inspectable.

Payment owns `saga_state`, `payment_intents`, `payment_attempts`, and `platform_fee_ledger`. The gateway calculates owned-cart split amounts and calls Payment over REST; Payment persists the deterministic mock-provider Saga before publishing versioned events. Order consumes only committed Saga events on a dedicated durable queue, reads the session through Session's API, snapshots its cart into its owned consolidated-order tables, and uses an Order outbox to publish `order.confirmed.v1`. Prometheus scrapes real service metrics, Grafana visualizes them, and the custom operations UI is a presentation layer over those same sources.

Local development uses Compose. Prometheus, Grafana, K3s, HPA and KEDA in the preceding target description are future work, not running or verified integrations. Replica values must only be displayed after reading actual Kubernetes state.

Current checkout triggers all simulated payer attempts from one request. Order snapshots the mutable cart when consuming the event and verifies its total; immutable checkout snapshots and independent payer confirmations remain pending. The consumer deduplicates by event and Saga ID, but this does not prevent a new checkout key from creating another payment/order for the same cart. Payment publication is not transactional with its database commit; Order outbox publication needs stable event IDs across retries.

The web app has Supabase browser/server cookie clients and `apps/web/proxy.ts` to refresh sessions via `getClaims()`. This does not protect routes or authenticate the gateway. Guest participant IDs still come from browser session storage. Domain tables remain in local PostgreSQL; no Supabase schema migration or direct browser access to domain tables was added.
