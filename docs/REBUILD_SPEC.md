# TableSync assessment rebuild: approved design

Date: 2026-10-16. Status: **approved by the user on 2026-10-16; implementation pending**.

This document defines the proposed destination, not current behavior. The user requested documentation and a team handoff, not implementation during this session. The user approved this specification. The [execution plans](superpowers/plans/2026-10-16-assessment-foundation.md) are now written and await their own review.

## 1. Intent and constraints

Build a stable restaurant operations demonstration whose strongest evidence is cloud engineering: containerization, orchestration, observability, load testing, autoscaling, and recovery.

Confirmed requirements:

- Seated guests, not advance reservations.
- QR entry, owner visibility into tables, and a kitchen order queue.
- Live infrastructure graphs and real scaling behavior take priority over broad product design.
- A few days remain; at least two contributors can work in parallel.
- Avoid credit-card-dependent infrastructure. Local Kubernetes is acceptable for the scaling demonstration.
- Documentation must let teammates and smaller agents work without inventing architecture.

Planning assumptions: one seeded restaurant, synthetic guest data, simulated payments, a laptop-hosted demonstration, and one application service selected for HPA. These are deliberate scope limits, not production guarantees.

Success means a new contributor can identify the authoritative data path, run the documented setup, complete the restaurant journey, and reproduce measured scaling without hidden manual fixes.

## 2. Scope and priorities

### Required

1. One backend path for the guest and restaurant screens.
2. Validated table entry, separate guest identities, cart ownership, server-calculated totals, and a persistent order.
3. Kitchen transitions and an owner table view, with explicit loading, error, and stale-data states.
4. Containerized deployment on a local Kubernetes cluster with health probes and resource budgets.
5. Prometheus collection, Grafana dashboards, and a small custom Ops overview using real sources.
6. k6 application traffic, HPA scale-up/scale-down evidence, and a pod replacement demonstration.
7. Reproducible setup, CI checks, demo instructions, and honest environment labels.

### Optional only after required gates pass

- Basic order counts and gross simulated sales by day/week/month.
- Small menu/table management improvements.
- A permanent free hosted preview using the same application contracts.

### Deferred

CRM, reservations, loyalty, campaigns, subscription plans, delivery/dispatch services, real money, KEDA, tracing infrastructure, multi-region deployment, and node autoscaling. Do not add these to make the architecture diagram larger.

Independent split-payment UX is deferred from the critical path. Preserve existing service Saga tests and label the assessment's table-level checkout as simulating all payers. The current browser's paid flags must not masquerade as that Saga.

## 3. Architecture decision

### Alternatives considered

| Approach | Benefit | Cost / decision |
|---|---|---|
| Restore the service-backed vertical slice | Reuses backend code and provides meaningful orchestration evidence | Requires browser/API integration and correctness fixes. Recommended. |
| Rewrite into a modular monolith | Fewer runtime dependencies | Replaces substantial code during a short deadline. Not selected. |
| Expand both Supabase demo and microservices | Preserves current screens quickly | Maintains conflicting business logic and produces unrelated scaling evidence. Rejected. |

### Proposed runtime

```text
Phone / browser
      |
Next.js web (same-origin API proxy)
      |
API gateway (one replica initially)
      |------------------|------------------|
   Session             Order             Payment
      |                  |                  |
      +-------- PostgreSQL: owned tables ---+
      |
 Redis: transient presence

RabbitMQ: existing domain events and order projection
Prometheus: application and cluster metrics
Grafana / protected Ops overview: read-only presentation
Metrics Server: CPU measurements for HPA
k6: controlled local application traffic
```

Preserve Gateway, Session, Order, and Payment. Do not create restaurant, auth, delivery, or dispatch deployments for this deadline. Keep backend JavaScript and frontend TypeScript; a language rewrite is not a prerequisite.

Browser domain writes go through the gateway. Remove `apps/web/lib/demo.ts` from the active product path only after equivalent screens pass against services. Supabase may remain an identity provider; its `demo_*` schema must not remain a second source of business truth.

Use the same application images and contracts for Compose and Kubernetes. Externally hosted deployments, if added later, change environment configuration rather than business logic.

## 4. Ownership and data model

| Owner | Responsibility | Storage |
|---|---|---|
| Gateway | Public API composition, identity validation, bounded proxying | No authoritative business data |
| Session | Known physical tables, seating sessions, participants, table lifecycle | PostgreSQL; Redis only for transient presence |
| Order | Seeded menu, carts, immutable checkout snapshots, orders, kitchen lifecycle | PostgreSQL and owned outbox |
| Payment | Deterministic simulated payment Saga, attempts, outcomes | Existing Payment-owned PostgreSQL tables |
| Web | User interaction and display | No authoritative business state |

The table registry in Session and menu catalog in Order are explicit proposed extensions of the existing slice. Do not invent a second restaurant service or let the gateway write these tables. Keep one seeded restaurant; include restaurant identity in access checks and records rather than implying tested multi-tenant support.

Separate a physical table from its seating session. A table has at most one active seating session. Unknown table codes return not-found rather than creating tables on reads. Persist these constraints in the database.

Represent money in integer minor units with an explicit currency. Existing amounts require a documented migration/conversion; do not silently reinterpret rupee values as paise. Order lines retain name, quantity, unit price, and total at submission time.

## 5. Minimum product behavior

### Guest

Scan a table URL, enter a display name, and receive a server-issued session-bound credential. Name or a client-chosen participant ID alone does not authorize writes. Guests can edit only their own cart lines. The server validates membership, menu availability, quantity, and prices.

Use bounded polling for the assessed UI initially, targeting updates within three seconds under normal demo conditions. Clearly identify polling in technical documentation. Reconnect and refresh recover durable state. WebSocket infrastructure can remain, but neither correctness nor scaling depends on process-local rooms.

### Checkout

Freeze an immutable cart snapshot before invoking simulated payment. Reject edits against a frozen checkout. A client retry uses the same operation key; concurrent submissions cannot create duplicate charges or orders. Payment and Order must reference the same snapshot identity and amount.

Model checkout as editing, pending, committed, or failed. A transient timeout does not immediately unlock the cart: first reconcile the payment outcome. On a terminal compensated failure, allow an explicit new attempt. Once committed, the snapshot cannot be purchased again.

Preserve the existing committed-Saga order projection, replacing mutable-cart reads with the frozen snapshot contract. Use stable event IDs, durable outbox publication where required, and idempotent consumers. Document every changed contract in EVENTS.md. Report payment committed but order pending as pending delivery, not a finished restaurant order.

### Kitchen and owner

An order progresses through `CONFIRMED`, `PREPARING`, `READY`, and `SERVED`. Only authenticated staff for the seeded restaurant may advance it. Repeating an already applied transition is safe; skipping or reversing transitions returns a conflict.

Owner view shows known tables, guest count, active order status, and time since seating. It distinguishes an occupied table from a customer currently online. Staff can close a seating session only after its orders finish; reopening creates a new session without deleting history.

Do not use fabricated charts as business analytics. Optional sales summaries aggregate completed orders, label the amounts simulated, and define day/week/month boundaries in Asia/Kolkata. They show zero or empty states when there are no records.

## 6. Access and public exposure

Reuse Supabase staff sign-in where practical. Validate issuer, audience, signature, expiry, and server-side restaurant membership before accepting staff actions. A valid login alone is not staff authorization. Keep role assignments server-controlled. Do not introduce a custom password system.

Guest credentials are opaque or signed and scoped to one participant/session. Never trust a browser-supplied owner ID without matching that credential. Add bounded request sizes and rate limits to public mutations.

Keep PostgreSQL, Redis, RabbitMQ management, Kubernetes API, and Prometheus private. Ops requires an operator role; backend adapters expose only allowlisted read-only queries with bounded ranges. Never send Kubernetes credentials or a database service key to browsers.

For QR access, prefer one public web origin with a server-side API proxy. A temporary Cloudflare tunnel exposes only that origin. If access controls are unfinished, do not publish staff or Ops endpoints; rehearse through local access instead. Existing permissive Supabase policies are not an acceptable public deployment baseline.

## 7. Deployment and resource budget

Use one local Minikube node with a supported container driver. Start with approximately four logical CPUs and six GiB of cluster memory, then measure. This is a planning budget, not a validated command or capacity guarantee. Leave capacity for the host, browser, and k6; reduce optional components if memory pressure appears.

Keep one replica each of the gateway, Order, Payment, and web initially. Use persistent volumes for local PostgreSQL and RabbitMQ state. Do not scale databases for this demonstration. Persisted local volumes are not a backup or high-availability claim.

Use distinct liveness and readiness checks: liveness checks process health; readiness checks required dependencies with short timeouts. A broker/database outage should not cause every process to restart continuously. Provide startup allowances and graceful shutdown.

Use resource requests/limits on application pods. Configuration belongs in ConfigMaps; credentials belong in uncommitted Kubernetes Secrets or local environment inputs. Pin tested image versions and provide an explicit migration Job or documented one-shot migration step. Never use volume deletion as a normal reset procedure.

## 8. Metrics and Ops contract

| Display | Authoritative source | Meaning |
|---|---|---|
| Request rate | Application request counter | Requests/second by service and route template |
| p95 latency | Application duration histogram | Aggregated histogram quantile; never average per-pod percentiles |
| Error rate | Application response counters | 5xx fraction; show validation failures separately |
| CPU / memory | Kubelet/container metrics | Actual pod consumption with units |
| Desired / ready replicas | Kubernetes state via kube-state-metrics | Desired replicas are not evidence of ready pods |
| HPA state | HPA conditions and target metrics | Current/target utilization and scaling limitations |
| Queue depth | RabbitMQ metrics | Ready and unacknowledged messages separately |
| Active seating sessions | Session database-derived metric | Open business sessions, not WebSocket room count |

Use low-cardinality labels: service, method, route template, and status class. Never label metrics with guest names, phone numbers, table/session IDs, or raw URLs. Keep request correlation IDs in structured logs, not metric labels.

Start with a 15-second scrape interval and a five-second dashboard refresh. Show collection timestamps and the selected environment. Mark data stale after 45 seconds without fresh samples. A failed query displays unavailable rather than zero or a static healthy badge.

Grafana owns detailed graphs. The custom Ops screen shows environment, health, traffic, latency, errors, replica state, and links to detailed dashboards. Do not build a general-purpose Prometheus query editor, Kubernetes control panel, or remotely triggered k6 button.

## 9. Autoscaling experiment

First candidate: Session service, after reads are side-effect-free and replica safety is tested. Its durable state lives outside the process. Keep gateway at one replica to avoid falsely claiming cross-replica WebSocket support.

Use CPU-based HPA with an initial target of 60% of requested CPU and a range of 1–3 replicas. Metrics Server must be healthy; all target containers need CPU requests. Treat these values as calibration starting points, not measured optimal settings.

Before HPA, establish one-replica throughput and latency. Then use k6 against a pre-seeded application's read endpoints with controlled ramp, steady load, and cooldown. Use a separate small correctness scenario for cart writes so retries and duplicate behavior are tested without polluting the load experiment.

Record request rate, p95, error fraction, CPU, desired replicas, and ready replicas on the same timeline. Verify replicas genuinely become ready and traffic reaches them. Continue cooldown long enough for the configured HPA stabilization window.

A database-bound endpoint may not create enough CPU demand for HPA. Timebox calibration to two hours. If it does not scale, record that result and reassess the target/workload. Do not add hidden busy loops, fake counts, or claim a scaling win from a health endpoint. A synthetic CPU benchmark, if separately used for teaching, must be labeled synthetic and cannot replace the application result.

Acceptance: actual scale-up from one to at least two ready replicas, later scale-down, no lost committed orders, and saved k6/metric evidence. Target less than 1% unexpected HTTP failures during the assessed steady phase. Report actual p95; performance improvement is a measured finding, not a promised outcome. Separate expected validation failures from infrastructure errors.

This demonstrates pod autoscaling on one machine, not new cloud nodes or high availability across hosts.

## 10. Migration and rollback

1. Record the current revision, schemas, and available baseline checks. Keep the existing service slice runnable.
2. Add numbered, backward-compatible service migrations for registry/lifecycle/snapshot changes. Back up any non-disposable database first.
3. Move browser access behind one typed API adapter. Do not maintain dual writes to Supabase demo tables and service tables.
4. Verify the complete service-backed flow before removing obsolete imports or public demo routes.
5. Keep old Supabase data untouched. No automatic transfer of real contacts or payment flags is authorized. Use synthetic seed data for the new demo.
6. Roll back application changes to the recorded baseline only if the additive schema remains compatible. For destructive migration proposals, require a separate backup/restore plan before execution.

Do not rewrite already applied migrations to make history look cleaner. Confirm which migrations ran before resolving duplicate Supabase versions.

## 11. Verification gates

- **Foundation:** clean setup, tests/typecheck/build, known configuration, and a service-backed smoke test. Repair stale scripts instead of recording false passes.
- **Product:** two independent guest sessions, ownership rejection, frozen-cart rejection, retry/concurrent-submit checks, one kitchen order, valid kitchen progression, and persisted state after restart.
- **Access:** unauthenticated staff mutation fails; wrong restaurant/guest credentials fail; secrets are not in browser responses.
- **Cluster:** images start, migrations apply safely, probes work, pods fit resource budgets, and replacement preserves data.
- **Telemetry:** a real request changes counters; source failure produces stale/unavailable UI; replica counts match Kubernetes.
- **Scaling:** the experiment in section 9 produces saved evidence, including cooldown.
- **Presentation:** a phone completes QR entry, two browser sessions share an order, kitchen completes it, and an operator follows the runbook without code edits.

CI runs relevant unit/contract tests, typecheck, and a production build on a pinned supported Node release. Add browser coverage for the critical journey when the backend path is fixed. Do not call lint verified until the current `next lint` script is replaced with a working lint command or explicitly removed from required checks with an explanation.

## 12. Decision record

| Decision | Status | Reason |
|---|---|---|
| Cloud engineering is the assessment priority | Confirmed intent | User direction |
| Seated guests; no reservations | Confirmed intent | User direction |
| Local Kubernetes acceptable | Confirmed intent | User direction |
| Service-backed product; retire direct demo writes | Approved design; not implemented | Shared logic and credible scaling evidence |
| Polling for assessed UI; gateway stays singleton | Approved design; not implemented | Avoid cross-replica WebSocket work during deadline |
| Table-level simulated checkout for minimum scope | Approved design; not implemented | Preserve Saga while deferring independent payer orchestration |
| Session as first HPA target | Approved candidate; requires measurement | External durable state; validate workload suitability |
| Public tunnel for temporary QR access | Approved design; not implemented | No credit-card dependency; same local application |
| CRM and permanent cloud hosting outside critical path | Approved design; not implemented | Protect completion time |

## References

Checked during planning on 2026-10-16. Provider limits can change.

- [Kubernetes HPA walkthrough](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale-walkthrough/): Metrics Server and an actual scaling experiment.
- [Kubernetes HPA behavior](https://kubernetes.io/docs/concepts/workloads/autoscaling/horizontal-pod-autoscale/): scaling behavior and stabilization.
- [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/): temporary public access to a local service.
- [Render Free limits](https://render.com/docs/free) and [scaling limits](https://render.com/docs/scaling): not the autoscaling platform for this assessment.
