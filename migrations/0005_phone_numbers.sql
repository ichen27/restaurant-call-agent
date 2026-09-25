CREATE TABLE IF NOT EXISTS phone_numbers (
  phone_number TEXT PRIMARY KEY,
  store_id     TEXT NOT NULL REFERENCES stores(id),
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed: map a default number to store-1 for development
INSERT INTO phone_numbers (phone_number, store_id, label)
VALUES ('+15551234567', 'store-1', 'Dev Test Number')
ON CONFLICT DO NOTHING;
