ALTER TABLE saga_state
  ADD COLUMN checkout_id UUID UNIQUE,
  ADD COLUMN payload_fingerprint TEXT;
CREATE TABLE payment_outbox (
  id UUID PRIMARY KEY,
  envelope JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);
