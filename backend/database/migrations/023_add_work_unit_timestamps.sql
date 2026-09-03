BEGIN;

ALTER TABLE work_units
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Baris lama memperoleh waktu yang valid melalui DEFAULT ketika kolom dibuat.
-- Pernyataan ini juga merapikan instalasi yang mungkin pernah memiliki nilai NULL.
UPDATE work_units
SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
    updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
WHERE created_at IS NULL OR updated_at IS NULL;

COMMIT;
