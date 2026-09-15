# Event contracts

All events are JSON with `id`, `version`, `occurredAt`, `correlationId`, and `data`. Consumers must deduplicate by `id`.

Local Compose binds the durable `tablesync.audit` queue to `tablesync.events` using `#`. It is an observable audit stream for the demo, not a substitute for domain consumers.

| Event | Producer | Consumers | Data |
|---|---|---|---|
| `participant.joined.v1` | session | order, web gateway | sessionId, participant |
| `cart.item_added.v1` | order | session, restaurant | sessionId, item, ownerId |
| `payment.succeeded.v1` | payment | order | sagaId, sessionId, participantId, intentId |
| `payment.failed.v1` | payment | payment Saga | sagaId, sessionId, participantId, reason |
| `payment.compensated.v1` | payment | order, ops | sagaId, sessionId, intentId |
| `order.confirmed.v1` | order | restaurant, delivery | orderId, sessionId, restaurantName, totalAmount |
| `payment.compensation_started.v1` | payment | ops | sagaId, sessionId, failedIntentId |
| `payment.saga_committed.v1` | payment | order | sagaId, sessionId, totalAmount |

Order consumes `payment.saga_committed.v1` through its own durable `tablesync.order.payment.v1` queue. It deduplicates event IDs and payment Saga IDs, snapshots the owned cart into a consolidated order, and records `order.confirmed.v1` in its transactional outbox before publishing it.

The gateway broadcasts `participant.joined.v1`, `session.snapshot.v1`, and `cart.item_added.v1` snapshots over browser WebSockets after its request routes complete. The browser transport is transient; Session and Order remain the durable producers for their RabbitMQ domain events.
