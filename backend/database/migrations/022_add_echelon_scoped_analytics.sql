BEGIN;

-- Eselon III adalah tim/unit turunan langsung dari Eselon II.
ALTER TABLE work_units DROP CONSTRAINT IF EXISTS work_units_echelon_level_check;
ALTER TABLE work_units DROP CONSTRAINT IF EXISTS work_units_hierarchy_check;

ALTER TABLE work_units
  ADD CONSTRAINT work_units_echelon_level_check CHECK (echelon_level IN (1, 2, 3)),
  ADD CONSTRAINT work_units_hierarchy_check CHECK (
    (echelon_level = 1 AND parent_id IS NULL)
    OR (echelon_level IN (2, 3) AND parent_id IS NOT NULL)
  );

ALTER TABLE users ADD COLUMN IF NOT EXISTS work_unit_id INTEGER;

UPDATE users u
SET work_unit_id = w.id
FROM work_units w
WHERE u.work_unit_id IS NULL
  AND w.deleted_at IS NULL
  AND LOWER(TRIM(COALESCE(u.department, ''))) = LOWER(TRIM(w.name));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_work_unit_fk') THEN
    ALTER TABLE users ADD CONSTRAINT users_work_unit_fk
      FOREIGN KEY (work_unit_id) REFERENCES work_units(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_work_unit_active_idx
  ON users (work_unit_id, role, full_name)
  WHERE deleted_at IS NULL;

-- Hak melihat halaman analitik dipisahkan per tingkat. Batas unit organisasi
-- tetap diperiksa kembali oleh controller menggunakan work_unit_id akun.
INSERT INTO role_permissions (role, resource, can_view, can_post, can_edit, can_delete)
SELECT role.code, resource.key,
       CASE WHEN role.code IN ('admin', 'pimpinan') THEN TRUE ELSE FALSE END,
       FALSE, FALSE, FALSE
FROM access_roles role
CROSS JOIN (VALUES
  ('analytics_echelon_1'),
  ('analytics_echelon_2'),
  ('analytics_echelon_3')
) AS resource(key)
WHERE role.is_backoffice = TRUE
ON CONFLICT (role, resource) DO NOTHING;

COMMIT;
