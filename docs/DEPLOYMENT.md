# Deployment status

There is no newly verified deployment procedure from the documentation reset. Current UI, Compose, and Render configurations use different paths; see [PROJECT_STATE.md](PROJECT_STATE.md).

The proposed target is local Kubernetes, with temporary public QR access through a tunnel. See [deployment and access requirements](REBUILD_SPEC.md) and work packages W0/W4/W7 in [TEAM_HANDOFF.md](TEAM_HANDOFF.md).

The implementer must replace this status note with tested prerequisites, pinned tool versions, environment setup, migration/seed commands, image build/deploy commands, health checks, tunnel startup, and non-destructive shutdown/recovery steps. Record the environment and revision on which the procedure passed. Do not publish guessed commands as a verified quick start.

[Previous deployment notes](archive/2026-10-16/DEPLOYMENT.md) are historical and contain stale claims. Never run database volume deletion as a routine migration or reset.
