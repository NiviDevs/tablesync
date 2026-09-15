# Review 1 demo

1. Run `docker compose up -d --build`, then run `npm run dev`.
2. Log in as a customer and join seeded table `SAGE-12`.
3. Open a second customer session, join the same code, and add items; both views update through WebSockets.
4. Start checkout and select **Simulate failure** for a participant. Show the persisted Saga compensation and voided fee ledger.
5. Reset, complete simulated payments, and show the committed Saga with its recorded fee ledger, then retrieve the single consolidated order at `GET /v1/table-sessions/SAGE-12/orders` from the gateway. A failed or compensated Saga produces no order.
6. Do not claim an autoscaling demo until Prometheus, KEDA, and real Kubernetes metrics are installed and verified.

All payment and load controls are simulation/test behavior. Reset removes only seeded demo records.
