BEGIN;

ALTER TABLE work_units
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked_units AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY parent_id
           ORDER BY CASE WHEN sort_order > 0 THEN sort_order ELSE 2147483647 END, id
         )::INTEGER AS next_sort_order
  FROM work_units
  WHERE deleted_at IS NULL
)
UPDATE work_units target
SET sort_order = ranked.next_sort_order
FROM ranked_units ranked
WHERE target.id = ranked.id;

CREATE INDEX IF NOT EXISTS work_units_parent_sort_active_idx
  ON work_units (parent_id, sort_order, id)
  WHERE deleted_at IS NULL;

COMMIT;
