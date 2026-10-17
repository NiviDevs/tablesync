CREATE TABLE restaurants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL
);
INSERT INTO restaurants(id,name)
VALUES ('00000000-0000-4000-8000-000000000001','Juniper House');

CREATE TABLE physical_tables (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$'),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  name TEXT NOT NULL
);
-- Historic codes are preserved; unexpected spelling requires explicit reconciliation.
INSERT INTO physical_tables(code,restaurant_id,name)
SELECT table_code,'00000000-0000-4000-8000-000000000001',table_name FROM table_sessions;
INSERT INTO physical_tables(code,restaurant_id,name)
VALUES ('SAGE-12','00000000-0000-4000-8000-000000000001','Table 12')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE table_sessions
  ADD COLUMN restaurant_id UUID REFERENCES restaurants(id),
  ADD COLUMN status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSING','CLOSED')),
  ADD COLUMN closed_at TIMESTAMPTZ;
UPDATE table_sessions SET restaurant_id='00000000-0000-4000-8000-000000000001';
ALTER TABLE table_sessions ALTER COLUMN restaurant_id SET NOT NULL;
ALTER TABLE table_sessions ALTER COLUMN restaurant_id SET DEFAULT '00000000-0000-4000-8000-000000000001';
ALTER TABLE table_sessions ADD CONSTRAINT table_sessions_physical_table_fk
  FOREIGN KEY (table_code) REFERENCES physical_tables(code);
CREATE UNIQUE INDEX table_sessions_one_active_table ON table_sessions(table_code)
  WHERE status IN ('OPEN','CLOSING');
-- Install the replacement constraint before removing all-history uniqueness.
ALTER TABLE table_sessions DROP CONSTRAINT table_sessions_table_code_key;
ALTER TABLE participants ADD COLUMN join_key UUID UNIQUE;
