CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY,
  table_code TEXT UNIQUE NOT NULL,
  restaurant_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES table_sessions(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, id)
);
CREATE TABLE IF NOT EXISTS carts (
  id UUID PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID PRIMARY KEY,
  cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  menu_item_id TEXT NOT NULL,
  owner_id UUID NOT NULL,
  item_name TEXT NOT NULL,
  unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
  emoji TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cart_id, menu_item_id, owner_id)
);
CREATE TABLE IF NOT EXISTS saga_state (
  id UUID PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  session_id UUID NOT NULL REFERENCES table_sessions(id),
  status TEXT NOT NULL CHECK (status IN ('PROCESSING', 'COMPENSATING', 'FAILED', 'COMMITTED')),
  total_amount INTEGER NOT NULL CHECK (total_amount >= 0),
  platform_fee INTEGER NOT NULL CHECK (platform_fee >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  saga_id UUID NOT NULL REFERENCES saga_state(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES participants(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure', 'timeout')),
  status TEXT NOT NULL CHECK (status IN ('SUCCEEDED', 'FAILED', 'TIMED_OUT', 'REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id TEXT NOT NULL REFERENCES payment_intents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  state_history JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_fee_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  saga_id UUID UNIQUE NOT NULL REFERENCES saga_state(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'VOIDED', 'RECORDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
