# Architecture

```text
Browser: guest / owner / kitchen / DevOps
  Next.js web and same-origin proxy
    API gateway: identity and routing
      Session: tables, seatings, participants
      Order: menu, carts, checkout snapshots, kitchen, analytics
      Payment: deterministic simulated payment
    PostgreSQL: durable data
    Redis: transient presence
    RabbitMQ: payment/order event delivery
Prometheus: application and Kubernetes metrics
Grafana: graphs; operator Ops page: bounded live queries
```

The active browser uses the service API, not Supabase business tables. Prices
are integer paise. Submitted lines keep their name, quantity and price. Cart
revisions and checkout identities prevent duplicate orders on retries.

Kitchen states are CONFIRMED, PREPARING, READY, SERVED. Closure seals the seating;
new guests receive a new seating ID. Sales use served orders and Asia/Kolkata dates.

Guests receive participant/seating credentials. Staff use JWT/JWKS verification
and server-controlled restaurant/role assignments. The explicitly enabled demo
issuer signs standard owner/operator credentials; gateway verification remains.
Staff tokens stay in HTTP-only cookies.

`/livez` checks the process; `/readyz` checks dependencies; `/metrics` exposes
measurements. Dependency loss does not imply liveness failure. Web health is
`/api/health`. See [API](API.md) and [events](EVENTS.md).
