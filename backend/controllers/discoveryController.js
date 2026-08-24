const pool = require("../database/db");

const normalizedQuery = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const getSearchSuggestions = async (req, res) => {
  const query = normalizedQuery(req.query.q);
  if (query.length < 1) return res.json([]);

  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.title, a.asset_type
       FROM knowledge_assets a
       WHERE a.is_published = TRUE AND a.deleted_at IS NULL
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
       LIMIT 6`,
      [query, query.length >= 3],
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
