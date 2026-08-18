-- Safe to run repeatedly on existing KMS databases.

CREATE INDEX IF NOT EXISTS comments_asset_created_idx
    ON comments (asset_id, created_at, id);

CREATE INDEX IF NOT EXISTS comments_parent_idx
    ON comments (parent_id)
    WHERE deleted_at IS NULL;
