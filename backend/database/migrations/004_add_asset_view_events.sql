CREATE TABLE IF NOT EXISTS asset_views (
    id BIGSERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES knowledge_assets(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS asset_views_asset_created_idx
    ON asset_views (asset_id, created_at DESC);

CREATE INDEX IF NOT EXISTS asset_views_created_idx
    ON asset_views (created_at DESC);
