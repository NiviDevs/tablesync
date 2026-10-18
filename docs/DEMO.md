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
   replicas. Open Grafana. Run the cloud guide's load command and watch CPU/HPA.

Gateway routes requests; Session owns tables/guests; Order owns menu/cart/kitchen;
Payment simulates checkout; RabbitMQ delivers events; PostgreSQL keeps orders;
Prometheus/Grafana show infrastructure activity.

Show the actual measured result. If replicas do not rise, show CPU/HPA state
rather than claiming scale-up. Money is simulated and Kubernetes runs locally.
A tunnel provides public access, not hosted cloud compute.
