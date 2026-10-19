# Simulated restaurant history

Start the local application with `npm run demo`, then run:

```bash
npm run demo:seed
```

Refresh the owner dashboard. Select 1, 7, 30 or 90 days, or change the end date
to inspect older history. The command inserts 365 calendar days ending today
in Asia/Kolkata. Today's history includes only seatings that have already ended.
Run it again later to fill newly completed seating windows.

For a repeatable historical period, supply an end date:

```bash
npm run demo:seed -- 2026-10-18
```

The generator creates up to 12 numbered tables, reusing existing numbered
tables, and a 16-dish menu. Existing dishes, prices, availability, tables and
orders are never updated. History includes closed seatings, synthetic guests,
served orders, item snapshots, committed checkouts and simulated payment records.
All monetary values use INR minor units. No real money changes hands.

Breakfast, lunch and dinner have different demand. Weekends are busier; table
popularity, party sizes, seasonal demand, dish popularity and optional drinks,
starters and desserts vary deterministically. These are plausible synthetic
patterns, not actual restaurant performance or infrastructure measurements.
Guests are named `Simulated guest N`; payment attempts use provider
`simulated-history-v1`. No historical RabbitMQ events or Prometheus samples are
fabricated, and no unfinished kitchen orders are added.

The same date, table and seating window always have the same IDs and values.
Repeated or overlapping runs add only missing seatings. A single transaction
and an advisory lock prevent partial or concurrent duplicate imports. Totals
are checked against checkout snapshots and payment shares before commit.
Keep `infra/postgres/demo-history.sql` unchanged to reproduce this version.

## Persistence

PostgreSQL stores this data in the Compose `postgres-data` named volume.
Restarting PostgreSQL, restarting containers, rebuilding the application,
`npm run demo:stop` and ordinary `docker compose down` preserve the volume.
Deleting the volume, including `docker compose down -v`, deletes the database.
Changing the Compose project can select a different volume. The launcher reuses
the project recorded in `.local/compose-project`.

After intentionally creating a fresh database, run `npm run demo` to apply
migrations, then rerun `npm run demo:seed` with the same date to restore the
synthetic history. This does not restore manually entered orders; those need
a database backup. This command targets local Compose, not the separate
Kubernetes database.
