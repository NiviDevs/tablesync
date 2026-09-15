# Event contracts

All events are JSON with `id`, `version`, `occurredAt`, `correlationId`, and `data`. Consumers must deduplicate by `id`.

Local Compose binds the durable `tablesync.audit` queue to `tablesync.events` using `#`. It is an observable audit stream for the demo, not a substitute for domain consumers.

| Event | Producer | Consumers | Data |
|---|---|---|---|
| `participant.joined.v1` | session | order, web gateway | sessionId, participant |
| `cart.item_added.v1` | order | session, restaurant | sessionId, item, ownerId |
| `payment.succeeded.v1` | payment | order | sagaId, participantId, intentId |
| `payment.failed.v1` | payment | payment Saga | sagaId, participantId, reason |
| `payment.compensated.v1` | payment | order, ops | sagaId, intentId |
| `order.confirmed.v1` | order | restaurant, delivery | orderId, restaurantId |
| `payment.compensation_started.v1` | payment | ops | sagaId, failedIntentId |
| `payment.saga_committed.v1` | payment | order, restaurant | sagaId |

During the customer-slice integration, the API gateway broadcasts `participant.joined.v1`, `session.snapshot.v1`, and `cart.item_added.v1` over WebSockets. This is explicitly volatile local-demo transport; the session service will become the event producer when Redis/RabbitMQ persistence is integrated.
