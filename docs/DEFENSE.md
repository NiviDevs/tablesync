# Assessment claims and limits

Use only claims supported by the current evidence ledger in [STATUS.md](STATUS.md).

- The proposed system demonstrates container orchestration, probes, resource budgets, telemetry, load testing, and pod autoscaling.
- Local Kubernetes is real Kubernetes. It does not establish managed-cloud deployment, cross-host resilience, or node autoscaling.
- k6 creates synthetic traffic. Application metrics and replica observations must be real.
- A public tunnel gives phones access to local compute; it does not relocate the backend to the cloud.
- Payment is simulated. A table-level Saga demonstration does not establish independent diner confirmations or real settlement.
- PostgreSQL is durable business storage; Redis is transient state; RabbitMQ transports the existing domain events.
- One database with logical service ownership is a deadline tradeoff, not proof of independent database isolation.
- HPA responding to load does not automatically prove improved latency. Report measured throughput, latency, and errors.

Do not claim any proposed capability before its verification gate passes. The historical defense notes are [archived](archive/2026-10-16/DEFENSE.md).
