# Five-minute presentation

Start the chosen environment. Keep owner, operator and guest windows separate.

1. **Owner:** demo login, Menu. Add/edit a dish, change price or hide it. Open
   Tables and show the QR for SAGE-12.
2. **Guests:** join from two private browser windows. Add different dishes.
   Show the shared total and that each guest edits only their own lines.
3. **Payment:** click **Simulate table payment**. No card or money is involved.
   Wait for kitchen confirmation.
4. **Kitchen:** start preparing, mark ready, then served. Close the seating for
   new guests after serving its orders.
5. **Business:** Dashboard, today's date / one day. Show simulated sales,
   quantities, orders, popular dishes and table totals. Empty periods show zero.
6. **Cloud:** operator demo login. Show real traffic, latency, errors and ready
   replicas. Open Grafana. Run `npm run cloud:load` in another terminal and watch CPU/HPA.

For Compose, run `npm run load:smoke`, then `npm run load` instead. Watch the
DevOps **Live metrics** graphs; request rates use a one-minute window and update
after Prometheus scrapes. The read load exercises gateway and Session only.
Kubernetes also shows CPU, memory and desired/Ready replica history.

The DevOps **Control deck** also offers **Simulation** for a repeatable workload
walkthrough. Select a preset and duration, then **Apply load**. Generated traffic
raises latency and resource usage, Session pods become Pending then Running,
and latency settles as capacity grows. **Stop load** drains traffic and shows
cooldown before replicas shrink. Inspect the generated event stream, filter by
service, or pause updates. **Reset** clears the scenario. **Measured** returns
to real telemetry. The simulation does not send server requests, create orders,
run payments, or change Kubernetes resources.

Run the model check with Node.js 22.23.3:
`node --experimental-strip-types --test apps/web/lib/ops-simulation.test.mjs`.

Gateway routes requests; Session owns tables/guests; Order owns menu/cart/kitchen;
Payment simulates checkout; RabbitMQ delivers events; PostgreSQL keeps orders;
Prometheus/Grafana show infrastructure activity.

Show the actual measured result. If replicas do not rise, show CPU/HPA state
rather than claiming scale-up. Money is simulated and Kubernetes runs locally.
A tunnel provides public access, not hosted cloud compute.
