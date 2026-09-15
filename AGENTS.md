# TableSync contributor guide

Read `docs/PROJECT_STATE.md` and the relevant area of `docs/STATUS.md` before making substantial changes. Deeper product and architecture context is in `docs/PROJECT.md` and `docs/ARCHITECTURE.md`.

- Keep the Review 1 vertical slice reliable; do not add speculative infrastructure.
- Preserve service ownership and update `docs/EVENTS.md` when event contracts change.
- Simulation must be explicitly labelled. Metrics and scaling states must come from real infrastructure.
- Never commit secrets; use `.env.example`.
- Prefer small, focused modules and tests for critical paths.
