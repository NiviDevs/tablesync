# Hosted Guest Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a small hosted TableSync demo: a QR/table-link guest experience with no diner sign-in, one private host billing phone number, and a restaurant-staff-only board.

**Architecture:** Keep the existing Compose services as the Review 1 prototype. Add an intentionally separate Supabase-backed hosted-demo data model used directly by the Next.js app: public guests can read a menu and collaborate on the current table session, while staff authenticate through Supabase email OTP. The host phone is in a separate RLS-protected table and is never selected by guest clients.

**Tech Stack:** Next.js 16, React 19, `@supabase/ssr`, `@supabase/supabase-js`, Supabase Postgres/Auth/RLS, Vercel.

**Spec:** `docs/PROJECT.md`, `docs/PROJECT_STATE.md`, and the user-approved guest/staff flow recorded in `docs/STATUS.md`.

## Global Constraints

- Customers must not create or use a login; only restaurant staff authenticate.
- Only the first table guest provides a phone number, solely for billing/contact logging.
- Never expose a service-role key or a phone number to browser clients.
- All public Supabase tables have RLS enabled and explicit policies.
- Seed only Juniper House, Table 12 (`SAGE-12`), and the existing four-item menu for this demo.
- Payment remains explicitly simulated until independent diner payment is implemented in the service architecture.

---

### Task 1: Create reviewable hosted-demo data model

**Files:**
- Create: `supabase/migrations/202609150001_hosted_demo.sql`
- Modify: `docs/DEPLOYMENT.md`

**Interfaces:**
- Produces `demo_restaurants`, `demo_tables`, `demo_menu_items`, `demo_table_sessions`, `demo_session_guests`, `demo_cart_items`, `demo_orders`, and `demo_host_contacts` for the browser app.
- The only host-contact write is `insert into demo_host_contacts (session_id, phone)`. No guest select policy exists for that table.

- [ ] **Step 1: Write a migration with keys, checks, RLS, indexes, and deterministic Juniper House seed rows.**

```sql
create table public.demo_host_contacts (
  session_id uuid primary key references public.demo_table_sessions(id) on delete cascade,
  phone text not null check (length(trim(phone)) between 7 and 24),
  created_at timestamptz not null default now()
);
alter table public.demo_host_contacts enable row level security;
-- Do not create an anon SELECT policy for this table.
```

- [ ] **Step 2: Apply it in the Supabase SQL Editor (or through authenticated Supabase MCP), then verify it with an anon-safe menu query and an authenticated staff query.**

```sql
select table_code from public.demo_tables where table_code = 'SAGE-12';
select name, price from public.demo_menu_items order by position;
```

- [ ] **Step 3: Record the one-time migration and Supabase Auth redirect configuration in deployment documentation.**

### Task 2: Make the guest experience use hosted demo data

**Files:**
- Create: `apps/web/lib/demo-types.ts`
- Create: `apps/web/lib/demo-guest-data.ts`
- Modify: `apps/web/app/app/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes the Task 1 tables via `createClient()` from `utils/supabase/client.ts`.
- `joinDemoTable({ tableCode, name, phone? })` creates/reuses one active session and returns `{ sessionId, guestId }`.
- `loadDemoTable(sessionId)` returns a table, guests, menu, and owned cart entries without a host phone.

- [ ] **Step 1: Add a failing unit test for host-versus-guest form validation.**

```ts
assert.deepEqual(validateJoin({ name: 'Maya', phone: '' }, true), { phone: 'Enter a billing contact number.' });
assert.deepEqual(validateJoin({ name: 'Ishaan', phone: '' }, false), {});
```

- [ ] **Step 2: Implement the validation and Supabase reads/writes; first arrival asks for name and phone, subsequent guests only see name.**

- [ ] **Step 3: Replace the current `NEXT_PUBLIC_API_URL` / localhost-only customer route with the hosted data client, polling the shared session every four seconds.**

- [ ] **Step 4: Run typecheck and manually verify two browser contexts can join, add owned dishes, and see guest names without seeing the billing phone.**

### Task 3: Add restaurant-only email OTP access and a kitchen board

**Files:**
- Create: `apps/web/app/restaurant/sign-in/page.tsx`
- Create: `apps/web/app/auth/callback/route.ts`
- Modify: `apps/web/app/restaurant/page.tsx`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes Supabase Auth browser/server helpers and Task 1 `demo_orders` data.
- `GET /auth/callback?code=...&next=/restaurant` exchanges a PKCE code and redirects only to an internal path.
- `/restaurant` redirects unauthenticated users to `/restaurant/sign-in`.

- [ ] **Step 1: Add a failing test for callback redirect sanitisation.**

```ts
assert.equal(safeNext('/restaurant'), '/restaurant');
assert.equal(safeNext('https://evil.example'), '/restaurant');
```

- [ ] **Step 2: Implement email OTP initiation, the PKCE exchange callback, protected restaurant page, and sign-out control.**

- [ ] **Step 3: Render paid/placed demo orders from Supabase and allow staff to move a ticket from `PLACED` to `PREPARING` to `READY`.**

- [ ] **Step 4: Verify the unauthenticated redirect and a completed OTP session after Supabase redirect URLs are configured.**

### Task 4: Publish and document the demo

**Files:**
- Modify: `.env.example`
- Modify: `docs/STATUS.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `README.md`
- Create: `.github/workflows/web-ci.yml`

**Interfaces:**
- Vercel project root is `apps/web`.
- Production environment receives only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `NEXT_PUBLIC_APP_URL`.

- [ ] **Step 1: Add CI that runs `npm ci`, `npm run typecheck --workspace @tablesync/web`, and `npm run build --workspace @tablesync/web`.**

- [ ] **Step 2: Configure Supabase Auth Site URL and redirect URL for the final Vercel hostname; configure the three public Vercel environment values.**

- [ ] **Step 3: Deploy `apps/web` to Vercel and verify landing, `/app?table=SAGE-12`, guest ordering, unauthenticated restaurant redirect, and restaurant sign-in.**

- [ ] **Step 4: Update status docs to distinguish the hosted demo from the unchanged Compose payment prototype.**

## Self-review

- Guest flow, private host contact, staff-only authentication, seed data, kitchen state, deployment, and CI are covered by Tasks 1–4.
- The plan intentionally excludes real payments, per-diner payment retries, CRM, subscription limits, and CMS management.
- Function and table names are consistent across all tasks; no task relies on a placeholder implementation.
