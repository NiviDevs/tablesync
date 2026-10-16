# Deployment path

## Local Review 1 environment

`docker compose up -d --build` starts PostgreSQL, Redis, RabbitMQ, Session, Order, Payment, and the gateway. The Postgres container applies `infra/postgres/init.sql` only when its data volume is first created. Existing local volumes need each reviewed migration applied explicitly. Apply the payment and consolidated-order migrations in order: `docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U tablesync -d tablesync < infra/postgres/migrations/002-payment.sql` and then `docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U tablesync -d tablesync < infra/postgres/migrations/003-consolidated-orders.sql`. To intentionally recreate local data, use `docker compose down -v` and then start Compose again.

The service containers are reachable only on the Compose network; public ports are intentionally limited to development infrastructure. Before exposing an API gateway, configure CORS, JWT validation, rate limiting, TLS, and trusted proxy handling.

## Supabase migration

### Current web setup

The supplied project URL and publishable key are stored in ignored `apps/web/.env.local`, where Next.js loads them. `.env.example` contains placeholders. Restart the web dev server after changing these values. The SDKs are web-workspace dependencies.

`apps/web/utils/supabase/client.ts` creates the browser client. For server code, import `createClient` from `@/utils/supabase/server` and pass `await cookies()` from `next/headers`. `apps/web/proxy.ts` invokes `utils/supabase/middleware.ts` and `getClaims()` to refresh cookies on requests excluding static assets. Without Supabase settings the local public demo still runs; calling either client helper requires valid settings.

This is session-refresh plumbing only: no login page, callback, protected routes, gateway JWT verification, hosted database migration or authenticated refresh test has been added. The sample `todos` query is not part of TableSync. The existing dining pages are preserved. Follow the [official Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client) for the underlying pattern.

### Remaining production work

Supabase is the intended production PostgreSQL and Auth provider. Domain data currently remains in Compose PostgreSQL.

1. The local web app has a supplied Supabase project URL/key. To migrate domain storage later, obtain the pooled PostgreSQL connection string and configure `DATABASE_URL` through a secret manager; the public web key is not a database password.
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
