-- Non-sequential identifiers keep internal work-unit primary keys out of URLs.

ALTER TABLE work_units
    ADD COLUMN IF NOT EXISTS public_id UUID;

UPDATE work_units
SET public_id = gen_random_uuid()
WHERE public_id IS NULL;

ALTER TABLE work_units
    ALTER COLUMN public_id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS work_units_public_id_uidx
    ON work_units (public_id);
