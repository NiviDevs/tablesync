# Project state

**Phase:** 0 — bootstrap

**Working:** Docker Compose Session/Order persistence through PostgreSQL, Redis presence, RabbitMQ event publication/audit queue, gateway composition, local WebSocket fan-out, and the persisted deterministic mock-payment Saga service/checkout route.

**In progress:** committed-payment-to-consolidated-order projection, Supabase Auth, and real Ops telemetry.

**Deferred:** Supabase identity configuration, external payment providers, managed-cloud deployment.

**Next actions:** consume committed payment events in Order, project a restaurant-visible consolidated order, then add critical-path browser coverage.
