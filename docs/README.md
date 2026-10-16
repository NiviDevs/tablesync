# Documentation guide

Baseline date: 2026-10-16.

## Reading order

1. [PROJECT_STATE.md](PROJECT_STATE.md): what the source currently contains and what was not verified.
2. [REBUILD_SPEC.md](REBUILD_SPEC.md): proposed destination and acceptance criteria.
3. [TEAM_HANDOFF.md](TEAM_HANDOFF.md): ownership, sequencing, and bounded work packages.
4. [STATUS.md](STATUS.md): evidence ledger, updated after each merged work package.
5. [EVENTS.md](EVENTS.md): existing event contracts, updated when producers or consumers change.

## Authority and maintenance

The user's instructions and `AGENTS.md` govern contributor behavior. Current-state claims belong in PROJECT_STATE and STATUS. Proposed behavior belongs in REBUILD_SPEC until implemented and verified. TEAM_HANDOFF organizes work; it does not override contracts or approve a redesign.

Use these status labels: **proposed**, **implemented, unverified**, **verified**, **blocked**, and **deferred**. A verified claim must identify a command or manual procedure, result, date, and relevant commit. Do not infer a deployment from a configuration file.

Do not create another master directive or duplicate roadmap. Keep additions in the relevant document. Link implementation evidence from STATUS instead of repeating it across documents. Record architectural deviations in the decision table in REBUILD_SPEC before dependent work starts.

## Historical material

[The archived baseline](archive/2026-10-16/README.md) preserves the previous documentation. Archived plans are context, not active instructions. Several old claims contradict the source. The historical hosted-demo plan remains at [its original path](superpowers/plans/2026-09-15-hosted-guest-demo.md), with an explicit historical notice.

No historical file should be used to reintroduce deferred services, fake telemetry, or a second data path.
