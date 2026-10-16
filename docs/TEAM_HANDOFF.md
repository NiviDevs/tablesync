# Team handoff

Status: specification approved on 2026-10-16. The detailed execution plans below are written and await review; no application implementation has started. This is not a claim that all work fits within two days.

## Execution plans

- [Shared foundation and integration](superpowers/plans/2026-10-16-assessment-foundation.md): both contributors complete F0/F1 before splitting; return to F2 at the end.
- [Product integration](superpowers/plans/2026-10-16-product-integration.md): Contributor A completes P1–P5.
- [Cloud observability](superpowers/plans/2026-10-16-cloud-observability.md): Contributor B completes C1–C5, respecting the shared dependency gates.

Give an agent one task at a time with the shared contract and approved specification. Do not ask it to implement every plan independently.

## Shared rules

Read README, PROJECT_STATE, REBUILD_SPEC, STATUS, and AGENTS.md first. Preserve existing service ownership. Use synthetic data and clearly label simulated payments. Never present configuration as verification.

Each work package gets one branch, one primary owner, a small reviewable diff, and an evidence entry. Another contributor reviews boundary changes. Never edit another contributor's uncommitted work. Agree file ownership before parallel changes.

Before work splits, agree public API request/response shapes, authentication context, money units, order/session states, and error codes. Commit the contract before building callers. Prefer additive migrations. Changes to event contracts update EVENTS.md and relevant tests in the same change.

## Two-contributor assignment

**Contributor A: integration and product.** Own gateway/domain changes, migrations, the browser API adapter, guest and restaurant screens, and critical correctness tests.

**Contributor B: infrastructure and observability.** Own container/runtime setup, Kubernetes, metric collection, Grafana, k6, and Ops presentation.

A owns the public API contract. B proposes instrumentation hooks as a small patch for A to integrate into service files, avoiding simultaneous edits. B owns the Ops query contract and `apps/web/app/ops`; A owns shared layout/CSS changes unless explicitly handed off. Coordinate `package.json`, lockfile, Compose, and shared contracts before edits.

## Work packages and dependency gates

| ID | Owner | Depends on | Scope and likely files | Completion evidence |
|---|---|---|---|---|
| W0 Baseline | A + B | Spec review | package scripts, environment example, service smoke procedure, STATUS | Record revision and checks; document real setup blockers; agree contracts and image/runtime versions. |
| W1 Domain correctness | A | W0 | Session, Order, Payment, SQL migrations, contracts | Valid tables; immutable checkout; stable retry identity; one persisted order; failure/compensation checks. |
| W2 Instrumentation | B with A review | W0 | Shared metric helpers if useful, service hooks, health checks | Request/latency/error measurements respond to real requests; probes have distinct semantics. |
| W3 Product integration | A | W1 and frozen API contract | Web API adapter, guest/restaurant screens, gateway authorization | Two-browser flow, kitchen progression, identity rejection, no direct demo-domain writes. |
| W4 Local cluster | B | W0; readiness from W2 | `infra/k8s`, container files, migration runner | Clean cluster starts and passes service smoke checks; requests/limits and persistent storage verified. |
| W5 Monitoring and Ops | B | W2, W4 | `infra/monitoring`, Ops page and protected query adapter | Live graphs, source timestamps, missing-data states, counts matching Kubernetes. |
| W6 Scaling proof | B | W1 read safety, W4, W5 | `infra/k6`, HPA, evidence/runbook | Baseline, measured scale-up, cooldown, actual ready replicas, no fabricated load effects. |
| W7 Integrated rehearsal | A + B | W3, W5, W6 | DEMO, DEPLOYMENT, STATUS, CI | Phone QR, restaurant journey, scaling and recovery, replayable commands and results. |

B can build cluster/monitoring scaffolding while A fixes the domain. Neither treats scaffolding as a finished integration. W3 and W6 converge on the same backend; do not build a separate fake scaling service.

## Suggested timeboxes

- First half-day: W0 and contract freeze; assess whether W1 fits the remaining time.
- Remaining first day: W1/W2 and initial W4 in parallel.
- Second day: W3 alongside W5/W6; stop adding features.
- Final available block: W7, fixes, evidence capture, and a backup recording of an actual run.

If only two days remain, this is ambitious. Cut optional analytics and visual polish first. If core checkout repair exceeds the budget, reduce the demonstrated product journey and state the limitation. Do not substitute unsafe duplicate orders or falsely independent payments. If HPA does not trigger, report the measured blocker and use the calibration rule in the spec.

## Bounded task template for an agent

```text
Task ID and objective:
Read: AGENTS.md, docs/PROJECT_STATE.md, docs/REBUILD_SPEC.md,
      docs/TEAM_HANDOFF.md, and relevant existing code/tests.
Allowed files:
Files owned by another contributor:
Prerequisites and agreed contract:
Required observable behavior:
Out of scope:
Acceptance checks:
Rollback / compatibility constraint:

Implement only this task. Preserve unrelated work. Do not add another
backend path, service, or infrastructure dependency without recording
why the agreed task cannot be completed otherwise. If a prerequisite
is missing, report the exact blocker instead of silently inventing it.
Return changed files, checks with results, remaining limits, and an
updated STATUS evidence entry. Do not mark proposed behavior verified.
```

## Integration checklist

- Both contributors use the same revision of the API/event contracts.
- No new direct browser writes to business tables.
- Guest ownership and staff access are enforced server-side.
- Schema changes preserve existing data and have a migration procedure.
- Runtime configuration contains no committed secrets.
- Monitoring labels have bounded cardinality and no personal data.
- All dashboard values identify their source and environment.
- The integrated demo uses the same application code as the load test.
- Required checks pass once after the final integration; failures remain visible.

## Definition of handoff-ready

A teammate can select a work package, know its prerequisites and owned files, understand the intended behavior, and judge completion without reading historical chat. Detailed code-level steps follow approved design; this document prevents concurrent contributors from making incompatible choices first.
