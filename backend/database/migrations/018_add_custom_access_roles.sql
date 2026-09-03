BEGIN;

CREATE TABLE IF NOT EXISTS access_roles (
  code VARCHAR(20) PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  description VARCHAR(255),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_backoffice BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT access_roles_code_format_check CHECK (code ~ '^[a-z][a-z0-9_]{2,19}$')
);

INSERT INTO access_roles (code, name, description, is_system, is_backoffice)
VALUES
  ('user', 'Pengguna', 'Akun publik untuk membaca dan berkomentar.', TRUE, FALSE),
  ('pegawai', 'Pegawai', 'Kontributor pengetahuan KMS.', TRUE, TRUE),
  ('pimpinan', 'Pimpinan', 'Akses pemantauan organisasi.', TRUE, TRUE),
  ('admin', 'Admin', 'Pengelola administrasi KMS.', TRUE, TRUE)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_system = TRUE,
  is_backoffice = EXCLUDED.is_backoffice,
  updated_at = CURRENT_TIMESTAMP;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE user_sessions DROP CONSTRAINT IF EXISTS user_sessions_role_check;
ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_check;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_fk
      FOREIGN KEY (role) REFERENCES access_roles(code) ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_sessions_role_fk') THEN
    ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_role_fk
      FOREIGN KEY (role) REFERENCES access_roles(code) ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_role_fk') THEN
    ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_fk
      FOREIGN KEY (role) REFERENCES access_roles(code) ON UPDATE CASCADE ON DELETE CASCADE;
  END IF;
END $$;

DROP INDEX IF EXISTS users_backoffice_active_idx;
CREATE INDEX users_backoffice_active_idx
  ON users (role, full_name, id)
  WHERE deleted_at IS NULL AND role <> 'user';

UPDATE role_permissions
SET can_post = TRUE, updated_at = CURRENT_TIMESTAMP
WHERE role = 'admin' AND resource = 'role_permissions';

COMMIT;
