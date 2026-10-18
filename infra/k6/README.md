# Local application load and HPA

Start `npm run cloud` first. Then, in a Docker-enabled shell:

```sh
RATE=100 DURATION=180s bash infra/k6/run.sh
```

For a short functional observation: `RATE=100 DURATION=20s COOLDOWN=5s bash infra/k6/run.sh`.
That short run does not prove scale-down; use the full default cooldown for assessment evidence.

This sends real, read-only requests through the gateway to Session's known-table
endpoint. It ramps for 30 seconds, sustains the chosen rate, then keeps recording
through 360 seconds with zero offered load. `DURATION` accepts seconds or minutes
(e.g. `180s`, `3m`). Do not expose this command through Ops or run against hosted
customer data. The old `smoke.js` remains a separate health-only check.

HPA scales Session only, 1–3 replicas at 60% of its 100m CPU request. Scale-down
stabilization is 300 seconds, then at most one pod per minute. The runner waits
for a valid Metrics Server target before starting. Readiness, not desired count,
proves a replica is serving.

Evidence goes to ignored `infra/k6/.local/<UTC time>` unless `EVIDENCE_DIR` is set:
`read-summary.json`, k6 output, and `scaling.jsonl` sampled about every five
seconds. It records HPA status/conditions, desired/Ready pods, CPU/memory and
per-pod Session request counters from real sources. Steady unexpected failures
must be below 1%; dropped iterations fail separately. Actual p95 is reported;
there is no invented latency target or promised improvement.

Start at 10, 25, 50 requests/s when calibrating an unfamiliar machine. If Session
is I/O-bound or gateway connections pin traffic to one pod, record that result.
Do not add busy loops or count Pending pods as a scaling success. A direct
Session experiment must be explicitly labelled as bypassing the gateway and
supply its private credential only locally. `session-read.js` records whether
that credential was used. A script or an HPA manifest alone is not scaling proof.

The optional `cart-correctness.js` uses an unused synthetic table created through
the owner screen. It requires `ALLOW_SYNTHETIC_WRITES=yes`, `TABLE_CODE`, and a
loopback `TARGET_URL`. It joins two guests, edits a cart, replays a checkout and
checks one order identity. It is not part of the read-load run. No destructive
reset, migration rewrite or database deletion is included.
