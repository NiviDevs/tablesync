create policy "staff can progress demo orders" on public.demo_table_sessions
for update to authenticated
using (status in ('PLACED', 'PREPARING', 'READY'))
with check (status in ('PREPARING', 'READY', 'COMPLETE'));
