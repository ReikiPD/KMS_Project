-- Roles, read-only leadership access, and removal of retired personal-save features.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

-- Admin berpindah ke kredensial environment. Akun Admin lama dipertahankan
-- sebagai Pegawai agar aset dan riwayatnya tidak hilang.
UPDATE users SET role = 'pegawai' WHERE role = 'admin';

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'pegawai', 'pimpinan'));

ALTER TABLE knowledge_assets
  DROP COLUMN IF EXISTS summary;

DROP INDEX IF EXISTS knowledge_assets_public_search_idx;
CREATE INDEX IF NOT EXISTS knowledge_assets_public_search_idx
  ON knowledge_assets
  USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content, '') || ' ' || COALESCE(extracted_text, '')))
  WHERE is_published = TRUE AND deleted_at IS NULL;

DROP TABLE IF EXISTS collection_items;
DROP TABLE IF EXISTS user_collections;
DROP TABLE IF EXISTS asset_favorites;
DROP TABLE IF EXISTS search_history;

ALTER TABLE audit_logs
  ALTER COLUMN actor_id DROP NOT NULL;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_label VARCHAR(150),
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(20);
