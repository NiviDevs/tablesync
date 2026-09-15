# Architecture

```text
Next.js web -> API gateway -> auth | session | restaurant | order | payment | delivery
                             |       |           |          |
                          Postgres  Redis     RabbitMQ     Prometheus
```

The API gateway is the public edge. Services own their domain tables within one Review 1 PostgreSQL database. Redis is transient presence/session acceleration only. RabbitMQ carries versioned domain events; REST serves request/response operations. The session service coordinates WebSockets and publishes cart/presence events.

The current Compose implementation makes this ownership concrete: the Session service owns `table_sessions` and `participants`, while Order owns `carts` and `cart_items`. The gateway composes their REST responses and owns browser WebSocket fan-out; it does not write either domain's database tables. RabbitMQ's `tablesync.audit` queue makes published local events inspectable.

Payment owns split-payment Saga state. A consolidated order is created only after the Saga commits; failures trigger recorded compensation through the mock provider. Prometheus scrapes real service metrics, Grafana visualizes them, and the custom operations UI is a presentation layer over those same sources.

Local development uses Compose. K3s deployment uses Deployments/Services, an HPA for CPU and KEDA for RabbitMQ queue depth. Replica values must only be displayed after reading actual Kubernetes state.
