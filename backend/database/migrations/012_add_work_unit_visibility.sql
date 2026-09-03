-- Unit kerja dapat disembunyikan dari kanal publik tanpa menghapus data atau asetnya.

ALTER TABLE work_units
    ADD COLUMN IF NOT EXISTS is_public BOOLEAN;

UPDATE work_units
SET is_public = TRUE
WHERE is_public IS NULL;

ALTER TABLE work_units
    ALTER COLUMN is_public SET DEFAULT TRUE,
    ALTER COLUMN is_public SET NOT NULL;

CREATE INDEX IF NOT EXISTS work_units_public_active_idx
    ON work_units (id)
    WHERE deleted_at IS NULL AND is_public = TRUE;
