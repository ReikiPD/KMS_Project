const pool = require("../database/db");

const normalizedQuery = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const getSearchSuggestions = async (req, res) => {
  const query = normalizedQuery(req.query.q);
  if (query.length < 3) return res.json([]);

  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.title, a.asset_type
       FROM knowledge_assets a
       WHERE a.is_published = TRUE AND a.deleted_at IS NULL
         AND to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '') || ' ' || COALESCE(a.extracted_text, ''))
           @@ websearch_to_tsquery('simple', $1)
       ORDER BY ts_rank(to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '') || ' ' || COALESCE(a.extracted_text, '')), websearch_to_tsquery('simple', $1)) DESC,
                a.created_at DESC, a.id DESC
       LIMIT 6`,
      [query],
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
