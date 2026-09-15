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
