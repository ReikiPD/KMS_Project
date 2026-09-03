BEGIN;

-- Admin kini dapat berasal dari akun database. Admin environment tetap
-- dipertahankan sebagai akses darurat dan tidak tercatat pada tabel users.
DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

-- Daftar role tidak lagi dikunci oleh CHECK statis; migrasi 018 menambahkan
-- referensi ke tabel access_roles.

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'user_sessions'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE user_sessions DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE user_sessions
  ADD CONSTRAINT user_sessions_actor_check
    CHECK (
      (user_id IS NULL AND role = 'admin' AND admin_config_hash IS NOT NULL AND session_version IS NULL)
      OR
      (user_id IS NOT NULL AND admin_config_hash IS NULL AND session_version IS NOT NULL)
    );

CREATE TABLE IF NOT EXISTS role_permissions (
  role VARCHAR(20) NOT NULL,
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
VALUES
  ('pegawai', 'dashboard', TRUE, FALSE, FALSE, FALSE),
  ('pegawai', 'assets', TRUE, TRUE, TRUE, TRUE),
  ('pegawai', 'asset_recovery', FALSE, FALSE, FALSE, FALSE),
  ('pegawai', 'staff_management', FALSE, FALSE, FALSE, FALSE),
  ('pegawai', 'role_permissions', FALSE, FALSE, FALSE, FALSE),
  ('pegawai', 'categories', FALSE, FALSE, FALSE, FALSE),
  ('pegawai', 'work_units', FALSE, FALSE, FALSE, FALSE),
  ('pegawai', 'announcements', FALSE, FALSE, FALSE, FALSE),
  ('pegawai', 'activity', TRUE, FALSE, TRUE, FALSE),
  ('pegawai', 'profile', TRUE, FALSE, TRUE, FALSE),

  ('pimpinan', 'dashboard', TRUE, FALSE, FALSE, FALSE),
  ('pimpinan', 'assets', TRUE, FALSE, FALSE, FALSE),
  ('pimpinan', 'asset_recovery', FALSE, FALSE, FALSE, FALSE),
  ('pimpinan', 'staff_management', TRUE, FALSE, FALSE, FALSE),
  ('pimpinan', 'role_permissions', FALSE, FALSE, FALSE, FALSE),
  ('pimpinan', 'categories', FALSE, FALSE, FALSE, FALSE),
  ('pimpinan', 'work_units', FALSE, FALSE, FALSE, FALSE),
  ('pimpinan', 'announcements', FALSE, FALSE, FALSE, FALSE),
  ('pimpinan', 'activity', FALSE, FALSE, FALSE, FALSE),
  ('pimpinan', 'profile', TRUE, FALSE, TRUE, FALSE),

  ('admin', 'dashboard', TRUE, TRUE, TRUE, TRUE),
  ('admin', 'assets', TRUE, TRUE, TRUE, TRUE),
  ('admin', 'asset_recovery', TRUE, TRUE, TRUE, TRUE),
  ('admin', 'staff_management', TRUE, TRUE, TRUE, TRUE),
  ('admin', 'role_permissions', TRUE, TRUE, TRUE, TRUE),
  ('admin', 'categories', TRUE, TRUE, TRUE, TRUE),
  ('admin', 'work_units', TRUE, TRUE, TRUE, TRUE),
  ('admin', 'announcements', TRUE, TRUE, TRUE, TRUE),
  ('admin', 'activity', TRUE, TRUE, TRUE, TRUE),
  ('admin', 'profile', TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (role, resource) DO NOTHING;

-- Kolom tetap seragam di UI, tetapi aksi yang memang tidak dimiliki suatu
-- fitur disimpan FALSE agar matriks tidak memberi kesan izin palsu.
UPDATE role_permissions SET can_post = FALSE
WHERE resource NOT IN ('assets', 'staff_management', 'role_permissions', 'categories', 'work_units', 'announcements');
UPDATE role_permissions SET can_edit = FALSE
WHERE resource NOT IN ('assets', 'asset_recovery', 'staff_management', 'role_permissions', 'categories', 'work_units', 'announcements', 'activity', 'profile');
UPDATE role_permissions SET can_delete = FALSE
WHERE resource NOT IN ('assets', 'asset_recovery', 'staff_management', 'categories', 'work_units', 'announcements');

DROP INDEX IF EXISTS users_backoffice_active_idx;
CREATE INDEX users_backoffice_active_idx
  ON users (role, full_name, id)
  WHERE deleted_at IS NULL AND role <> 'user';

COMMIT;
