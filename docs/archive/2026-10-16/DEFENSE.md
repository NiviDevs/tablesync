# Defense notes

- **Why microservices?** Session, order, payment, and restaurant workflows have different responsibilities and scaling profiles; Review 1 keeps each intentionally small.
- **Why one database?** It reduces operational cost during the prototype while schemas/table ownership prevent uncontrolled cross-domain writes.
- **Why RabbitMQ?** It supports explicit asynchronous events and queue-based KEDA scaling without Kafka's operational overhead.
- **Are payments real?** No. The mock provider is deliberately deterministic and models pending, processing, success, failure, timeout, and compensation.
- **Why a Saga?** A split payment must either fully commit or compensate already successful simulated payments; a distributed database transaction is inappropriate across provider boundaries.
- **What is actually verified?** Previous local Compose smoke tests exercised cart persistence and simulated payment commit/failure with order projection. There is no verified hosted deployment, full browser journey, live Ops dashboard or Kubernetes scaling demonstration. Some UI status labels are still static and must not be treated as telemetry.
