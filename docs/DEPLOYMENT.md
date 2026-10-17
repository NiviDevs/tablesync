# Development baseline (F0)

Use Node **22.23.3** and npm **10.9.9** (the npm bundled with that Node archive).
`.nvmrc`, package engines, CI, and the four service Dockerfiles pin this pair.
With nvm installed, run `nvm install` and `nvm use` from the checkout.
Verify `node --version` and `npm --version` before installing dependencies.

```bash
npm ci
npm test
npm run typecheck
NEXT_PUBLIC_SUPABASE_URL=https://build-only.supabase.co NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=build-only-placeholder npm run build
```

The build placeholders are public synthetic strings for prerendering the legacy
Supabase browser demo. They do not configure a working sign-in or database. For
interactive browser use, supply the actual public settings described in
`.env.example` through `apps/web/.env.local`; never commit credentials.
No secrets or live identity-provider connection are needed for the CI checks.
Production builds perform normal Next.js TypeScript checking. The unsupported
`next lint` script has been removed; lint is not a verified gate until an ESLint
configuration is introduced.

The current browser still uses the separate Supabase demo. Starting the backend
does not connect that UI to the services; see [PROJECT_STATE.md](PROJECT_STATE.md).

## Legacy service smoke

Docker Engine and Docker Compose are required. Use a separate Compose project
for an isolated development baseline. Confirm ports 5432, 6379, 5672, 15672, and
8080 are free. The existing Compose credentials are local development examples;
keep the stack private.

```bash
docker compose -p tablesync-role-a-f0 up -d --build --wait --wait-timeout 180
GATEWAY_URL=http://localhost:8080 npm run smoke:services
docker compose -p tablesync-role-a-f0 stop
```

The smoke checks gateway health, requires `runtime: services`, and reads the
legacy SAGE-12 session/cart twice to confirm a stable UUID. **This legacy GET
may create the session/cart**; it does not submit payments or erase data. P1
will replace it with the side-effect-free table registry endpoint. This smoke
does not yet establish checkout correctness or persistence across restarts.
`stop` preserves volumes and containers. Do not delete database volumes to reset
the application. Existing non-disposable volumes require a backup and schema
inspection before the F1 migration baseline.

On the assessment host, Docker group changes did not update the already running
IDE process. A new shell using `newgrp docker` picked up the account's assigned
group. Restarting the IDE after a group change is another way to refresh it.

## Remaining deployment gates

Kubernetes, migrations, public access, and a complete restaurant journey still
require verification under F1, P1–P5, C1–C5, and F2. Exact checks and current
blockers are recorded in [STATUS.md](STATUS.md) and [Role A progress](progress/A.md).

[Previous deployment notes](archive/2026-10-16/DEPLOYMENT.md) are historical and contain stale claims. Never run database volume deletion as a routine migration or reset.
