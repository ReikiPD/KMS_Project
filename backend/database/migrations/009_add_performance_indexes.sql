-- Indexes for catalogue filters, backoffice scopes, recovery, and aggregate analytics.
-- All indexes are non-destructive and safe to apply repeatedly.

CREATE INDEX IF NOT EXISTS knowledge_assets_public_created_idx
  ON knowledge_assets (created_at DESC, id DESC)
  WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_assets_public_category_created_idx
  ON knowledge_assets (category_id, created_at DESC, id DESC)
  WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_assets_public_work_unit_created_idx
  ON knowledge_assets (work_unit_id, created_at DESC, id DESC)
  WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_assets_author_active_idx
  ON knowledge_assets (author_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS knowledge_assets_deleted_at_idx
  ON knowledge_assets (deleted_at DESC, id DESC)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS asset_share_events_created_idx
  ON asset_share_events (created_at DESC);

CREATE INDEX IF NOT EXISTS users_backoffice_active_idx
  ON users (role, full_name, id)
  WHERE deleted_at IS NULL AND role IN ('pegawai', 'pimpinan');
