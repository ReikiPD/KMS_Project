-- Run once against an existing KMS database before using featured assets.
-- This migration is safe to run repeatedly.

ALTER TABLE knowledge_assets
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS knowledge_assets_public_catalog_idx
    ON knowledge_assets (is_published, is_featured, created_at DESC)
    WHERE deleted_at IS NULL;
