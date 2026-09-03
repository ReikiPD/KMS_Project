-- Demo data for the public KMS Kemenhub catalogue.
-- Run 001_add_featured_assets.sql first. This script only adds missing rows.

BEGIN;

INSERT INTO categories (name, slug, description)
SELECT source.name, source.slug, source.description
FROM (
    VALUES
        ('Keselamatan Transportasi', 'keselamatan-transportasi', 'Pengetahuan dan praktik keselamatan pada seluruh moda transportasi.'),
        ('Transformasi Digital', 'transformasi-digital', 'Panduan digitalisasi layanan dan tata kelola data Kemenhub.'),
        ('Manajemen SDM', 'manajemen-sdm', 'Materi pengembangan kompetensi dan pembelajaran pegawai.')
) AS source(name, slug, description)
WHERE NOT EXISTS (
    SELECT 1 FROM categories category_row
    WHERE category_row.slug = source.slug
);

WITH demo_assets (title, slug, asset_type, content, is_featured, category_slug, work_unit_name) AS (
    VALUES
        (
            'Contoh Panduan Pelaporan Insiden Keselamatan Transportasi',
            'contoh-panduan-pelaporan-insiden-keselamatan-transportasi',
            'document',
            'Materi contoh ini disiapkan untuk demonstrasi KMS Kemenhub. Gunakan sebagai pola penyusunan panduan operasional di unit kerja.',
            TRUE,
            'keselamatan-transportasi',
            'Direktorat Jenderal Perhubungan Darat'
        ),
        (
            'Contoh Tata Kelola Data Transportasi Terintegrasi',
            'contoh-tata-kelola-data-transportasi-terintegrasi',
            'article',
            'Materi contoh ini menjelaskan peran pemilik data, standar kualitas data, dan pemanfaatan data untuk pengambilan keputusan.',
            TRUE,
            'transformasi-digital',
            'Direktorat Jenderal Integrasi Transportasi dan Multimoda'
        ),
        (
            'Contoh Panduan Berbagi Pengetahuan di Unit Kerja',
            'contoh-panduan-berbagi-pengetahuan-di-unit-kerja',
            'document',
            'Materi contoh ini memuat langkah identifikasi pengetahuan, dokumentasi, kurasi, dan penyebarluasan di lingkungan Kemenhub.',
            TRUE,
            'manajemen-sdm',
            'Badan Pengembangan Sumber Daya Manusia (BPSDM) Perhubungan'
        ),
        (
            'Contoh Checklist Kesiapan Layanan Digital',
            'contoh-checklist-kesiapan-layanan-digital',
            'document',
            'Materi contoh ini membantu tim memastikan kesiapan proses bisnis, keamanan, aksesibilitas, dan dukungan pengguna.',
            FALSE,
            'transformasi-digital',
            'Direktorat Jenderal Integrasi Transportasi dan Multimoda'
        ),
        (
            'Contoh Praktik Baik Pelatihan Berbasis Kebutuhan',
            'contoh-praktik-baik-pelatihan-berbasis-kebutuhan',
            'article',
            'Materi contoh ini dapat menjadi acuan diskusi komunitas belajar untuk menyusun program pengembangan kompetensi.',
            FALSE,
            'manajemen-sdm',
            'Badan Pengembangan Sumber Daya Manusia (BPSDM) Perhubungan'
        ),
        (
            'Contoh Prosedur Komunikasi Risiko Keselamatan',
            'contoh-prosedur-komunikasi-risiko-keselamatan',
            'article',
            'Materi contoh ini menggambarkan struktur pesan, jalur eskalasi, dan evaluasi komunikasi risiko keselamatan.',
            FALSE,
            'keselamatan-transportasi',
            'Direktorat Jenderal Perhubungan Darat'
        )
)
INSERT INTO knowledge_assets (
    title,
    slug,
    asset_type,
    content,
    is_published,
    publication_status,
    is_featured,
    author_id,
    category_id,
    work_unit_id
)
SELECT
    asset.title,
    asset.slug,
    asset.asset_type,
    asset.content,
    TRUE,
    'approved',
    asset.is_featured,
    (
        SELECT id FROM users
        WHERE role = 'pegawai' AND deleted_at IS NULL
        ORDER BY id
        LIMIT 1
    ),
    category_row.id,
    work_unit_row.id
FROM demo_assets asset
LEFT JOIN categories category_row ON category_row.slug = asset.category_slug
LEFT JOIN work_units work_unit_row ON work_unit_row.name = asset.work_unit_name
WHERE NOT EXISTS (
    SELECT 1 FROM knowledge_assets existing_asset
    WHERE existing_asset.slug = asset.slug AND existing_asset.deleted_at IS NULL
);

COMMIT;
