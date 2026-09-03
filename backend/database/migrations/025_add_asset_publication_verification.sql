BEGIN;

-- Role bawaan ini hanya sebuah preset. Otorisasi verifikasi tetap ditentukan
-- oleh matriks role_permissions sehingga role buatan Admin dapat memperoleh
-- kemampuan yang sama tanpa perubahan kode aplikasi.
INSERT INTO access_roles (code, name, description, is_system, is_backoffice)
VALUES ('verifikator', 'Verifikator', 'Menilai kelayakan aset pengetahuan sesuai cakupan Unit Kerja.', TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE knowledge_assets
  ADD COLUMN IF NOT EXISTS publication_status VARCHAR(30) NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS submitted_by INTEGER,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS reviewed_by INTEGER,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS review_round INTEGER NOT NULL DEFAULT 0;

UPDATE knowledge_assets
SET publication_status = CASE WHEN is_published THEN 'approved' ELSE 'draft' END
WHERE (is_published = TRUE AND publication_status = 'draft')
   OR publication_status IS NULL
   OR publication_status NOT IN ('draft', 'pending_review', 'approved', 'revision_required', 'rejected');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_assets_publication_status_check') THEN
    ALTER TABLE knowledge_assets
      ADD CONSTRAINT knowledge_assets_publication_status_check
      CHECK (publication_status IN ('draft', 'pending_review', 'approved', 'revision_required', 'rejected'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_assets_submitted_by_fk') THEN
    ALTER TABLE knowledge_assets
      ADD CONSTRAINT knowledge_assets_submitted_by_fk
      FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_assets_reviewed_by_fk') THEN
    ALTER TABLE knowledge_assets
      ADD CONSTRAINT knowledge_assets_reviewed_by_fk
      FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS asset_publication_reviews (
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

CREATE INDEX IF NOT EXISTS asset_publication_reviews_asset_created_idx
  ON asset_publication_reviews (asset_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS knowledge_assets_review_queue_idx
  ON knowledge_assets (publication_status, submitted_at ASC, id ASC)
  WHERE deleted_at IS NULL;

INSERT INTO role_permissions (role, resource, can_view, can_post, can_edit, can_delete)
SELECT role.code, 'asset_verification',
       role.code IN ('admin', 'verifikator'),
       FALSE,
       role.code IN ('admin', 'verifikator'),
       FALSE
FROM access_roles role
WHERE role.is_backoffice = TRUE
ON CONFLICT (role, resource) DO NOTHING;

-- Preset minimal untuk role Verifikator. Semua nilai ini tetap dapat diubah
-- melalui halaman Hak Akses Role.
INSERT INTO role_permissions (role, resource, can_view, can_post, can_edit, can_delete)
SELECT 'verifikator', resource.key,
       resource.key IN ('dashboard', 'assets', 'asset_verification', 'activity', 'profile'),
       FALSE,
       resource.key IN ('asset_verification', 'activity', 'profile'),
       FALSE
FROM (VALUES
  ('dashboard'), ('assets'), ('asset_recovery'), ('asset_verification'),
  ('staff_management'), ('role_permissions'), ('categories'), ('work_units'),
  ('analytics_echelon_1'), ('analytics_echelon_2'), ('analytics_echelon_3'),
  ('announcements'), ('activity'), ('profile')
) AS resource(key)
ON CONFLICT (role, resource) DO NOTHING;

COMMIT;
