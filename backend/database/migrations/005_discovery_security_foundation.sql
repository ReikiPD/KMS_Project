-- Discovery, aggregate analytics, and private audit foundation.
-- All statements are deliberately non-destructive for existing KMS installations.

ALTER TABLE knowledge_assets
  ADD COLUMN IF NOT EXISTS extracted_text TEXT,
  ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS video_chapters JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE knowledge_assets
  DROP CONSTRAINT IF EXISTS knowledge_assets_video_duration_seconds_check;

ALTER TABLE knowledge_assets
  ADD CONSTRAINT knowledge_assets_video_duration_seconds_check
  CHECK (video_duration_seconds IS NULL OR video_duration_seconds >= 0);

CREATE INDEX IF NOT EXISTS knowledge_assets_public_search_idx
  ON knowledge_assets
  USING GIN (
    to_tsvector(
      'simple',
      COALESCE(title, '') || ' ' || COALESCE(content, '') || ' ' || COALESCE(extracted_text, '')
    )
  )
  WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS search_events (
  id BIGSERIAL PRIMARY KEY,
  query VARCHAR(180) NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS search_events_created_idx ON search_events (created_at DESC);
CREATE INDEX IF NOT EXISTS search_events_query_idx ON search_events (query);

CREATE TABLE IF NOT EXISTS asset_share_events (
  id BIGSERIAL PRIMARY KEY,
  asset_id INTEGER NOT NULL REFERENCES knowledge_assets(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS asset_share_events_asset_created_idx
  ON asset_share_events (asset_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(80) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
  ON audit_logs (actor_id, created_at DESC);
