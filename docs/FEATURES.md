# TableSync: completed work, technology and product rules

Updated 18 October 2026. This is the combined record of Role A's product work
and Role B's cloud/observability work. Start with [README](../README.md) to run
it, or [DEMO](DEMO.md) for the presentation sequence.

## What the product does

TableSync connects a restaurant's guests, owner, kitchen and operator to the
same application. Guests place a shared table order, the kitchen prepares it,
the owner manages the menu and sees business performance, and the operator
sees what the infrastructure is doing. Payments are simulated throughout.

### Guest view

- Enter through a table URL or locally generated QR code.
- Join a known table with a name and a separate guest identity.
- Share one cart across independent browsers and see who ordered each dish.
- Add dishes, set quantities and remove only your own lines.
- See the server-calculated table total in INR.
- Simulate payment for the whole table in one action.
- Recover the same checkout after refresh or a lost response.
- See payment pending, payment committed but kitchen delivery pending, and order
  received as separate states.
- See closed/expired-access states and rejoin for the next seating.
- Receive changes through non-overlapping two-second polling, with explicit
  error/stale states instead of silently presenting old information as live.

### Owner view

- Add/edit dish names, descriptions, icons, prices and availability.
- Hide dishes from new ordering without erasing historical orders.
- Create tables and generate their QR locally from the current web origin.
- Remove unused tables; tables with seating history retain their records.
- See occupancy, participant counts, time seated and current order status.
- Close a seating after its orders are served; reuse the table for new guests.
- View simulated sales, served orders, dish quantities, average order and
  ordering-participant counts.
- Compare daily totals and per-dish quantities, order counts and simulated sales.
- See sales/order totals by table and current seated guest counts.
- Filter one, seven, thirty or ninety days through a chosen date; click a chart
  day for that day's dish performance. Days without sales show zero.

Sales use all served service orders in the selected period, not only the
kitchen's latest 100 orders. Day boundaries use Asia/Kolkata and the order's
creation date. These totals describe simulated sales, not profit or bank receipts.

### Kitchen view

- Receive persisted consolidated orders after simulated payment commits.
- See table code, dish quantities, saved prices and order status.
- Advance CONFIRMED, PREPARING, READY, then SERVED, one step at a time.
- Safely repeat an action without advancing twice.
- Move served orders out of the active queue while retaining order history.

### DevOps view

- Operator-only view of real Prometheus samples.
- Application scrape reachability, requests per second, p95 latency and 5xx rate.
- Kubernetes desired/ready Session replicas, CPU and memory in cloud mode.
- Durable open-seating count from the Session database.
- Environment, source timestamps and fresh/stale/unavailable states.
- Links to provisioned application and Kubernetes Grafana dashboards.

Local Compose collects real application metrics. Kubernetes-only values remain
unavailable there. The cloud version adds cluster metrics and Grafana; the UI
never substitutes pretend replicas, charts or healthy badges for missing data.

## Product rules enforced by the backend

| Rule | How it is enforced |
|---|---|
| Only real registered tables can be joined | Session validates the registry; unknown reads do not create rows. |
| One active seating per physical table | Database uniqueness and locks serialize concurrent first joins. |
| A browser retry must not create another guest | A persistent join key returns the same participant for the same payload. |
| Guests edit their own cart lines only | Verified tokens supply participant/session identity; client owner IDs are not trusted. |
| A guest cannot choose a lower price | Order reads price and availability from its own catalog. |
| Quantities stay within bounds | API validation accepts integer quantities 1–20. |
| Concurrent edits cannot silently overwrite each other | Cart mutations lock rows and require the expected revision; stale edits get a conflict. |
| Paid/submitted orders keep their agreed contents | Checkout freezes names, quantities and prices into an immutable snapshot. |
| A revision cannot be purchased twice | Database uniqueness, operation keys and Payment payload fingerprints preserve one purchase identity. |
| A missing reply is not proof of failed payment | Checkout remains pending until reconciliation establishes the stored outcome. |
| Kitchen receives one order | Event IDs and checkout/order uniqueness make duplicate delivery idempotent. |
| Kitchen progression stays sequential | Server-side transition checks reject skipped/backward states and accept repeat targets. |
| Closure cannot race a new purchase | OPEN/CLOSING/CLOSED coordination plus an Order cart seal blocks late writes. |
| Unfinished orders prevent closure | Pending payments, pending order delivery and unserved orders cause a conflict. |
| New guests do not inherit the previous seating | Closing preserves history; the next join creates a different session ID. |
| Owners act only for their restaurant | Verified staff identity maps to a server-controlled restaurant assignment. |
| Ops is reserved for operators | Both gateway middleware and the Ops route enforce the operator role. |
| Internal services do not trust arbitrary forwarded identity | An internal bearer credential is required before accepting forwarded scope. |

Menu prices accept integer paise equivalent to ₹1–₹100,000. Names, descriptions,
icons, table names and guest names are bounded. Hiding a dish stops new additions;
menu edits apply when a guest next adds/changes a line. Submitted order snapshots
keep their recorded values.

## The technology and why it matters

| Technology | Role in this project |
|---|---|
| Next.js, React, TypeScript | Guest/owner/kitchen/Ops screens, same-origin API proxy and standalone web image. |
| Node.js and Fastify | Small gateway/domain services with explicit HTTP contracts. |
| PostgreSQL | Registry, cart revisions, checkout snapshots, orders, payment records and outboxes. |
| Redis | Transient presence; it is not the authoritative cart/order database. |
| RabbitMQ | Durable event publication and asynchronous payment-to-order delivery. |
| JWT/JWKS and jose | Scoped guest credentials and verified staff/operator signatures and roles. |
| Docker and Compose | One-command local environment with reproducible service images. |
| Minikube and Kubernetes | Actual deployments, service discovery, probes, resource budgets and persistent storage. |
| prom-client and Prometheus | Real counters, latency histograms, database-derived session gauge and cluster scraping. |
| Grafana | Provisioned application and Kubernetes dashboards backed by Prometheus. |
| kube-state-metrics / cAdvisor / Metrics Server | Replica state, pod resource data and CPU measurements for HPA. |
| Kubernetes HPA | CPU-based Session scaling from one to at most three replicas. |
| k6 | Read-only application traffic for the scaling presentation, with captured results. |

Node 22.23.3/npm 10.9.9 are pinned for application builds. The Node container base
is pinned by digest. The recorded cluster uses Minikube 1.37.0 and Kubernetes
1.34.1. Download helpers verify the official tool checksums.

### Service ownership

- **Gateway:** public routes, guest/staff credentials, bounded forwarding and Ops.
- **Session:** table registry, seating lifecycle and participants.
- **Order:** catalog, cart, frozen checkout, kitchen and business summaries.
- **Payment:** deterministic simulated payment, attempt/compensation records and
  committed-payment event publication.
- **Web:** presentation and interaction; it does not write business database tables.

This is one business-data path. The old Supabase business-demo tables are no
longer an active second implementation. Supabase identity remains available for
configured deployments; the explicitly enabled educational demo uses a private
RS256 issuer and the same gateway verification/role mapping. Staff credentials
stay in HTTP-only cookies. Guests use session-scoped credentials.

## Reliability features beneath the UI

- Database transactions and row/advisory locks serialize important decisions.
- Prices and totals use integer minor units with an explicit currency.
- Frozen checkout lines protect orders from later menu/cart edits.
- Payment and Order persist outgoing events alongside their state changes.
- Outbox publishers wait for broker confirmation before marking events sent.
- Stable stored event IDs survive publish/retry/restart paths.
- Order consumers deduplicate events and use bounded retry/dead-letter handling
  so one invalid event does not loop forever or block valid work.
- Background reconciliation resolves uncertain checkout outcomes. Terminal
  compensated failures retain history and allow an explicit new attempt.
- Numbered SQL migrations record checksums, serialize runners and reject edits
  to already applied history. Older local schemas receive a backup before their
  initial migration baseline; startup never deletes data to make migration pass.
- PostgreSQL and Redis error listeners keep disconnect events from crashing the
  process merely because a dependency became unavailable.
- Health/readiness are separate: `/livez` checks the process, `/readyz` checks
  required dependencies with a deadline; `/api/health` checks the web process.
- Graceful shutdown drains HTTP and closes connections with a bounded deadline.

The payment Saga also keeps simulated per-participant attempts, compensations
and fee-ledger records. The presented UI is deliberately one table-level mock
checkout; it does not claim independent real payments, refunds or payouts.

## Cloud and observability features

- One private Minikube profile/namespace deploys the actual app, not a separate
  synthetic service built just to make scaling appear to work.
- Deployments have resource requests/limits and liveness/readiness probes.
- PostgreSQL and RabbitMQ use persistent volumes in Kubernetes.
- Revision-named migration Jobs complete before application rollout.
- Configuration and ignored Secrets are separate; private services use ClusterIP.
- HTTP counters/histograms use bounded service/route/method/status labels.
  Guest names, table IDs and request IDs do not become high-cardinality labels.
- p95 comes from histogram aggregation, not averaging individual pod p95 values.
- Session samples the durable OPEN seating count every 15 seconds. Failed/stale
  samples become unavailable; replicas aggregate that gauge with max, not sum.
- Prometheus scrapes application, cluster and RabbitMQ sources. Grafana displays
  traffic, errors, latency, CPU/memory, desired/ready replicas and queue data.
- The Ops reader exposes fixed queries with deadlines and a short cache;
  arbitrary Prometheus queries are not accepted from the browser.
- Source samples older than 45 seconds are marked stale. Missing samples remain
  unavailable rather than appearing as zero or healthy.
- HPA scales **Session only**, min 1/max 3, targeting 60% of requested CPU.
  Scale-down has a 300-second stabilization window and removes at most one pod
  per minute under the configured policy.
- `npm run cloud:load` sends read-only traffic and records real metrics, HPA,
  pods and k6 output. Its default short window is 60 seconds load plus 60 seconds
  cooldown; that does not guarantee enough time to observe full scale-down.

The configured cluster budget is four CPUs and 6 GiB. This demonstrates pod
orchestration on one local machine, not multi-machine high availability.

## Delivery and developer setup completed

- Shared HTTP types and documented API/event contracts.
- Root-workspace lockfile installs and service images that include telemetry.
- Next standalone image and minimal web health endpoint.
- CI configuration for builds/type checks and the earlier correctness suites.
- `npm run demo`: generate private local credentials, build/start containers,
  apply migrations and start account-free demo role selection.
- `npm run demo:stop` and `demo:logs`: preserve state and inspect service errors.
- `npm run cloud`, `cloud:open`, `cloud:stop`, `cloud:load` and `cloud:password`:
  simple controls for startup, access, load and Grafana login.
- Short README/startup/walkthrough documents replacing obsolete plans, duplicate
  archives and stale placeholder-service notes. Git history preserves old work.

## Combined branch record

Role A (`feat/product-integration`) delivered the foundation, migrations,
contracts, identity boundary, cart/checkout/payment reliability, kitchen/closure,
guest and owner UI, menu/table management, analytics, local startup and docs.

Role B (`feat/cloud-observability`) delivered shared telemetry, probes/shutdown,
workspace images, Kubernetes/bootstrap/persistence, Prometheus/Grafana, live Ops,
demo cloud identity, HPA/load/capture scripts and deployment evidence. Shared
service/image hooks were integrated through focused handoffs, then the committed
cloud branch was merged into the product branch for the final main integration.

Selected milestones: `66ea50c` foundation; `9177a38` checkout; `b8fc4b7` browser/
kitchen; `0ff3bc6` earlier browser coverage; `a85efae` owner features; `fb9b2c4`
telemetry; `c373def` cluster; `0978d6e` Ops; `e1e8d09` monitoring; `fc1bfa3` local
demo startup; `1789319` cloud identity/HPA/load controls. Equivalent cherry-picks
exist on the other branch; they represent the same changes, not extra features.

## Observed results and honest limits

- Earlier product work passed 23 real-PostgreSQL and three browser checks,
  including shared ordering, lost-reply recovery, kitchen progression and reuse.
- The local app has started successfully with generated demo credentials; owner
  sign-in, menu access and sales access returned successful responses.
- B deployed the actual cluster and monitoring stack. A committed order survived
  an actual Order-process restart; rerunning migrations preserved it.
- A real database outage exposed idle-pool crashes, which were corrected. B
  reports liveness remained available, readiness became unavailable and recovered,
  without application restarts after the correction.
- The Redis error-listener correction is implemented; a separate real Redis
  outage run is not claimed.
- HPA and load controls are implemented. Actual scale-up/down or performance
  improvement must come from the measured run, not merely the manifests.
- The user asked to stop extra testing and focus on the presentation. The old
  check results above are historical; later changes are not claimed fully retested.
- Remote CI, real Supabase email sign-in, phone/tunnel access, real payment
  collection and production/high-availability behavior are not established here.

For precise routes and event fields, use [API](API.md) and [events](EVENTS.md).
For current runtime notes, use [A](progress/A.md) and [B](progress/B.md).
