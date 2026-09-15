-- Hosted demo only. This is intentionally separate from the Compose domain schema.
create extension if not exists pgcrypto;

create table public.demo_restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.demo_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.demo_restaurants(id) on delete cascade,
  table_code text not null unique,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.demo_menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.demo_restaurants(id) on delete cascade,
  name text not null,
  description text not null,
  price integer not null check (price > 0),
  emoji text not null,
  position smallint not null check (position >= 0),
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, position)
);

create table public.demo_table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.demo_tables(id) on delete restrict,
  status text not null default 'OPEN' check (status in ('OPEN', 'PLACED', 'PREPARING', 'READY', 'COMPLETE')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create unique index demo_one_open_session_per_table on public.demo_table_sessions(table_id) where status = 'OPEN';
create index demo_sessions_by_table_status on public.demo_table_sessions(table_id, status, created_at desc);

create table public.demo_session_guests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.demo_table_sessions(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  is_host boolean not null default false,
  joined_at timestamptz not null default now()
);
create index demo_guests_by_session on public.demo_session_guests(session_id, joined_at);

-- Private contact data: never grant an anon/authenticated SELECT policy here.
create table public.demo_host_contacts (
  session_id uuid primary key references public.demo_table_sessions(id) on delete cascade,
  phone text not null check (length(trim(phone)) between 7 and 24),
  created_at timestamptz not null default now()
);

create table public.demo_cart_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.demo_table_sessions(id) on delete cascade,
  guest_id uuid not null references public.demo_session_guests(id) on delete cascade,
  menu_item_id uuid not null references public.demo_menu_items(id) on delete restrict,
  quantity integer not null default 1 check (quantity between 1 and 20),
  created_at timestamptz not null default now(),
  unique (guest_id, menu_item_id)
);
create index demo_cart_by_session on public.demo_cart_items(session_id, created_at);

-- Demo-only payment confirmation. This is deliberately not a real payment ledger.
create table public.demo_guest_payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.demo_table_sessions(id) on delete cascade,
  guest_id uuid not null references public.demo_session_guests(id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'PAID')),
  paid_at timestamptz,
  unique (session_id, guest_id)
);
create index demo_payments_by_session on public.demo_guest_payments(session_id);

alter table public.demo_restaurants enable row level security;
alter table public.demo_tables enable row level security;
alter table public.demo_menu_items enable row level security;
alter table public.demo_table_sessions enable row level security;
alter table public.demo_session_guests enable row level security;
alter table public.demo_host_contacts enable row level security;
alter table public.demo_cart_items enable row level security;
alter table public.demo_guest_payments enable row level security;

grant select on public.demo_restaurants, public.demo_tables, public.demo_menu_items, public.demo_table_sessions, public.demo_session_guests, public.demo_cart_items to anon, authenticated;
grant insert, update on public.demo_table_sessions, public.demo_session_guests, public.demo_cart_items to anon, authenticated;
grant select, insert, update on public.demo_guest_payments to anon, authenticated;
grant insert, delete on public.demo_tables to authenticated;
grant insert on public.demo_host_contacts to anon, authenticated;

create policy "demo restaurant directory is public" on public.demo_restaurants for select to anon, authenticated using (true);
create policy "demo tables are public" on public.demo_tables for select to anon, authenticated using (true);
create policy "available demo menu is public" on public.demo_menu_items for select to anon, authenticated using (is_available = true);
create policy "demo sessions are shared" on public.demo_table_sessions for select to anon, authenticated using (true);
create policy "guests can open a demo session" on public.demo_table_sessions for insert to anon, authenticated with check (status = 'OPEN');
create policy "guests can place only an open demo session" on public.demo_table_sessions for update to anon, authenticated using (status = 'OPEN') with check (status in ('OPEN', 'PLACED'));
create policy "staff can progress demo orders" on public.demo_table_sessions for update to authenticated using (status in ('PLACED', 'PREPARING', 'READY')) with check (status in ('PREPARING', 'READY', 'COMPLETE'));
create policy "demo guest names are shared" on public.demo_session_guests for select to anon, authenticated using (true);
create policy "guests can join an open demo session" on public.demo_session_guests for insert to anon, authenticated with check (exists (select 1 from public.demo_table_sessions s where s.id = session_id and s.status = 'OPEN'));
create policy "host contact can be submitted once" on public.demo_host_contacts for insert to anon, authenticated with check (exists (select 1 from public.demo_table_sessions s where s.id = session_id and s.status = 'OPEN'));
create policy "demo cart is shared" on public.demo_cart_items for select to anon, authenticated using (true);
create policy "guests can add to an open demo cart" on public.demo_cart_items for insert to anon, authenticated with check (exists (select 1 from public.demo_table_sessions s where s.id = session_id and s.status = 'OPEN') and exists (select 1 from public.demo_session_guests g where g.id = guest_id and g.session_id = session_id));
create policy "guests can increment a demo cart item" on public.demo_cart_items for update to anon, authenticated using (exists (select 1 from public.demo_table_sessions s where s.id = session_id and s.status = 'OPEN')) with check (quantity between 1 and 20);
create policy "demo payment states are shared" on public.demo_guest_payments for select to anon, authenticated using (true);
create policy "guests can start demo payment" on public.demo_guest_payments for insert to anon, authenticated with check (exists (select 1 from public.demo_session_guests g join public.demo_table_sessions s on s.id = g.session_id where g.id = guest_id and g.session_id = session_id and s.status = 'OPEN'));
create policy "guests can confirm demo payment" on public.demo_guest_payments for update to anon, authenticated using (exists (select 1 from public.demo_table_sessions s where s.id = session_id and s.status = 'OPEN')) with check (status in ('PENDING', 'PAID'));
create policy "staff can manage demo tables" on public.demo_tables for insert to authenticated with check (true);
create policy "staff can remove empty demo tables" on public.demo_tables for delete to authenticated using (not exists (select 1 from public.demo_table_sessions s where s.table_id = id));

with seeded_restaurant as (
  insert into public.demo_restaurants (name, slug) values ('Juniper House', 'juniper-house')
  on conflict (slug) do update set name = excluded.name
  returning id
), restaurant as (
  select id from seeded_restaurant
  union all select id from public.demo_restaurants where slug = 'juniper-house' limit 1
), seeded_table as (
  insert into public.demo_tables (restaurant_id, table_code, display_name)
  select id, 'SAGE-12', 'Table 12' from restaurant
  on conflict (table_code) do update set display_name = excluded.display_name
  returning id
)
insert into public.demo_menu_items (restaurant_id, name, description, price, emoji, position)
select restaurant.id, menu.name, menu.description, menu.price, menu.emoji, menu.position
from restaurant cross join (values
  ('Crispy corn dumplings', 'Sesame, scallion, chilli crisp', 260, '🥟', 1),
  ('Smoked butter paneer', 'Charred tomato, fenugreek, naan', 340, '🍛', 2),
  ('Chilli garlic noodles', 'Wok-tossed vegetables', 280, '🍜', 3),
  ('Saffron milk cake', 'Pistachio, rose cream', 190, '🍮', 4)
) as menu(name, description, price, emoji, position)
on conflict (restaurant_id, position) do update set name = excluded.name, description = excluded.description, price = excluded.price, emoji = excluded.emoji, is_available = true;
