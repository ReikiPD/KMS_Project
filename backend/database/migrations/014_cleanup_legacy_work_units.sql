-- Pembersihan satu kali Unit Kerja lama setelah struktur resmi Eselon I/II tersedia.
-- Aset dan departemen pengguna dipindahkan lebih dahulu agar tidak kehilangan relasi.

CREATE TABLE IF NOT EXISTS data_migration_markers (
    migration_key VARCHAR(120) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
DECLARE
    official_names TEXT[] := ARRAY[
        'Sekretariat Jenderal',
        'Inspektorat Jenderal',
        'Direktorat Jenderal Perhubungan Darat',
        'Direktorat Jenderal Perhubungan Laut',
        'Direktorat Jenderal Perhubungan Udara',
        'Direktorat Jenderal Perkeretaapian',
        'Direktorat Jenderal Integrasi Transportasi dan Multimoda',
        'Badan Kebijakan Transportasi',
        'Badan Pengembangan Sumber Daya Manusia (BPSDM) Perhubungan',
        'Sekretariat Badan Kebijakan Transportasi',
        'Pusat Kebijakan Sarana Transportasi',
        'Pusat Kebijakan Prasarana dan Integrasi Moda',
        'Pusat Kebijakan Lalu Lintas dan Angkutan Transportasi',
        'Pusat Kebijakan Keselamatan dan Keamanan Transportasi'
    ];
    legacy_unit RECORD;
    target_name TEXT;
    target_id INTEGER;
    fallback_id INTEGER;
    moved_assets INTEGER := 0;
    moved_users INTEGER := 0;
    deleted_units INTEGER := 0;
    affected_rows INTEGER := 0;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM data_migration_markers
        WHERE migration_key = '014_cleanup_legacy_work_units_v1'
    ) THEN
        RETURN;
    END IF;

    SELECT id INTO fallback_id
    FROM work_units
    WHERE name = 'Sekretariat Jenderal'
      AND deleted_at IS NULL
    LIMIT 1;

    IF fallback_id IS NULL THEN
        SELECT id INTO fallback_id
        FROM work_units
        WHERE name = ANY(official_names)
          AND echelon_level = 1
          AND deleted_at IS NULL
        ORDER BY id
        LIMIT 1;
    END IF;

    IF fallback_id IS NULL THEN
        RAISE EXCEPTION 'Pembersihan Unit Kerja dibatalkan: tidak ada Eselon I resmi yang aktif';
    END IF;

    FOR legacy_unit IN
        SELECT id, name
        FROM work_units
        WHERE NOT (name = ANY(official_names))
        ORDER BY id
    LOOP
        target_name := CASE
            WHEN LOWER(legacy_unit.name) IN ('sekretariat badan', 'seketariat bkt', 'sekretariat bkt') THEN 'Sekretariat Badan Kebijakan Transportasi'
            WHEN LOWER(legacy_unit.name) IN ('pusjak pkst', 'pusat kebijakan sarana transportasi') THEN 'Pusat Kebijakan Sarana Transportasi'
            WHEN LOWER(legacy_unit.name) IN ('pusjak ptim', 'pusat kebijakan prasarana transportasi dan integrasi moda') THEN 'Pusat Kebijakan Prasarana dan Integrasi Moda'
            WHEN LOWER(legacy_unit.name) IN ('pusjak llatp', 'pusat kebijakan lalu lintas, angkutan, dan transportasi perkotaan') THEN 'Pusat Kebijakan Lalu Lintas dan Angkutan Transportasi'
            WHEN LOWER(legacy_unit.name) IN ('pusjak kkt') THEN 'Pusat Kebijakan Keselamatan dan Keamanan Transportasi'
            WHEN LOWER(legacy_unit.name) ~ '(udara|penerbangan)' THEN 'Direktorat Jenderal Perhubungan Udara'
            WHEN LOWER(legacy_unit.name) ~ '(laut|pelayaran|pelabuhan)' THEN 'Direktorat Jenderal Perhubungan Laut'
            WHEN LOWER(legacy_unit.name) ~ '(darat|jalan)' THEN 'Direktorat Jenderal Perhubungan Darat'
            WHEN LOWER(legacy_unit.name) ~ '(kereta)' THEN 'Direktorat Jenderal Perkeretaapian'
            WHEN LOWER(legacy_unit.name) ~ '(sumber daya manusia|sdm|diklat|pelatihan)' THEN 'Badan Pengembangan Sumber Daya Manusia (BPSDM) Perhubungan'
            WHEN LOWER(legacy_unit.name) ~ '(kebijakan|pusjak)' THEN 'Badan Kebijakan Transportasi'
            WHEN LOWER(legacy_unit.name) ~ '(integrasi|multimoda)' THEN 'Direktorat Jenderal Integrasi Transportasi dan Multimoda'
            WHEN LOWER(legacy_unit.name) ~ '(inspekt)' THEN 'Inspektorat Jenderal'
            ELSE 'Sekretariat Jenderal'
        END;

        SELECT id INTO target_id
        FROM work_units
        WHERE name = target_name
          AND deleted_at IS NULL
        LIMIT 1;

        target_id := COALESCE(target_id, fallback_id);

        UPDATE knowledge_assets
        SET work_unit_id = target_id
        WHERE work_unit_id = legacy_unit.id;
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        moved_assets := moved_assets + affected_rows;

        UPDATE users
        SET department = (SELECT name FROM work_units WHERE id = target_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE LOWER(COALESCE(department, '')) = LOWER(legacy_unit.name);
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        moved_users := moved_users + affected_rows;
    END LOOP;

    -- Lepaskan relasi antarsesama Unit Kerja lama sebelum penghapusan permanen.
    UPDATE work_units
    SET echelon_level = 1,
        parent_id = NULL
    WHERE NOT (name = ANY(official_names));

    DELETE FROM work_units
    WHERE NOT (name = ANY(official_names));
    GET DIAGNOSTICS deleted_units = ROW_COUNT;

    INSERT INTO data_migration_markers (migration_key)
    VALUES ('014_cleanup_legacy_work_units_v1');

    RAISE NOTICE 'Pembersihan Unit Kerja selesai: % unit dihapus, % aset dan % pengguna dipindahkan',
        deleted_units, moved_assets, moved_users;
END $$;
