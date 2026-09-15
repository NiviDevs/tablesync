-- Apply this after 202609150001_hosted_demo.sql on an already-created demo project.
create table if not exists public.demo_guest_payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.demo_table_sessions(id) on delete cascade,
  guest_id uuid not null references public.demo_session_guests(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID')),
  paid_at timestamptz,
  unique (session_id, guest_id)
);
create index if not exists demo_payments_by_session on public.demo_guest_payments(session_id);
alter table public.demo_guest_payments enable row level security;
grant select, insert, update on public.demo_guest_payments to anon, authenticated;
grant insert, delete on public.demo_tables to anon, authenticated;
drop policy if exists "demo payment states are shared" on public.demo_guest_payments;
drop policy if exists "guests can start demo payment" on public.demo_guest_payments;
drop policy if exists "guests can confirm demo payment" on public.demo_guest_payments;
create policy "demo payment states are shared" on public.demo_guest_payments for select to anon, authenticated using (true);
create policy "guests can start demo payment" on public.demo_guest_payments for insert to anon, authenticated with check (exists (select 1 from public.demo_session_guests g join public.demo_table_sessions s on s.id = g.session_id where g.id = guest_id and g.session_id = session_id and s.status = 'OPEN'));
create policy "guests can confirm demo payment" on public.demo_guest_payments for update to anon, authenticated using (exists (select 1 from public.demo_table_sessions s where s.id = session_id and s.status = 'OPEN')) with check (status in ('PENDING', 'PAID'));
drop policy if exists "staff can manage demo tables" on public.demo_tables;
drop policy if exists "staff can remove empty demo tables" on public.demo_tables;
create policy "presentation can manage demo tables" on public.demo_tables for insert to anon, authenticated with check (true);
create policy "presentation can remove empty demo tables" on public.demo_tables for delete to anon, authenticated using (not exists (select 1 from public.demo_table_sessions s where s.table_id = id));
