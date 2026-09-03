-- Struktur organisasi Unit Kerja: Eselon I sebagai induk dan Eselon II sebagai cabang.

ALTER TABLE work_units
    ADD COLUMN IF NOT EXISTS alias VARCHAR(40),
    ADD COLUMN IF NOT EXISTS echelon_level SMALLINT,
    ADD COLUMN IF NOT EXISTS parent_id INTEGER;

UPDATE work_units
SET echelon_level = 1
WHERE echelon_level IS NULL;

ALTER TABLE work_units
    ALTER COLUMN echelon_level SET DEFAULT 1,
    ALTER COLUMN echelon_level SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'work_units_echelon_level_check'
    ) THEN
        ALTER TABLE work_units
            ADD CONSTRAINT work_units_echelon_level_check
            CHECK (echelon_level IN (1, 2));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'work_units_parent_fk'
    ) THEN
        ALTER TABLE work_units
            ADD CONSTRAINT work_units_parent_fk
            FOREIGN KEY (parent_id) REFERENCES work_units(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'work_units_hierarchy_check'
    ) THEN
        ALTER TABLE work_units
            ADD CONSTRAINT work_units_hierarchy_check
            CHECK (
                (echelon_level = 1 AND parent_id IS NULL)
                OR (echelon_level = 2 AND parent_id IS NOT NULL)
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS work_units_parent_active_idx
    ON work_units (parent_id, name)
    WHERE deleted_at IS NULL;

-- Normalisasi dua nama lama agar tidak membuat cabang BKT ganda.
DO $$
DECLARE
    mapping RECORD;
    old_unit_id INTEGER;
    canonical_unit_id INTEGER;
BEGIN
    FOR mapping IN
        SELECT * FROM (VALUES
            ('Pusat Kebijakan Prasarana Transportasi dan Integrasi Moda', 'Pusat Kebijakan Prasarana dan Integrasi Moda'),
            ('Pusat Kebijakan Lalu Lintas, Angkutan, dan Transportasi Perkotaan', 'Pusat Kebijakan Lalu Lintas dan Angkutan Transportasi')
        ) AS aliases(old_name, canonical_name)
    LOOP
        SELECT id INTO old_unit_id
        FROM work_units
        WHERE LOWER(name) = LOWER(mapping.old_name)
        ORDER BY deleted_at NULLS FIRST, id
        LIMIT 1;

        SELECT id INTO canonical_unit_id
        FROM work_units
        WHERE LOWER(name) = LOWER(mapping.canonical_name)
        ORDER BY deleted_at NULLS FIRST, id
        LIMIT 1;

        IF old_unit_id IS NOT NULL AND canonical_unit_id IS NULL THEN
            UPDATE work_units SET name = mapping.canonical_name WHERE id = old_unit_id;
            canonical_unit_id := old_unit_id;
        ELSIF old_unit_id IS NOT NULL AND canonical_unit_id IS NOT NULL AND old_unit_id <> canonical_unit_id THEN
            UPDATE knowledge_assets SET work_unit_id = canonical_unit_id WHERE work_unit_id = old_unit_id;
            UPDATE work_units SET deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP) WHERE id = old_unit_id;
        END IF;

        UPDATE users
        SET department = mapping.canonical_name,
            updated_at = CURRENT_TIMESTAMP
        WHERE LOWER(COALESCE(department, '')) = LOWER(mapping.old_name);
    END LOOP;
END $$;

INSERT INTO work_units (name, alias, echelon_level, parent_id, is_public, deleted_at)
VALUES
    ('Sekretariat Jenderal', 'Setjen', 1, NULL, TRUE, NULL),
    ('Inspektorat Jenderal', 'Itjen', 1, NULL, TRUE, NULL),
    ('Direktorat Jenderal Perhubungan Darat', 'Ditjen Hubdat', 1, NULL, TRUE, NULL),
    ('Direktorat Jenderal Perhubungan Laut', 'Ditjen Hubla', 1, NULL, TRUE, NULL),
    ('Direktorat Jenderal Perhubungan Udara', 'Ditjen Hubud', 1, NULL, TRUE, NULL),
    ('Direktorat Jenderal Perkeretaapian', 'DJKA', 1, NULL, TRUE, NULL),
    ('Direktorat Jenderal Integrasi Transportasi dan Multimoda', 'Ditjen Intram', 1, NULL, TRUE, NULL),
    ('Badan Kebijakan Transportasi', 'BKT', 1, NULL, TRUE, NULL),
    ('Badan Pengembangan Sumber Daya Manusia (BPSDM) Perhubungan', 'BPSDMP', 1, NULL, TRUE, NULL)
ON CONFLICT (name) DO UPDATE
SET alias = EXCLUDED.alias,
    echelon_level = 1,
    parent_id = NULL;

WITH bkt AS (
    SELECT id FROM work_units WHERE name = 'Badan Kebijakan Transportasi' LIMIT 1
)
INSERT INTO work_units (name, alias, echelon_level, parent_id, is_public, deleted_at)
SELECT unit.name, unit.alias, 2, bkt.id, TRUE, NULL
FROM bkt
CROSS JOIN (VALUES
    ('Sekretariat Badan Kebijakan Transportasi', 'Sekretariat BKT'),
    ('Pusat Kebijakan Sarana Transportasi', 'Pusjak Sarana'),
    ('Pusat Kebijakan Prasarana dan Integrasi Moda', 'Pusjak PIM'),
    ('Pusat Kebijakan Lalu Lintas dan Angkutan Transportasi', 'Pusjak LLAT'),
    ('Pusat Kebijakan Keselamatan dan Keamanan Transportasi', 'Pusjak KKT')
) AS unit(name, alias)
ON CONFLICT (name) DO UPDATE
SET alias = EXCLUDED.alias,
    echelon_level = 2,
    parent_id = EXCLUDED.parent_id;
