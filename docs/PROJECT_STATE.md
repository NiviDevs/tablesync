# Project state

**Phase:** 0 — bootstrap

**Working:** Docker Compose Session/Order persistence through PostgreSQL, Redis presence, RabbitMQ event publication/audit queue, gateway composition, local WebSocket fan-out, deterministic mock-payment Saga checkout, and idempotent committed-payment-to-consolidated-order projection.

**In progress:** restaurant order presentation, Supabase Auth, and real Ops telemetry.

**Deferred:** Supabase identity configuration, external payment providers, managed-cloud deployment.

**Next actions:** render the projected consolidated order in the restaurant surface, then add critical-path browser coverage.
