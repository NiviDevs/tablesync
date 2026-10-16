# Project state

**Phase:** Review 1 — local prototype; core group checkout incomplete.

**Working:** Docker Compose Session/Order persistence through PostgreSQL, Redis presence, RabbitMQ event publication/audit queue, gateway composition, local WebSocket fan-out, deterministic mock-payment Saga checkout, and idempotent committed-payment-to-consolidated-order projection.

**Implemented foundation:** refreshed landing/customer pages, a read-only restaurant board for SAGE-12, and Supabase browser/server helpers with Next.js session refresh. Supabase login and backend authorization are not implemented.

**Pending:** independent diner payment confirmations, frozen checkout/cart lifecycle, safe retries, restaurant acceptance/completion, and full browser verification. Current checkout simulates payments for the whole table from one click.

**Next actions:** fix group checkout, complete the restaurant workflow, verify four independent browser sessions, add CI and a hosted preview. Restaurant CMS/CRM, plan limits, motion, pay-later, real payments, and scaling follow later.
