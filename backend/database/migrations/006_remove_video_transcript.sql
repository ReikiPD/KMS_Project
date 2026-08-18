-- Remove the deprecated video transcript feature and rebuild the public search index.
-- This migration is safe to run repeatedly on both new and existing KMS databases.

DROP INDEX IF EXISTS knowledge_assets_public_search_idx;

ALTER TABLE knowledge_assets
  DROP COLUMN IF EXISTS transcript;

CREATE INDEX IF NOT EXISTS knowledge_assets_public_search_idx
  ON knowledge_assets
  USING GIN (
    to_tsvector(
      'simple',
      COALESCE(title, '') || ' ' || COALESCE(content, '') || ' ' || COALESCE(extracted_text, '')
    )
  )
  WHERE is_published = TRUE AND deleted_at IS NULL;
