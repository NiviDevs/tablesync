# Run TableSync

## Start

1. Start Docker Desktop or Docker Engine.
2. Open a terminal in the repository.
3. Run `npm run demo`.
4. Wait for `Ready: http://localhost:3000` and open it.

The launcher builds the app, starts dependencies, applies pending migrations
and creates ignored local credentials. No Supabase or payment account is needed.
It reuses a running TableSync Compose project and saves its name in
`.local/compose-project`. Keep the ignored `.env` file; never commit it.

## Pages

- Guest: `http://localhost:3000/app?table=SAGE-12`
- Owner/kitchen: `/restaurant/sign-in`, then **Open owner and kitchen**
- DevOps: the same sign-in page, then **Open DevOps view**

Use separate browser profiles/private windows for owner, operator and guests.
Changing a demo role replaces that browser's previous staff session. A localhost
QR works on this computer; phones need a reachable LAN/tunnel web address.

## Stop and resume

```bash
npm run demo:stop
npm run demo
```

Stopping keeps orders and volumes. Do not use `docker compose down -v` to stop.
Older databases are backed up into `.local/backups` before their first migration
baseline. Startup does not erase them.

## Common problems

**Docker connection:** start Docker Desktop/Engine and retry. Linux users who
already belong to the Docker group get a group refresh automatically. Otherwise
fix Docker group access and restart the terminal/IDE.

**Port already in use:** stop the old app or port-forward using port 3000, 8080,
5432, 6379, 5672 or 15672. Preserve database volumes.

**Download/build failure:** check internet access and rerun `npm run demo`.
Completed image layers are reused.

**Expired guest/closed seating:** choose **Rejoin table** or open a new private
window. Serve orders before closing a seating.

**Empty business dashboard:** mark the order preparing, ready, then served in
the kitchen. Analytics count SERVED orders; select today's date.

**Owner access denied:** visit `/restaurant/sign-in` and choose owner. Ops needs
the operator demo login.

**Other errors:** run `npm run demo:logs`. Ctrl+C stops following logs.

## Kubernetes version

Run `npm run cloud` on this Linux machine. It stops Compose to free ports,
starts the cluster app/monitoring, and forwards web 3000 and Grafana 3001. Keep
that terminal open. Ctrl+C closes forwarding but leaves the cluster running.

`npm run cloud:open` reopens a running cluster without rebuilding.
`npm run cloud:stop` stops Minikube and preserves data. Full details are in
[the cloud guide](../infra/k8s/README.md). Compose and Minikube have separate
databases. For different browser ports, use `WEB_PORT=3002 GRAFANA_PORT=3003 npm run cloud:open`.

Demo role selection is explicitly enabled for this educational environment.
Other deployments retain the existing Supabase/JWKS configuration. These demo
logins are not a public production sign-in system.
