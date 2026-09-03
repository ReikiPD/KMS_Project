ALTER TABLE announcements
    ADD COLUMN IF NOT EXISTS asset_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'announcements_asset_id_fkey'
          AND conrelid = 'announcements'::regclass
    ) THEN
        ALTER TABLE announcements
            ADD CONSTRAINT announcements_asset_id_fkey
            FOREIGN KEY (asset_id)
            REFERENCES knowledge_assets(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS announcements_asset_id_idx
    ON announcements (asset_id)
    WHERE asset_id IS NOT NULL AND deleted_at IS NULL;
