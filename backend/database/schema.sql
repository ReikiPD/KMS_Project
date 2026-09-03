-- Canonical schema for KMS Kemenhub.
-- This file intentionally contains no user or knowledge-asset data.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE access_roles (
    code VARCHAR(20) PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{2,19}$'),
    name VARCHAR(80) UNIQUE NOT NULL,
    description VARCHAR(255),
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_backoffice BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO access_roles (code, name, description, is_system, is_backoffice) VALUES
('user', 'Pengguna', 'Akun publik untuk membaca dan berkomentar.', TRUE, FALSE),
('pegawai', 'Pegawai', 'Kontributor pengetahuan KMS.', TRUE, TRUE),
('pimpinan', 'Pimpinan', 'Akses pemantauan organisasi.', TRUE, TRUE),
('verifikator', 'Verifikator', 'Menilai kelayakan aset pengetahuan sesuai cakupan Unit Kerja.', TRUE, TRUE),
('admin', 'Admin', 'Pengelola administrasi KMS.', TRUE, TRUE);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    department VARCHAR(100),
    work_unit_id INTEGER,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,
    password TEXT NOT NULL,
    session_version INTEGER NOT NULL DEFAULT 1,
    role VARCHAR(20) NOT NULL DEFAULT 'user' REFERENCES access_roles(code) ON UPDATE CASCADE
);

CREATE UNIQUE INDEX users_public_id_uidx ON users (public_id);

CREATE TABLE user_sessions (
    id BIGSERIAL PRIMARY KEY,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    actor_label VARCHAR(150) NOT NULL,
    actor_email VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL REFERENCES access_roles(code) ON UPDATE CASCADE,
    session_version INTEGER,
    admin_config_hash VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    idle_expires_at TIMESTAMP NOT NULL,
    absolute_expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP DEFAULT NULL,
    CHECK ((user_id IS NULL AND role = 'admin' AND admin_config_hash IS NOT NULL AND session_version IS NULL)
        OR (user_id IS NOT NULL AND admin_config_hash IS NULL AND session_version IS NOT NULL))
);

CREATE INDEX user_sessions_user_active_idx ON user_sessions (user_id, absolute_expires_at DESC) WHERE revoked_at IS NULL;
CREATE INDEX user_sessions_expiry_idx ON user_sessions (absolute_expires_at, idle_expires_at);

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
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    alias VARCHAR(40),
    echelon_level SMALLINT NOT NULL DEFAULT 1,
    parent_id INTEGER,
    is_public BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL,
    CONSTRAINT work_units_echelon_level_check CHECK (echelon_level IN (1, 2, 3)),
    CONSTRAINT work_units_parent_fk FOREIGN KEY (parent_id) REFERENCES work_units(id) ON DELETE RESTRICT,
    CONSTRAINT work_units_hierarchy_check CHECK (
        (echelon_level = 1 AND parent_id IS NULL)
        OR (echelon_level IN (2, 3) AND parent_id IS NOT NULL)
    )
);

ALTER TABLE users
    ADD CONSTRAINT users_work_unit_fk FOREIGN KEY (work_unit_id) REFERENCES work_units(id) ON DELETE SET NULL;

CREATE INDEX users_work_unit_active_idx
    ON users (work_unit_id, role, full_name)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX work_units_public_id_uidx ON work_units (public_id);

CREATE INDEX work_units_public_active_idx
    ON work_units (id)
    WHERE deleted_at IS NULL AND is_public = TRUE;

CREATE INDEX work_units_parent_active_idx
    ON work_units (parent_id, name)
    WHERE deleted_at IS NULL;

CREATE INDEX work_units_parent_sort_active_idx
    ON work_units (parent_id, sort_order, id)
    WHERE deleted_at IS NULL;

CREATE TABLE data_migration_markers (
    migration_key VARCHAR(120) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE knowledge_assets (
    id SERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
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
    publication_status VARCHAR(30) NOT NULL DEFAULT 'draft'
      CHECK (publication_status IN ('draft', 'pending_review', 'approved', 'revision_required', 'rejected')),
    submitted_at TIMESTAMP,
    submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMP,
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    review_note TEXT,
    review_round INTEGER NOT NULL DEFAULT 0,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    allow_download BOOLEAN NOT NULL DEFAULT TRUE,
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    work_unit_id INTEGER REFERENCES work_units(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE UNIQUE INDEX knowledge_assets_public_id_uidx ON knowledge_assets (public_id);

CREATE UNIQUE INDEX unique_active_slug
    ON knowledge_assets (slug)
    WHERE deleted_at IS NULL;

CREATE INDEX knowledge_assets_public_catalog_idx
    ON knowledge_assets (is_published, is_featured, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX knowledge_assets_public_created_idx
    ON knowledge_assets (created_at DESC, id DESC)
    WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX knowledge_assets_public_category_created_idx
    ON knowledge_assets (category_id, created_at DESC, id DESC)
    WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX knowledge_assets_public_work_unit_created_idx
    ON knowledge_assets (work_unit_id, created_at DESC, id DESC)
    WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX knowledge_assets_author_active_idx
    ON knowledge_assets (author_id, updated_at DESC, id DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX knowledge_assets_review_queue_idx
    ON knowledge_assets (publication_status, submitted_at ASC, id ASC)
    WHERE deleted_at IS NULL;

CREATE TABLE asset_publication_reviews (
    id BIGSERIAL PRIMARY KEY,
    asset_id INTEGER NOT NULL REFERENCES knowledge_assets(id) ON DELETE CASCADE,
    review_round INTEGER NOT NULL CHECK (review_round > 0),
    action VARCHAR(30) NOT NULL CHECK (action IN ('submitted', 'approved', 'revision_required', 'rejected')),
    note TEXT,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_label VARCHAR(150) NOT NULL,
    actor_role VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX asset_publication_reviews_asset_created_idx
    ON asset_publication_reviews (asset_id, created_at DESC, id DESC);

CREATE INDEX knowledge_assets_deleted_at_idx
    ON knowledge_assets (deleted_at DESC, id DESC)
    WHERE deleted_at IS NOT NULL;

CREATE INDEX knowledge_assets_public_search_idx
    ON knowledge_assets
    USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(content, '') || ' ' || COALESCE(extracted_text, '')))
    WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX knowledge_assets_public_title_trgm_idx
    ON knowledge_assets
    USING GIN (lower(title) gin_trgm_ops)
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
    type VARCHAR(20) NOT NULL CHECK (type IN (
      'comment', 'reply', 'share',
      'asset_submitted', 'asset_approved', 'asset_revision', 'asset_rejected'
    )),
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
CREATE INDEX asset_share_events_created_idx ON asset_share_events (created_at DESC);

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

CREATE INDEX users_backoffice_active_idx
    ON users (role, full_name, id)
    WHERE deleted_at IS NULL AND role <> 'user';

CREATE TABLE role_permissions (
    role VARCHAR(20) NOT NULL REFERENCES access_roles(code) ON UPDATE CASCADE ON DELETE CASCADE,
    resource VARCHAR(60) NOT NULL,
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_post BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by_label VARCHAR(150),
    PRIMARY KEY (role, resource)
);

INSERT INTO role_permissions (role, resource, can_view, can_post, can_edit, can_delete)
SELECT role_name, resource_name,
       role_name = 'admin'
         OR (role_name = 'pegawai' AND resource_name IN ('dashboard', 'assets', 'activity', 'profile'))
         OR (role_name = 'pimpinan' AND resource_name IN ('dashboard', 'assets', 'staff_management', 'profile'))
         OR (role_name = 'verifikator' AND resource_name IN ('dashboard', 'assets', 'asset_verification', 'activity', 'profile')),
       role_name = 'admin' OR (role_name = 'pegawai' AND resource_name = 'assets'),
       role_name = 'admin'
         OR (role_name = 'pegawai' AND resource_name IN ('assets', 'activity', 'profile'))
         OR (role_name = 'pimpinan' AND resource_name = 'profile')
         OR (role_name = 'verifikator' AND resource_name IN ('asset_verification', 'activity', 'profile')),
       role_name = 'admin' OR (role_name = 'pegawai' AND resource_name = 'assets')
FROM unnest(ARRAY['pegawai', 'pimpinan', 'verifikator', 'admin']) role_name
CROSS JOIN unnest(ARRAY[
  'dashboard', 'assets', 'asset_recovery', 'asset_verification', 'staff_management', 'role_permissions',
  'categories', 'work_units', 'announcements', 'activity', 'profile',
  'analytics_echelon_1', 'analytics_echelon_2', 'analytics_echelon_3'
]) resource_name;

UPDATE role_permissions
SET can_view = TRUE
WHERE role = 'pimpinan'
  AND resource IN ('analytics_echelon_1', 'analytics_echelon_2', 'analytics_echelon_3');

UPDATE role_permissions SET can_post = FALSE
WHERE resource NOT IN ('assets', 'staff_management', 'role_permissions', 'categories', 'work_units', 'announcements');
UPDATE role_permissions SET can_edit = FALSE
WHERE resource NOT IN ('assets', 'asset_recovery', 'asset_verification', 'staff_management', 'role_permissions', 'categories', 'work_units', 'announcements', 'activity', 'profile');
UPDATE role_permissions SET can_delete = FALSE
WHERE resource NOT IN ('assets', 'asset_recovery', 'staff_management', 'categories', 'work_units', 'announcements');

CREATE TABLE announcements (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    title VARCHAR(180) NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    asset_id INTEGER REFERENCES knowledge_assets(id) ON DELETE SET NULL,
    link_url TEXT,
    link_label VARCHAR(60) NOT NULL DEFAULT 'Lihat selengkapnya',
    display_order INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_label VARCHAR(150),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE UNIQUE INDEX announcements_public_id_uidx ON announcements (public_id);

CREATE INDEX announcements_asset_id_idx
    ON announcements (asset_id)
    WHERE asset_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX announcements_public_order_idx
    ON announcements (display_order ASC, updated_at DESC, id DESC)
    WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX announcements_admin_updated_idx
    ON announcements (updated_at DESC, id DESC)
    WHERE deleted_at IS NULL;
