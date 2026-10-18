# Services

Gateway handles credentials/routing. Session owns tables/guests. Order owns the
menu/cart/kitchen/business summaries. Payment simulates checkout and publishes
durable events. See [architecture](../docs/ARCHITECTURE.md), [API](../docs/API.md)
and [events](../docs/EVENTS.md). The explicitly enabled `demo-identity.js` helper
supplies local signed staff credentials for `npm run demo`.
