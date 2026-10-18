ALTER TABLE carts
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  ADD COLUMN state TEXT NOT NULL DEFAULT 'EDITING' CHECK (state IN ('EDITING','PENDING','COMMITTED','FAILED')),
  ADD COLUMN sealed BOOLEAN NOT NULL DEFAULT false;

-- Original v1 rupee columns remain intact. These new fields are explicitly paise.
ALTER TABLE cart_items ADD COLUMN unit_price_minor INTEGER CHECK (unit_price_minor >= 0);
UPDATE cart_items SET unit_price_minor=unit_price*100;
ALTER TABLE cart_items ALTER COLUMN unit_price_minor SET NOT NULL;
ALTER TABLE consolidated_orders
  ADD COLUMN total_amount_minor INTEGER CHECK (total_amount_minor > 0),
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency='INR');
UPDATE consolidated_orders SET total_amount_minor=total_amount*100;
ALTER TABLE consolidated_order_items ADD COLUMN unit_price_minor INTEGER CHECK (unit_price_minor >= 0);
UPDATE consolidated_order_items SET unit_price_minor=unit_price*100;
ALTER TABLE saga_state
  ADD COLUMN total_amount_minor INTEGER CHECK (total_amount_minor >= 0),
  ADD COLUMN platform_fee_minor INTEGER CHECK (platform_fee_minor >= 0),
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency='INR');
UPDATE saga_state SET total_amount_minor=total_amount*100,platform_fee_minor=platform_fee*100;
ALTER TABLE payment_intents ADD COLUMN amount_minor INTEGER CHECK (amount_minor > 0);
UPDATE payment_intents SET amount_minor=amount*100;
ALTER TABLE platform_fee_ledger ADD COLUMN amount_minor INTEGER CHECK (amount_minor >= 0);
UPDATE platform_fee_ledger SET amount_minor=amount*100;
CREATE TABLE money_unit_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO money_unit_migrations(name) VALUES ('legacy_rupees_to_inr_minor_v1');

CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,
  restaurant_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  emoji TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  available BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO menu_items(id,restaurant_id,name,description,emoji,unit_price_minor) VALUES
('dumplings','00000000-0000-4000-8000-000000000001','Crispy corn dumplings','Sesame, scallion, chilli crisp','🥟',26000),
('paneer','00000000-0000-4000-8000-000000000001','Smoked butter paneer','Charred tomato, fenugreek, naan','🍛',34000),
('noodles','00000000-0000-4000-8000-000000000001','Chilli garlic noodles','Wok-tossed vegetables','🍜',28000),
('milk-cake','00000000-0000-4000-8000-000000000001','Saffron milk cake','Pistachio, rose cream','🍮',19000);
