ALTER TABLE users
    ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGSERIAL PRIMARY KEY,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    actor_label VARCHAR(150) NOT NULL,
    actor_email VARCHAR(150) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'pegawai', 'pimpinan', 'admin')),
    session_version INTEGER,
    admin_config_hash VARCHAR(64),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    idle_expires_at TIMESTAMP NOT NULL,
    absolute_expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP DEFAULT NULL,
    CHECK (
      (role = 'admin' AND user_id IS NULL AND admin_config_hash IS NOT NULL)
      OR
      (role <> 'admin' AND user_id IS NOT NULL AND session_version IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS user_sessions_user_active_idx
    ON user_sessions (user_id, absolute_expires_at DESC)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx
    ON user_sessions (absolute_expires_at, idle_expires_at);
