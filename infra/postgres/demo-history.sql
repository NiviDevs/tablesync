-- Synthetic restaurant history only. No real customers, charges or broker events.
-- Run through npm run demo:seed, or psql -v ON_ERROR_STOP=1 -v history_end=YYYY-MM-DD.
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('tablesync.simulated-history.v1'));
SET LOCAL statement_timeout = '120s';

CREATE FUNCTION pg_temp.history_id(key text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT md5('tablesync.simulated-history.v1:' || key)::uuid
$$;
CREATE FUNCTION pg_temp.history_random(key text) RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
  SELECT ('x' || substr(md5('tablesync.simulated-history.v1:' || key),1,8))::bit(32)::bigint / 4294967296.0
$$;

-- Reuse numbered tables already created by the owner, including the original QR.
CREATE TEMP TABLE history_tables ON COMMIT DROP AS
SELECT n, COALESCE(existing.code,'SAGE-' || lpad(n::text,2,'0')) AS code,
  COALESCE(existing.name,'Table ' || n) AS name,
  CASE WHEN n <= 4 THEN 2 WHEN n <= 9 THEN 4 ELSE 6 END AS seats
FROM generate_series(1,12) n
LEFT JOIN LATERAL (
  SELECT code,name FROM physical_tables
  WHERE restaurant_id='00000000-0000-4000-8000-000000000001' AND name='Table ' || n
  ORDER BY code LIMIT 1
) existing ON true;
INSERT INTO physical_tables(code,restaurant_id,name)
SELECT code,'00000000-0000-4000-8000-000000000001',name FROM history_tables
ON CONFLICT (code) DO NOTHING;
DO $$ BEGIN
  IF EXISTS (SELECT FROM history_tables h JOIN physical_tables t USING(code)
    WHERE t.restaurant_id <> '00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'A history table code belongs to another restaurant; no data was changed';
  END IF;
END $$;

-- Fixed snapshots make historical totals reproducible despite later menu edits.
CREATE TEMP TABLE history_menu (
  id text PRIMARY KEY, name text, description text, emoji text,
  price integer, course text, weight integer
) ON COMMIT DROP;
INSERT INTO history_menu VALUES
('dumplings','Crispy corn dumplings','Sesame, scallion, chilli crisp','🥟',26000,'starter',5),
('paneer','Smoked butter paneer','Charred tomato, fenugreek, naan','🍛',34000,'main',7),
('noodles','Chilli garlic noodles','Wok-tossed vegetables','🍜',28000,'main',6),
('milk-cake','Saffron milk cake','Pistachio, rose cream','🍮',19000,'dessert',6),
('history-dosa','Masala dosa','Crisp dosa, potato masala, sambar and chutney','🥞',18000,'breakfast',7),
('history-toast','Mushroom sourdough toast','Sauteed mushrooms, herbs and sourdough','🍞',22000,'breakfast',4),
('history-idli','Steamed idli','Three idlis with sambar and coconut chutney','🍚',14000,'breakfast',5),
('history-tikka','Tandoori chicken tikka','Clay-oven chicken, mint chutney and onion','🍗',36000,'starter',4),
('history-dal','Dal makhani with rice','Slow-cooked black lentils and steamed basmati','🍲',29000,'main',5),
('history-biryani','Hyderabadi chicken biryani','Dum-cooked basmati, chicken and raita','🍚',39000,'main',8),
('history-rice','Vegetable fried rice','Wok-tossed rice, vegetables and spring onion','🍚',25000,'main',4),
('history-brownie','Warm chocolate brownie','Chocolate brownie with vanilla ice cream','🍫',21000,'dessert',4),
('history-lassi','Mango lassi','Yoghurt, mango and cardamom','🥭',14000,'drink',4),
('history-lime','Fresh lime soda','Fresh lime, soda and mint','🍋',9000,'drink',6),
('history-coffee','South Indian filter coffee','Freshly brewed coffee with milk','☕',10000,'drink',7),
('history-chai','Masala chai','Black tea with milk and warming spices','🫖',8000,'drink',6);
INSERT INTO menu_items(id,restaurant_id,name,description,emoji,unit_price_minor)
SELECT id,'00000000-0000-4000-8000-000000000001',name,description,emoji,price FROM history_menu
ON CONFLICT (id) DO NOTHING;
DO $$ BEGIN
  IF EXISTS (SELECT FROM history_menu h JOIN menu_items m USING(id)
    WHERE m.restaurant_id <> '00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'A history dish ID belongs to another restaurant; no data was changed';
  END IF;
END $$;

-- Six non-overlapping seating windows. Weekend demand, seasonal demand and
-- table popularity vary deterministically. Only already-completed seatings enter.
CREATE TEMP TABLE history_seatings ON COMMIT DROP AS
WITH candidates AS (
  SELECT d::date AS day,t.*,slot,
    d::date || ':' || t.n || ':' || slot AS key,
    (d::date + hour::time) AT TIME ZONE 'Asia/Kolkata' AS starts_at,
    occupancy * CASE extract(isodow FROM d) WHEN 6 THEN 1.22 WHEN 7 THEN 1.30
      WHEN 5 THEN 1.12 WHEN 1 THEN 0.80 ELSE 0.92 END
      * (0.94 + 0.09 * sin(2*pi()*extract(doy FROM d)/365.25))
      * (0.85 + 0.25 * pg_temp.history_random('table:' || t.n)) AS demand
  FROM generate_series(:'history_end'::date-364,:'history_end'::date,interval '1 day') d
  CROSS JOIN history_tables t
  CROSS JOIN (VALUES (1,'08:00',0.34),(2,'09:45',0.30),(3,'12:00',0.60),
    (4,'13:45',0.47),(5,'18:30',0.65),(6,'20:15',0.76)) windows(slot,hour,occupancy)
), timed AS (
  SELECT *,starts_at + floor(pg_temp.history_random(key || ':arrival')*16)*interval '1 minute' AS seated_at,
    CASE seats WHEN 2 THEN 1 WHEN 4 THEN 2 ELSE 3 END
      + floor(pg_temp.history_random(key || ':party')*CASE seats WHEN 2 THEN 2 WHEN 4 THEN 3 ELSE 4 END)::int AS guests
  FROM candidates WHERE pg_temp.history_random(key || ':occupied') < demand
), identified AS (
  SELECT *,pg_temp.history_id(key || ':session') AS session_id,
    pg_temp.history_id(key || ':checkout') AS checkout_id,
    pg_temp.history_id(key || ':saga') AS saga_id,
    pg_temp.history_id(key || ':order') AS order_id,
    seated_at + interval '12 minutes' AS ordered_at,
    seated_at + interval '65 minutes' + floor(pg_temp.history_random(key || ':duration')*20)*interval '1 minute' AS closed_at
  FROM timed
)
SELECT * FROM identified s WHERE closed_at <= now()
  AND NOT EXISTS (SELECT FROM table_sessions existing WHERE existing.id=s.session_id);

CREATE TEMP TABLE history_guests ON COMMIT DROP AS
SELECT s.key,s.session_id,s.checkout_id,s.saga_id,s.order_id,s.seated_at,s.ordered_at,s.slot,g.n,
  pg_temp.history_id(s.key || ':guest:' || g.n) AS owner_id
FROM history_seatings s CROSS JOIN LATERAL generate_series(1,s.guests) g(n);

-- Every guest orders a main/breakfast. Drinks, shared starters and desserts
-- have different take rates; popular dishes get higher selection weights.
CREATE TEMP TABLE history_lines ON COMMIT DROP AS
WITH choices AS (
  SELECT g.*,course,
    pg_temp.history_random(g.key || ':' || g.n || ':' || course || ':dish') AS choice
  FROM history_guests g
  CROSS JOIN (VALUES ('meal'),('drink'),('starter'),('dessert')) courses(course)
  WHERE course='meal'
    OR (course='drink' AND pg_temp.history_random(g.key || ':' || g.n || ':drink') < 0.72)
    OR (course='starter' AND g.slot > 2 AND g.n%2=1 AND pg_temp.history_random(g.key || ':' || g.n || ':starter') < 0.66)
    OR (course='dessert' AND g.slot > 2 AND pg_temp.history_random(g.key || ':' || g.n || ':dessert') < 0.32)
), weighted AS (
  SELECT *,sum(weight) OVER (PARTITION BY course ORDER BY id) AS cumulative,
    sum(weight) OVER (PARTITION BY course) AS total_weight FROM history_menu
)
SELECT pg_temp.history_id(c.key || ':line:' || c.n || ':' || c.course) AS id,
  c.session_id,c.checkout_id,c.saga_id,c.order_id,c.owner_id,c.ordered_at,
  m.id AS menu_item_id,m.name,m.emoji,m.price,1 AS quantity
FROM choices c JOIN LATERAL (
  SELECT * FROM weighted m
  WHERE m.course=CASE WHEN c.course='meal' THEN CASE WHEN c.slot<=2 THEN 'breakfast' ELSE 'main' END ELSE c.course END
    AND m.cumulative > c.choice*m.total_weight
  ORDER BY m.cumulative LIMIT 1
) m ON true;
CREATE TEMP TABLE history_totals ON COMMIT DROP AS
SELECT order_id,sum(price*quantity)::int AS total FROM history_lines GROUP BY order_id;

INSERT INTO table_sessions(id,table_code,restaurant_name,table_name,restaurant_id,status,created_at,closed_at)
SELECT session_id,code,'Juniper House',name,'00000000-0000-4000-8000-000000000001','CLOSED',seated_at,closed_at
FROM history_seatings;
INSERT INTO participants(id,session_id,display_name,joined_at)
SELECT owner_id,session_id,'Simulated guest ' || n,seated_at FROM history_guests;
INSERT INTO carts(id,session_id,revision,state,sealed,created_at)
SELECT pg_temp.history_id(key || ':cart'),session_id,1,'COMMITTED',true,seated_at FROM history_seatings;
INSERT INTO checkouts(id,session_id,participant_id,restaurant_id,table_code,operation_key,revision,status,
  payment_saga_id,order_id,total_amount_minor,currency,created_at)
SELECT s.checkout_id,s.session_id,pg_temp.history_id(s.key || ':guest:1'),
  '00000000-0000-4000-8000-000000000001',s.code,s.checkout_id,1,'COMMITTED',s.saga_id,s.order_id,t.total,'INR',s.ordered_at
FROM history_seatings s JOIN history_totals t USING(order_id);
INSERT INTO checkout_lines(id,checkout_id,cart_line_id,owner_id,menu_item_id,item_name,quantity,unit_price_minor,emoji)
SELECT id,checkout_id,id,owner_id,menu_item_id,name,quantity,price,emoji FROM history_lines;

INSERT INTO saga_state(id,idempotency_key,session_id,status,total_amount,platform_fee,total_amount_minor,
  platform_fee_minor,currency,checkout_id,payload_fingerprint,created_at,completed_at)
SELECT s.saga_id,'simulated-history:v1:' || s.key,s.session_id,'COMMITTED',ceil(t.total/100.0),
  ceil(ceil(t.total/100.0)/100.0),t.total,ceil(t.total/100.0),'INR',s.checkout_id,
  encode(digest('simulated-history:v1:' || s.key,'sha256'),'hex'),s.ordered_at,s.ordered_at+interval '2 seconds'
FROM history_seatings s JOIN history_totals t USING(order_id);
INSERT INTO payment_intents(id,saga_id,participant_id,amount,amount_minor,outcome,status,created_at)
SELECT 'history_' || owner_id,saga_id,owner_id,ceil(sum(price*quantity)/100.0),sum(price*quantity),
  'success','SUCCEEDED',ordered_at FROM history_lines GROUP BY owner_id,saga_id,ordered_at;
INSERT INTO payment_attempts(id,intent_id,provider,state_history,created_at)
SELECT pg_temp.history_id(g.key || ':attempt:' || g.n),'history_' || owner_id,'simulated-history-v1',
  '["PENDING","PROCESSING","SUCCEEDED"]'::jsonb,g.ordered_at FROM history_guests g;
INSERT INTO platform_fee_ledger(id,saga_id,amount,amount_minor,status,created_at)
SELECT pg_temp.history_id(s.key || ':fee'),s.saga_id,ceil(ceil(t.total/100.0)/100.0),ceil(t.total/100.0),'RECORDED',s.ordered_at
FROM history_seatings s JOIN history_totals t USING(order_id);

INSERT INTO consolidated_orders(id,payment_saga_id,session_id,restaurant_name,table_name,status,
  total_amount,total_amount_minor,currency,checkout_id,restaurant_id,table_code,created_at)
SELECT s.order_id,s.saga_id,s.session_id,'Juniper House',s.name,'SERVED',ceil(t.total/100.0),t.total,'INR',
  s.checkout_id,'00000000-0000-4000-8000-000000000001',s.code,s.ordered_at FROM history_seatings s JOIN history_totals t USING(order_id);
INSERT INTO consolidated_order_items(id,order_id,menu_item_id,item_name,unit_price,unit_price_minor,emoji,quantity,owner_id,created_at)
SELECT id,order_id,menu_item_id,name,ceil(price/100.0),price,emoji,quantity,owner_id,ordered_at FROM history_lines;

-- Small runnable integrity check: snapshots, payment shares and item totals agree.
DO $$ BEGIN
  IF EXISTS (
    WITH item_totals AS (
      SELECT i.order_id,sum(i.quantity::bigint*i.unit_price_minor) AS total
      FROM consolidated_order_items i JOIN history_seatings s ON s.order_id=i.order_id GROUP BY i.order_id
    ), payment_totals AS (
      SELECT i.saga_id,sum(i.amount_minor) AS total
      FROM payment_intents i JOIN history_seatings s ON s.saga_id=i.saga_id GROUP BY i.saga_id
    )
    SELECT FROM history_seatings s JOIN consolidated_orders o ON o.id=s.order_id
    JOIN checkouts c ON c.id=s.checkout_id JOIN saga_state p ON p.id=s.saga_id
    LEFT JOIN item_totals i ON i.order_id=o.id LEFT JOIN payment_totals paid ON paid.saga_id=p.id
    WHERE o.total_amount_minor <> c.total_amount_minor OR o.total_amount_minor <> p.total_amount_minor
      OR o.total_amount_minor IS DISTINCT FROM i.total OR o.total_amount_minor IS DISTINCT FROM paid.total
  ) THEN RAISE EXCEPTION 'Simulated history totals disagree; rolling back'; END IF;
END $$;
SELECT count(*) AS added_orders,min(day) AS first_day,max(day) AS last_day,
  (SELECT count(*) FROM history_guests) AS added_guests,
  (SELECT COALESCE(sum(total),0)/100.0 FROM history_totals) AS simulated_sales_inr
FROM history_seatings;
COMMIT;
