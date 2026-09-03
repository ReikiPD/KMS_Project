CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS knowledge_assets_public_title_trgm_idx
  ON knowledge_assets
  USING GIN (lower(title) gin_trgm_ops)
  WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS categories_name_trgm_idx
  ON categories
  USING GIN (lower(name) gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS work_units_name_trgm_idx
  ON work_units
  USING GIN (lower(name) gin_trgm_ops)
  WHERE deleted_at IS NULL;
