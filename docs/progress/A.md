# Role A progress

Branch: `feat/product-integration`. Isolated worktree: `/tmp/tablesync-role-a`.
Starting revision: `079b178d108175af8024137fa463ad41c550c0cb`.
The original checkout remains on `main`; B-owned files are untouched.

## F0 — complete, 2026-10-17

- Scope: reproducible Node/npm pair, normal build type checking, CI, legacy
  service smoke, and deployment/evidence notes.
- Commit: this F0 commit (`chore: establish reproducible development checks`).
- Runtime: verified SHA-256 of official Node 22.23.3 Linux x64 archive; bundled
  npm 10.9.9. Installed under `/tmp`, without changing the system runtime.
- Initial host: Node 26.11.1/npm 12.2.0. Fresh-worktree tests/typecheck/build
  failed before dependency installation (missing Fastify/TypeScript/Next).
- `npm ci` on the pinned pair: passed after allowing registry network access.
  A second offline clean install with the final lockfile passed (134 packages).
- `npm test`: passed all four workspace suites (five test files).
- `npm run typecheck`: passed.
- `npm run build`: passed with normal TypeScript checking and synthetic public
  Supabase settings. Without settings, legacy demo prerendering fails. Inside
  the sandbox, Next's detached TypeScript subprocess returned empty output;
  outside the sandbox the build passed.
- Docker 29.9.0 and Compose 5.6.0 installed by the user during execution.
  Stale supplementary groups initially denied daemon access; an approved
  `newgrp docker` shell now accesses the daemon successfully.
- All four service images built and verified Node 22.23.3/npm 10.9.9.
- Isolated `docker compose -p tablesync-role-a-f0 up -d --build --wait --wait-timeout 180`: passed; all seven containers healthy.
- `npm run smoke:services`: passed through the services gateway; local-demo rejection also verified.
- `git diff --check`: passed.
- Contract/migration changes: none.
- Integration request: B should use the runtime pins from this branch once the
  FOUNDATION CHECKPOINT is published. F1 remains required before the foundation checkpoint.
