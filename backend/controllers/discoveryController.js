const pool = require("../database/db");

const normalizedQuery = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 200) : "";
const getSearchTerms = (value, maxTerms = 8) => {
  const candidates = normalizedQuery(value).match(/[\p{L}\p{N}]+/gu) || [];
  const seen = new Set();
  return candidates.filter((term) => {
    const normalized = term.toLocaleLowerCase("id-ID");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, maxTerms);
};
const SEARCH_SUGGESTION_LIMIT = 6;

const getSearchSuggestions = async (req, res) => {
  const query = getSearchTerms(req.query.q).join(" ");
  if (query.length < 2) return res.json([]);

  try {
    const { rows } = await pool.query(
      `SELECT a.public_id AS id, a.title, a.asset_type
       FROM knowledge_assets a
       LEFT JOIN work_units w ON w.id = a.work_unit_id
       WHERE a.is_published = TRUE AND a.deleted_at IS NULL
         AND (a.work_unit_id IS NULL OR (
           w.id IS NOT NULL AND NOT EXISTS (
             WITH RECURSIVE ancestors AS (
               SELECT id, parent_id, is_public, deleted_at FROM work_units WHERE id = w.id
               UNION ALL
               SELECT parent.id, parent.parent_id, parent.is_public, parent.deleted_at
               FROM work_units parent INNER JOIN ancestors child ON child.parent_id = parent.id
             )
             SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL OR is_public = FALSE
           )
         ))
         AND (
           POSITION(LOWER($1) IN LOWER(COALESCE(a.title, ''))) > 0
           OR ($2 = TRUE AND to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '') || ' ' || COALESCE(a.extracted_text, ''))
             @@ plainto_tsquery('simple', $1))
         )
       ORDER BY CASE
                  WHEN POSITION(LOWER($1) IN LOWER(COALESCE(a.title, ''))) = 1 THEN 0
                  WHEN POSITION(LOWER($1) IN LOWER(COALESCE(a.title, ''))) > 1 THEN 1
                  ELSE 2
                END,
                CASE WHEN $2 = TRUE THEN ts_rank(to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '') || ' ' || COALESCE(a.extracted_text, '')), plainto_tsquery('simple', $1)) ELSE 0 END DESC,
                a.created_at DESC, a.id DESC
       LIMIT $3`,
      [query, query.length >= 3, SEARCH_SUGGESTION_LIMIT],
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching search suggestions:", error);
    res.status(500).json({ error: "Gagal memuat saran pencarian" });
  }
};

const trackSearchEvent = async (req, res) => {
  const query = normalizedQuery(req.body?.query);
  const resultCount = Number.parseInt(req.body?.resultCount, 10);
  if (query.length < 3) return res.status(204).send();

  try {
    await pool.query(
      "INSERT INTO search_events (query, result_count) VALUES ($1, $2)",
      [query.slice(0, 200), Number.isInteger(resultCount) && resultCount >= 0 ? resultCount : 0],
    );
    res.status(201).json({ message: "Pencarian tercatat" });
  } catch (error) {
    console.error("Error tracking search event:", error);
    res.status(500).json({ error: "Gagal mencatat pencarian" });
  }
};

module.exports = { getSearchSuggestions, trackSearchEvent };
