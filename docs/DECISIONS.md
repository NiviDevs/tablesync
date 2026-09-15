# Decisions

| Decision | Rationale |
|---|---|
| Next.js App Router | One typed frontend with customer, restaurant, and operations route groups. |
| Fastify services | Small, fast TypeScript services with clear health and metrics endpoints. |
| One Postgres database for Review 1 | Faster local setup while preserving logical table ownership. |
| RabbitMQ, not Kafka | Queue and event needs are small and demonstrable. |
| Deterministic mock payments | Demonstrates real Saga behavior without real-money risk or vendor setup. |
| Compose first, K3s for demo | Iteration stays fast while autoscaling remains demonstrable. |
