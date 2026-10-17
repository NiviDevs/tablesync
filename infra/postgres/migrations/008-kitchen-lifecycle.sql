ALTER TABLE consolidated_orders DROP CONSTRAINT consolidated_orders_status_check;
ALTER TABLE consolidated_orders ADD CONSTRAINT consolidated_orders_status_check
  CHECK (status IN ('CONFIRMED','PREPARING','READY','SERVED'));
