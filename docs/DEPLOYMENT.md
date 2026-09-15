# Deployment path

## Local Review 1 environment

`docker compose up -d --build` starts PostgreSQL, Redis, RabbitMQ, Session, Order, Payment, and the gateway. The Postgres container applies `infra/postgres/init.sql` only when its data volume is first created. Existing local volumes need each reviewed migration applied explicitly. Apply the payment and consolidated-order migrations in order: `docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U tablesync -d tablesync < infra/postgres/migrations/002-payment.sql` and then `docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U tablesync -d tablesync < infra/postgres/migrations/003-consolidated-orders.sql`. To intentionally recreate local data, use `docker compose down -v` and then start Compose again.

The service containers are reachable only on the Compose network; public ports are intentionally limited to development infrastructure. Before exposing an API gateway, configure CORS, JWT validation, rate limiting, TLS, and trusted proxy handling.

## Supabase migration

Supabase is the production PostgreSQL and Auth provider, not a replacement for service ownership.

1. Create a Supabase project and use its pooled PostgreSQL connection string as `DATABASE_URL` through a secret manager.
2. Convert `infra/postgres/init.sql` into numbered, reviewed SQL migrations and apply them through the Supabase CLI/CI pipeline. Do not run the local Docker init mount in production.
3. Enable Supabase Auth. The Auth service validates JWTs using Supabase JWKS and resolves application roles from `profiles`/`roles`; the browser never receives a service-role key.
4. Restrict direct database access with roles/RLS. Services use scoped database credentials and access only their owned tables.
5. Keep Redis and RabbitMQ as managed services with TLS, credentials, backups, alerting, and private networking. Replace Compose addresses with secret-provided URLs.

## Cloud readiness checklist

- Put all credentials in the deployment platform's secret manager; `.env` remains local-only.
- Apply migrations before deploying compatible service versions.
- Configure HTTPS, CORS allowlists, Supabase JWT validation, and request rate limits at the gateway.
- Use managed Postgres backups/PITR and test a restore.
- Add Prometheus/Grafana/Kubernetes only after real service metrics and deployment manifests are in place.
- Never present local Docker services as managed cloud resources.
