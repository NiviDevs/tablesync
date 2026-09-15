CREATE TABLE IF NOT EXISTS consolidated_orders (
  id UUID PRIMARY KEY,
  payment_saga_id UUID UNIQUE NOT NULL,
  session_id UUID NOT NULL,
  restaurant_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('CONFIRMED')),
  total_amount INTEGER NOT NULL CHECK (total_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS consolidated_order_items (
  id UUID PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES consolidated_orders(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  emoji TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_consumed_events (
  event_id UUID PRIMARY KEY,
  consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_outbox (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  correlation_id UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
