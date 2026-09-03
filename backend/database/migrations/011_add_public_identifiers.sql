-- Public, non-sequential identifiers keep internal primary keys out of browser URLs.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS public_id UUID;

UPDATE users
SET public_id = gen_random_uuid()
WHERE public_id IS NULL;

ALTER TABLE users
    ALTER COLUMN public_id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_public_id_uidx
    ON users (public_id);

ALTER TABLE knowledge_assets
    ADD COLUMN IF NOT EXISTS public_id UUID;

UPDATE knowledge_assets
SET public_id = gen_random_uuid()
WHERE public_id IS NULL;

ALTER TABLE knowledge_assets
    ALTER COLUMN public_id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN public_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_assets_public_id_uidx
    ON knowledge_assets (public_id);

-- Purely numeric slugs are indistinguishable from legacy numeric routes.
-- Prefix them once so every newly generated public URL remains descriptive.
UPDATE knowledge_assets
SET slug = 'aset-' || slug || '-' || LEFT(public_id::text, 8)
WHERE slug ~ '^[0-9]+$';
