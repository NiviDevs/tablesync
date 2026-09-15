# Review 1 demo

1. Run `docker compose up -d --build`, then run `npm run dev`.
2. Log in as a customer and join seeded table `SAGE-12`.
3. Open a second customer session, join the same code, and add items; both views update through WebSockets.
4. Start checkout and select **Simulate failure** for participant C. Show persisted Saga compensation and no restaurant order.
5. Reset, complete simulated payments, and show the consolidated order in the restaurant portal.
6. Open Ops, trigger a labelled queue spike, and show RabbitMQ depth, KEDA target, and actual Kubernetes replica change.

All payment and load controls are simulation/test behavior. Reset removes only seeded demo records.
