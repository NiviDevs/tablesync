# Defense notes

- **Why microservices?** Session, order, payment, and restaurant workflows have different responsibilities and scaling profiles; Review 1 keeps each intentionally small.
- **Why one database?** It reduces operational cost during the prototype while schemas/table ownership prevent uncontrolled cross-domain writes.
- **Why RabbitMQ?** It supports explicit asynchronous events and queue-based KEDA scaling without Kafka's operational overhead.
- **Are payments real?** No. The mock provider is deliberately deterministic and models pending, processing, success, failure, timeout, and compensation.
- **Why a Saga?** A split payment must either fully commit or compensate already successful simulated payments; a distributed database transaction is inappropriate across provider boundaries.
- **What is real in the cloud demo?** Containers, broker, metrics, load, and Kubernetes scaling are real when deployed locally. The UI labels test controls and only reports measured infrastructure state.
