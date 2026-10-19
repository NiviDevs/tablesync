# Current capabilities

- Guest QR/table entry and separate guest identities.
- Shared cart with quantity/remove controls per guest.
- Table-level simulated payment and persistent kitchen order.
- Kitchen preparing/ready/served actions and safe closure.
- Dish creation/editing, prices and availability.
- Table creation, QR and removal of unused tables.
- Daily simulated sales, order quantities, dish performance and table metrics.
- Compact owner and kitchen workspaces, with bounded desktop panels, searchable
  menus/tables/tickets, and kitchen lanes for new, preparing, and ready orders.
- Owner occupancy, seated guests, daily sales averages, sales per ordering guest,
  dishes per order, active sales days, and catalog availability metrics.
- Signed demo owner/operator access in the local educational environment.
- Responsive Operations workspace with live metrics, service filters, source
  inspection, and manual or automatic refresh controls.

Cloud progress: [B](progress/B.md), covering Kubernetes, persistence, real
application metrics, Prometheus/Grafana, protected Ops and load/HPA controls.

Earlier product checks are recorded in contributor notes. At the user's request,
later work prioritizes delivery without more suites. Startup observations are
recorded separately; old checks are not fresh verification of later changes.

Limits: simulated payments; seeded Juniper House restaurant; local Kubernetes;
phone access needs a reachable web address. Demo role selection is explicitly
enabled here. Served-order sales are not profit or real bank receipts.
