# Decisions

| Decision | Rationale |
|---|---|
| Next.js App Router | One typed frontend with customer, restaurant, and operations route groups. |
| Fastify services | Small JavaScript services with domain ownership and health endpoints; metrics coverage remains limited. |
| One Postgres database for Review 1 | Faster local setup while preserving logical table ownership. |
| RabbitMQ, not Kafka | Queue and event needs are small and demonstrable. |
| Deterministic mock payments | Demonstrates real Saga behavior without real-money risk or vendor setup. |
| Compose first | Verify the local product flow, then CI/hosted preview. K3s/autoscaling remains future work. |
