CREATE TABLE checkouts (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  participant_id UUID NOT NULL,
  restaurant_id UUID NOT NULL,
  table_code TEXT NOT NULL,
  operation_key UUID UNIQUE NOT NULL,
  revision INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMMITTED','FAILED')),
  payment_saga_id UUID,
  order_id UUID,
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor > 0),
  currency TEXT NOT NULL CHECK (currency='INR'),
  retry_of UUID REFERENCES checkouts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX checkouts_one_purchase_per_revision ON checkouts(session_id,revision) WHERE status <> 'FAILED';
CREATE TABLE checkout_lines (
  id UUID PRIMARY KEY,
  checkout_id UUID NOT NULL REFERENCES checkouts(id),
  cart_line_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  menu_item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  emoji TEXT NOT NULL
);
ALTER TABLE consolidated_orders
  ADD COLUMN checkout_id UUID UNIQUE REFERENCES checkouts(id),
  ADD COLUMN restaurant_id UUID,
  ADD COLUMN table_code TEXT;
ALTER TABLE consolidated_order_items ADD COLUMN owner_id UUID;
ALTER TABLE order_outbox ADD COLUMN envelope JSONB;
UPDATE order_outbox SET envelope=jsonb_build_object('id',id,'type',event_type,'version',1,
  'occurredAt',created_at,'correlationId',correlation_id,'data',payload);
ALTER TABLE order_outbox ALTER COLUMN envelope SET NOT NULL;
