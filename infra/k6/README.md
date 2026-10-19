# Local load testing

Start Docker Engine and the chosen application environment. The runner uses the
pinned k6 Docker image; no host k6 install is needed. Docker host networking must
be enabled (native on Linux). Requests are read-only and the runner accepts only
a loopback HTTP gateway URL.

## Compose

Start `npm run demo`. Open the DevOps workspace, then use another terminal:

```sh
npm run load:smoke
npm run load
RATE=50 DURATION=60s COOLDOWN=15s npm run load
```

Smoke checks gateway health for 10 seconds at approximately four requests per
second. Any failed HTTP request or health check fails the command. Read load
checks the known-table response through the gateway and Session: 30 seconds of
ramp-up, 60 seconds at 25 requests/s by default, 5 seconds of ramp-down, then a
15-second cooldown. Set `TABLE_CODE` for another existing table, or `TARGET_URL`
for another local gateway port (default `http://127.0.0.1:8080`).
One sleeping VU keeps k6 and capture running during cooldown without sending
HTTP requests; zero-rate arrival stages alone can end early.

Ops shows throughput, p95 latency and 5xx graphs for each application service.
The history comes from Prometheus and survives page reloads while Prometheus is
running. The read workload exercises gateway and Session; Order and Payment
traffic does not rise unless those services receive requests. Compose does not
supply Kubernetes CPU, memory or replica metrics.

## Kubernetes

Start `npm run cloud`, then run:

```sh
npm run cloud:load
RATE=100 DURATION=180s COOLDOWN=360s npm run cloud:load
# Equivalent direct runner, with full scaling-observation defaults:
RATE=100 bash infra/k6/run.sh kubernetes
```

`cloud:load` defaults to 25 requests/s, a 60-second steady phase and 60-second
cooldown, plus the same ramp stages. A direct Kubernetes run defaults to a
180-second steady phase and 360-second cooldown. `DURATION` accepts positive
seconds or minutes, such as `180s` or `3m`.

The runner enables the Session HPA, waits for a valid Metrics Server target,
forwards gateway/Prometheus ports, and records real scaling samples. Session
scales between 1 and 3 replicas at 60% of its 100m CPU request. Scale-down
stabilization is 300 seconds, then at most one pod per minute. Ready replicas,
not desired or Pending replicas, prove serving capacity. A short successful run
does not prove scale-up or scale-down. No busy loops or synthetic CPU are added.

## Results and failures

Evidence goes to ignored `infra/k6/.local/<UTC time>-<pid>` unless `EVIDENCE_DIR`
is set. Each run includes `preflight.json`, `k6-output.txt` and either
`read-summary.json` or `smoke-summary.json`. Kubernetes read runs also capture
`scaling.jsonl` approximately every five seconds, including HPA conditions,
desired/Ready pods, CPU/memory and per-pod Session request counters.

Read checks must succeed more than 99% of the time. HTTP failures and steady
unexpected responses must each stay below 1%; any dropped iteration fails.
Actual steady p95 is reported without an invented latency target. k6 failure
status propagates through the launcher. A missing gateway/table fails preflight.
Start with 10, 25, then 50 requests/s when calibrating a machine.

Ops polls every five seconds; Prometheus scrapes every 15 seconds and rates use
a one-minute window. Expect a delay before the graphs change. Select a 5- or
15-minute window. Missing or stale sources create gaps; no-traffic latency and
error fractions can be unavailable. Graph sample tables expose exact values.

Do not expose load controls through Ops. A direct Session experiment bypasses
the gateway and requires its private credential supplied locally to
`session-read.js`; the summary labels that experiment. The main runner targets
the public gateway and does not forward private credentials.

The optional `cart-correctness.js` remains separate because it writes data. It
requires `ALLOW_SYNTHETIC_WRITES=yes`, an unused synthetic `TABLE_CODE` created
through the owner screen, and a loopback `TARGET_URL`. It joins two guests,
edits a cart, replays checkout, and verifies one order identity. No destructive
reset, migration rewrite or database deletion is included.
