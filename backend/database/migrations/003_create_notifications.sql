CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    asset_id INTEGER REFERENCES knowledge_assets(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('comment', 'reply', 'share')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
    ON notifications (recipient_id, is_read, created_at DESC);
