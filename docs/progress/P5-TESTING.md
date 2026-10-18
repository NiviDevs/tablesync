# Product browser checks

Run from the Role A worktree with Node 22.23.3 and npm 10.9.9. Local PostgreSQL,
Redis and RabbitMQ must be running (the existing Compose dependencies suffice).
The database name must contain a separate `test` segment, such as
`tablesync_test_ci`. Never point these tests at the application database.

```bash
export PATH=/tmp/node-v22.23.3-linux-x64/bin:$PATH
export TEST_DATABASE_URL=postgresql://tablesync:tablesync@localhost:5432/tablesync_test_ci
npm ci
npm exec --workspace=@tablesync/web -- playwright install chromium
npm test
npm run test:integration
npm run typecheck
npm run build
npm run test:e2e
```

On a minimal Linux CI machine, Playwright may also need `install --with-deps
chromium`. This machine's sandbox prevents Node child output and local network
access; the build and integration/browser commands were run outside it.

The browser command starts the actual four services and production Next.js
server. It creates a unique PostgreSQL schema and RabbitMQ vhost, and uses Redis
database 15 with session-specific keys. Cleanup removes only these test-owned
resources. It does not reset the running Compose application or its volumes.
Ports 3100, 18080–18083 and 18090 must be free.

Staff identity uses a generated local RSA key and a server-side staff assignment.
Tests send the signed bearer token; production authentication is not bypassed.
Temporary credentials live in a private temporary file that is removed on exit.
This does not verify Supabase email delivery, callback/session-cookie refresh,
or grant staff access to the normal running Compose demo.

The journey uses two independent browser contexts and checks cart ownership,
quantity changes, shared updates within three seconds, duplicate submission,
an injected lost HTTP reply, refresh during a real Payment-process outage,
one persisted order, an Order-process restart, kitchen progression, local QR
generation, closure and a new seating ID. Access checks cover missing staff
credentials, guest/staff separation, wrong session, expired guest credentials,
forged internal headers, cross-origin mutation, body bounds and unknown routes.
An injected dependency response verifies stale/error recovery in the browser.

The pages are `/app?table=SAGE-12`, `/restaurant`, and
`/restaurant?view=kitchen`. All payments are simulated. The seeded menu is
read-only; dish editing and day-by-day sales analytics are not part of P4/P5.
Ops and real infrastructure evidence remain B-owned work, followed by the joint
F2 rehearsal. A local browser run does not establish phone/tunnel access.
