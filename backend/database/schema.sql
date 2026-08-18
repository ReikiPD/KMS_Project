-- Canonical schema for KMS Kemenhub.
-- This file intentionally contains no user or knowledge-asset data.

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    department VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,
    password TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'pegawai', 'pimpinan'))
);

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE work_units (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE knowledge_assets (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    asset_type VARCHAR(50) NOT NULL DEFAULT 'article',
    file_url TEXT,
    content TEXT,
    thumbnail_url TEXT,
    extracted_text TEXT,
    video_duration_seconds INTEGER CHECK (video_duration_seconds IS NULL OR video_duration_seconds >= 0),
    video_chapters JSONB NOT NULL DEFAULT '[]'::jsonb,
    view_count INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT FALSE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    work_unit_id INTEGER REFERENCES work_units(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE UNIQUE INDEX unique_active_slug
    ON knowledge_assets (slug)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX unique_active_title
    ON knowledge_assets (title)
    WHERE deleted_at IS NULL;

CREATE INDEX knowledge_assets_public_catalog_idx
    ON knowledge_assets (is_published, is_featured, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX knowledge_assets_public_search_idx
    ON knowledge_assets
    USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content, '') || ' ' || COALESCE(extracted_text, '')))
    WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE TABLE asset_views (
    id BIGSERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES knowledge_assets(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX asset_views_asset_created_idx
    ON asset_views (asset_id, created_at DESC);

CREATE INDEX asset_views_created_idx
    ON asset_views (created_at DESC);

CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES knowledge_assets(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX comments_asset_created_idx ON comments (asset_id, created_at, id);
CREATE INDEX comments_parent_idx ON comments (parent_id) WHERE deleted_at IS NULL;

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    asset_id INTEGER REFERENCES knowledge_assets(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('comment', 'reply', 'share')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX notifications_recipient_created_idx
    ON notifications (recipient_id, is_read, created_at DESC);

CREATE TABLE search_events (
    id BIGSERIAL PRIMARY KEY,
    query VARCHAR(180) NOT NULL,
    result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX search_events_created_idx ON search_events (created_at DESC);
CREATE INDEX search_events_query_idx ON search_events (query);

CREATE TABLE asset_share_events (
    id BIGSERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES knowledge_assets(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX asset_share_events_asset_created_idx ON asset_share_events (asset_id, created_at DESC);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_label VARCHAR(150),
    actor_role VARCHAR(20),
    action VARCHAR(80) NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX audit_logs_actor_created_idx ON audit_logs (actor_id, created_at DESC);
