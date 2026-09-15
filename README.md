# TableSync

> One table. One order. Everyone pays their way.

TableSync is a B2B2C collaborative dining platform. Guests join a restaurant table using a QR/table code, order together in real time, and pay their own share. Restaurants receive one consolidated order.

## Current state

The repository is in Review 1 bootstrap. The web app contains the customer, restaurant, and operations surfaces with a local deterministic demo shell. Service and infrastructure contracts are established; live integrations are tracked in [docs/STATUS.md](docs/STATUS.md).

## Quick start

```bash
npm install
docker compose up -d --build
npm run dev
```

Open `http://localhost:3000`. Use the role buttons on the login page to explore the seeded demo. The customer surface uses the Compose API gateway at port 8080 for table join, cart ownership, persistence, and WebSocket updates. `npm run dev:api` is available for an explicitly volatile gateway-only UI prototype.

## Repository map

- `apps/web` — Next.js application and product surfaces
- `services/*` — independently containerized domain services
- `packages/contracts` — versioned event and API domain contracts
- `infra` — Compose, Kubernetes, observability, and load-test assets
- `docs` — architecture, demo script, decisions, and project state

See [docs/DEMO.md](docs/DEMO.md) for the Review 1 walkthrough and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the service map.

The documented local-to-Supabase/cloud deployment path is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
