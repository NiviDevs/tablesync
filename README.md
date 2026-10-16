# TableSync

TableSync is a restaurant operations project for a cloud computing assessment. The immediate goal is a reliable seated-guest ordering flow and a measurable Kubernetes demonstration. The longer-term direction is a restaurant suite with customer history and business analytics.

## Start here

Read [the documentation index](docs/README.md), then [current project state](docs/PROJECT_STATE.md).

- [Proposed design](docs/REBUILD_SPEC.md): scope, architecture, data ownership, reliability, telemetry, and acceptance criteria.
- [Team handoff](docs/TEAM_HANDOFF.md): work packages, dependencies, ownership, and contributor instructions.
- [Status](docs/STATUS.md): implementation evidence and remaining work.
- [Event contracts](docs/EVENTS.md): existing service events; changes require producer and consumer review.

The design is a proposal for review, not a claim that the rebuild is implemented. No application code changed during this documentation reset.

## Important current limitation

There are currently three paths: the web UI uses Supabase `demo_*` tables directly; Compose runs a separate service-backed implementation; the Render blueprint selects an in-memory gateway. Starting Compose does **not** connect the current UI to those services.

The existing commands are:

```bash
npm install
npm run dev
# Separate service stack; requires Docker:
docker compose up -d --build
```

The browser demo needs the Supabase public environment settings and its migrations. Do not assume those migrations are applied. Its presentation policies are not production authorization. See [current state](docs/PROJECT_STATE.md) before exposing it publicly.

## Repository map

- `apps/web`: Next.js guest, restaurant, sign-in, and Ops screens.
- `services`: gateway, Session, Order, and Payment implementations; other directories include placeholders.
- `packages/contracts`: existing event definitions and checks.
- `infra`: PostgreSQL initialization/migrations and a small k6 health check.
- `supabase/migrations`: separate browser-demo schema and policies.
- `docs`: current documentation; `docs/archive` contains superseded material.

Payments are simulated. Kubernetes, live telemetry, and autoscaling remain unverified. A public tunnel is temporary access to local compute, not cloud hosting.
