# Roadmap

## Review 1

Complete the reliable customer-to-restaurant vertical slice: landing, QR/table arrival, live owned-cart ordering, split-payment Saga, a restaurant order board, order workflow actions, containers, and critical-path browser coverage. Payments remain explicitly simulated.

## Deferred product phases

Immediate sequence: independent diner payments → cart/checkout retry correctness → restaurant accept/prepare/done → four-browser and mobile verification → hosted preview. CI can be added alongside these fixes. Supabase SDK/session refresh is implemented; actual authentication and tenant authorization remain prerequisites for a private restaurant deployment.

- Motion design for the landing experience.
- Restaurant onboarding, menu/table CMS, QR generation, and tenant plan limits.
- Restaurant CRM and telemetry trends.
- Pay-later checkout and real payment-provider adapters.
- Real infrastructure observability and scaling demonstrations, after the core product is usable.

## Stabilization

Harden idempotency, persistence, access control, empty/error states, and E2E coverage.

## Production polish

Supabase production configuration, provider adapters, tenant entitlements, mobile/PWA refinement, managed deployment, and production operations practices.
