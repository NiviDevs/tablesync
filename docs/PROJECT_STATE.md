# Current project state

The active guest/owner/kitchen UI uses the service gateway. Dish and table
management, shared carts, simulated checkout, kitchen progression and daily
analytics are implemented. The local launcher supplies explicit demo identities
without manual account provisioning.

B owns Kubernetes, monitoring, Ops and load/scaling scripts. Current deployment
information is in [B progress](progress/B.md) and [cloud setup](../infra/k8s/README.md).
Use [README](../README.md) to run and [DEMO](DEMO.md) to present. The old audit
that described an active separate Supabase business-data path is superseded.
