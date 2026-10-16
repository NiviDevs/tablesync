# Review 1 demo

1. Run `docker compose up -d --build`, then run `npm run dev`.
2. Open `/app?table=SAGE-12` and enter a guest name. This is guest entry, not authentication or a generated QR code.
3. Open a second customer session, join the same code, and add items; both views update through WebSockets.
4. Start checkout and select **Simulate failure** for a participant. Show the persisted Saga compensation and voided fee ledger.
5. Complete a simulated checkout and inspect `/restaurant` or `GET /v1/table-sessions/SAGE-12/orders`. One click currently simulates the entire table; do not present this as independent diner payment. The board is read-only. Repeated checkout can pay for the same cart again.
6. Do not claim an autoscaling demo until Prometheus, KEDA, and real Kubernetes metrics are installed and verified.

All payment and load controls are simulation/test behavior. There is no implemented reset UI or table turnover flow. Do not delete the database volume just to repeat the demo. Four-browser collaboration and the refreshed mobile UI still need verification; HTTP/build checks alone are insufficient.
