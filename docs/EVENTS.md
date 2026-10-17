> Scope note (2026-10-16): This document describes the existing service path, not the direct Supabase browser demo. Consumer names in the table include intended consumers; verify actual bindings in source. The audited active committed-payment consumer is Order. Rebuild changes must update this document and contract tests together.

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

Before P3, Order consumed `payment.saga_committed.v1` through its own durable `tablesync.order.payment.v1` queue. It deduplicates event IDs and payment Saga IDs, snapshots the owned cart into a consolidated order, and records `order.confirmed.v1` in its transactional outbox before publishing it.

## P3 service path (v2)

The preceding table preserves legacy v1 contracts and rupee units. The new
service path produces and consumes the following additive contracts:

| Event | Producer | Consumer | Data |
|---|---|---|---|
| `payment.saga_committed.v2` | Payment | Order | checkoutId, sagaId, sessionId, totalAmountMinor, currency:'INR' |
| `order.confirmed.v2` | Order | Audit / future consumers | orderId, checkoutId, sessionId, restaurantId, tableCode, totalAmountMinor, currency:'INR' |

Envelopes retain `id,type,version,occurredAt,correlationId,data`; v2 uses numeric
version 2 and checkoutId as correlationId. Amounts are integer paise. V1 money
fields keep their original units. For new v2 rows, retained legacy rupee columns
are rounded up for compatibility; new code uses only explicit minor-unit fields.

Order freezes checkout lines before calling Payment. Payment's checkout ID,
idempotency key, and canonical payload fingerprint prevent changed-payload
replays. Saga state, simulated attempts/compensations, and Payment outbox events
commit together. Non-committed Saga events keep their existing v1 shapes; only
committed table payments emit v2. Failure/timeout outcomes are enabled only in
direct isolated test stores, never the public HTTP flow.

Order listens on durable `tablesync.order.payment.v2`, bound only to the v2
committed event. It records deliberate exclusion if handed a legacy v1 envelope;
the historical v1 queue is preserved and no longer consumed by the new path.
Projection checks checkout/session/currency/total/Saga identity and reads only
immutable checkout lines. Unique checkout ID and event deduplication prevent
duplicate orders. Order, checkout delivery status, and its outbox commit in one
transaction. A committed payment with a null orderId is still delivery pending.

Outboxes persist complete envelopes once and retry the same event ID. Publisher
confirmation precedes marking published. Bounded five-second background passes
retry delivery/reconciliation and reconnect after broker loss. An HTTP timeout
keeps the checkout pending until its existing Payment outcome is reconciled.
An explicit failed retry keeps its original snapshot/audit row and creates a new
attempt ID; it does not delete or repurchase a committed checkout.

Malformed/permanently mismatched v2 events are dead-lettered to
`tablesync.order.payment.v2.dead` through `tablesync.dead`. Transient projection
failures are republished with a bounded attempt header (three retries), then
dead-lettered; they never hot-loop on unbounded requeue. Retry publication is
confirmed before acknowledging the original. A broken channel leaves its
delivery unacknowledged for broker recovery. Dead-letter replay requires
inspection; there is no automatic destructive reset.

The legacy local-demo gateway broadcasts `participant.joined.v1`, `session.snapshot.v1`, and `cart.item_added.v1` snapshots over browser WebSockets after its request routes complete. The browser transport is transient; Session and Order remain the durable producers for their RabbitMQ domain events.
