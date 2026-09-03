CREATE TABLE IF NOT EXISTS announcements (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid(),
    title VARCHAR(180) NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    link_url TEXT,
    link_label VARCHAR(60) NOT NULL DEFAULT 'Lihat selengkapnya',
    display_order INTEGER NOT NULL DEFAULT 0,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_label VARCHAR(150),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS announcements_public_id_uidx
    ON announcements (public_id);

CREATE INDEX IF NOT EXISTS announcements_public_order_idx
    ON announcements (display_order ASC, updated_at DESC, id DESC)
    WHERE is_published = TRUE AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS announcements_admin_updated_idx
    ON announcements (updated_at DESC, id DESC)
    WHERE deleted_at IS NULL;
