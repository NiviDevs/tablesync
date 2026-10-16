# Current project state

Audited from repository source on 2026-10-16. This audit did not execute the application, apply migrations, query hosted resources, or run the test suite. Previous documents reported checks, but those reports are not fresh verification.

## Three distinct implementations

| Path | Evidence | What it means |
|---|---|---|
| Browser demo | `apps/web/lib/demo.ts`, guest and restaurant pages | Direct Supabase reads/writes against `demo_*` tables; polling about every 1.8 seconds. |
| Service backend | `docker-compose.yml`, gateway/Session/Order/Payment sources | Separate PostgreSQL domain tables, Redis presence, RabbitMQ events, simulated payment Saga, and order projection. |
| Render blueprint | `render.yaml` | `TABLESYNC_RUNTIME=local-demo`; gateway state lives in memory. No deployment status verified. |

The current browser demo does not exercise the service Saga or demonstrate the service backend's scaling. The old README incorrectly described that connection.

## Source-backed findings

- Guest UI has name entry, shared cart display, per-guest simulated paid flags, and host submission. Its browser helper writes payment flags directly; this is not the Payment service Saga.
- Restaurant UI has table creation/removal, externally generated QR images, polling, and status progression. It is tied to the seeded `juniper-house` restaurant.
- Email OTP sign-in and an auth callback exist. The Next.js proxy refreshes sessions; it does not enforce staff roles or restaurant membership.
- Supabase presentation migrations grant anonymous table insertion and broad simulated-payment access. Authenticated order progression does not itself establish restaurant membership. Treat this as a demo access model requiring replacement.
- Both Supabase migrations dated `202609160001` use the same numeric prefix. Resolve ordering/version identity before adopting a migration runner; do not rename applied history without reconciliation.
- Gateway browser rooms are process-local. Replicating the gateway does not create cross-replica event delivery.
- Session reads can create sessions for unknown table codes. That is unsuitable for read-only load scenarios and requires correction.
- Service checkout simulates all payers in one request. Order projection reads a mutable cart after payment commit. Checkout locking, immutable snapshots, and duplicate prevention need work.
- Payment publication and Order outbox retry identity need a reliability review before claiming reliable delivery.
- Ops contains preview charts and hardcoded health states. Gateway metrics expose a room-based gauge, not a trustworthy count of durable active sessions.
- `infra/k6/smoke.js` performs a two-user, ten-second health check. There are no Kubernetes or monitoring manifests in the audited tree.
- Existing tests cover selected gateway, payment, and event cases. They do not establish browser correctness, access isolation, or scaling.

## Development machine observation

The inspected environment reports Linux, a Ryzen 9 6900HS, 16 logical CPUs, about 14 GiB usable RAM, and about 335 GiB free disk. Docker was not found on the current command path. These observations are not a verified cluster capacity test or confirmation that this is the presentation machine.

## Next transition

The user approved [the design](REBUILD_SPEC.md) on 2026-10-16. Review the [execution plans and assignments](TEAM_HANDOFF.md), then establish a runnable baseline before feature changes. Preserve the existing service slice while the browser is migrated. Do not drop either database's data as part of documentation cleanup.
