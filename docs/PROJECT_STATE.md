# Project state

**Phase:** 0 — bootstrap

**Working:** Docker Compose Session/Order persistence through PostgreSQL, Redis presence, RabbitMQ event publication/audit queue, gateway composition, local WebSocket fan-out, and deterministic mock-payment Saga domain tests.

**In progress:** checkout-to-payment API integration, restaurant order projection, Supabase Auth, and real Ops telemetry.

**Deferred:** Supabase identity configuration, external payment providers, managed-cloud deployment.

**Next actions:** install dependencies; implement Fastify domain services and WebSocket gateway; wire durable Postgres/Redis/RabbitMQ; add Playwright critical-path tests.
