const pool = require("../../config/db");
const { getPositiveInteger } = require("../../utils");
const { createNotification } = require("../../services/notificationService");
const {
  PUBLIC_ASSET_JOINS,
  PUBLIC_WORK_UNIT_FILTER,
  PUBLIC_ASSET_SELECT,
  PUBLIC_ASSET_CARD_SELECT,
  addAssetIdentifierFilter,
  getSearchTerms,
} = require("./shared");

// Detail-only fields: a reading estimate from the extracted text and the date of the
// latest content edit. Catalogue/card queries keep the lighter projection.
const PUBLIC_DETAIL_EXTRA_FIELDS = `
    CASE
      WHEN a.asset_type = 'video' OR a.extracted_text IS NULL THEN NULL
      ELSE (
        SELECT CASE WHEN words.normalized = '' THEN NULL
          ELSE char_length(words.normalized) - char_length(replace(words.normalized, ' ', '')) + 1
        END
        FROM (SELECT btrim(regexp_replace(a.extracted_text, '[[:space:]]+', ' ', 'g')) AS normalized) words
      )
    END AS word_count,
    (
      SELECT MAX(v.created_at)
      FROM asset_versions v
      WHERE v.asset_id = a.id
        AND v.changed_fields && ARRAY['title', 'content', 'file_url', 'video_duration_seconds', 'video_chapters']::text[]
    ) AS content_updated_at`;

const PUBLIC_ASSET_DETAIL_SELECT = PUBLIC_ASSET_SELECT.replace("SELECT", `SELECT${PUBLIC_DETAIL_EXTRA_FIELDS},`);

const PUBLIC_SEARCH_TEXT = `(
  COALESCE(a.title, '') || ' ' ||
  COALESCE(a.content, '') || ' ' ||
  COALESCE(a.extracted_text, '') || ' ' ||
  CASE
    WHEN a.asset_type = 'video' THEN 'video mp4 webm ogg'
    ELSE 'dokumen document pdf file'
  END || ' ' ||
  COALESCE(a.file_url, '') || ' ' ||
  COALESCE(c.name, '') || ' ' ||
  COALESCE(w.name, '') || ' ' ||
  COALESCE(w.alias, '') || ' ' ||
  COALESCE(parent_w.name, '') || ' ' ||
  COALESCE(parent_w.alias, '') || ' ' ||
  COALESCE(u.full_name, '')
)`;

const PUBLIC_SEARCH_VECTOR = `to_tsvector('simple', ${PUBLIC_SEARCH_TEXT})`;

// Fuzzy matching intentionally stays on short metadata fields. Comparing a
// query with full PDF text would make every catalogue request unnecessarily
// expensive as the collection grows.
const PUBLIC_SEARCH_FUZZY_TEXT = `(
  COALESCE(a.title, '') || ' ' ||
  CASE WHEN a.asset_type = 'video' THEN 'video mp4 webm ogg' ELSE 'dokumen pdf' END || ' ' ||
  COALESCE(c.name, '') || ' ' ||
  COALESCE(w.name, '') || ' ' ||
  COALESCE(w.alias, '') || ' ' ||
  COALESCE(parent_w.name, '') || ' ' ||
  COALESCE(parent_w.alias, '') || ' ' ||
  COALESCE(u.full_name, '')
)`;

const buildPublicFilters = ({ q, categoryId, workUnitId, assetType }) => {
  const values = [];
  const filters = ["a.is_published = TRUE", "a.deleted_at IS NULL", PUBLIC_WORK_UNIT_FILTER];
  const rawSearchTerm = typeof q === "string" ? q.trim() : "";
  const searchTerm = getSearchTerms(rawSearchTerm).join(" ");

  if (rawSearchTerm.length >= 3 && searchTerm) {
    values.push(searchTerm);
    const parameter = `$${values.length}`;
    filters.push(`(
      ${PUBLIC_SEARCH_VECTOR} @@ plainto_tsquery('simple', ${parameter})
      OR word_similarity(lower(${parameter}), lower(${PUBLIC_SEARCH_FUZZY_TEXT})) >= 0.38
    )`);
  }

  const parsedCategoryId = Number.parseInt(categoryId, 10);
  if (Number.isInteger(parsedCategoryId) && parsedCategoryId > 0) {
    values.push(parsedCategoryId);
    filters.push(`a.category_id = $${values.length}`);
  }

  const parsedWorkUnitId = Number.parseInt(workUnitId, 10);
  if (Number.isInteger(parsedWorkUnitId) && parsedWorkUnitId > 0) {
    values.push(parsedWorkUnitId);
    filters.push(`a.work_unit_id IN (
      WITH RECURSIVE selected_units AS (
        SELECT id FROM work_units WHERE id = $${values.length} AND deleted_at IS NULL
        UNION ALL
        SELECT child.id FROM work_units child
        INNER JOIN selected_units parent_scope ON child.parent_id = parent_scope.id
        WHERE child.deleted_at IS NULL
      ) SELECT id FROM selected_units
    )`);
  }

  if (assetType === "document" || assetType === "video") {
    filters.push(`a.asset_type = $${values.push(assetType)}`);
  }

  return { values, whereClause: filters.join(" AND "), searchTerm };
};

// ============================================================================
// BAGIAN 1: KNOWLEDGE ASSETS (ASET PENGETAHUAN)
// ============================================================================

const getHomepageAssets = async (req, res) => {
  const page = getPositiveInteger(req.query.page, 1, 100000);
  const limit = getPositiveInteger(req.query.limit, 9, 24);
  const offset = (page - 1) * limit;
  const sortOptions = {
    terbaru: "a.created_at DESC, a.id DESC",
    terlama: "a.created_at ASC, a.id ASC",
    terpopuler: "COALESCE(a.view_count, 0) DESC, a.created_at DESC, a.id DESC",
    az: "a.title ASC, a.id ASC",
  };
  const { values, whereClause, searchTerm } = buildPublicFilters(req.query);
  const sort = req.query.sort === "relevansi" && searchTerm.length >= 3
    ? "relevansi"
    : (typeof req.query.sort === "string" && Object.hasOwn(sortOptions, req.query.sort) ? req.query.sort : (searchTerm.length >= 3 ? "relevansi" : "terbaru"));
  const orderClause = sort === "relevansi"
    ? `(ts_rank(${PUBLIC_SEARCH_VECTOR}, plainto_tsquery('simple', $1)) * 2
        + word_similarity(lower($1), lower(${PUBLIC_SEARCH_FUZZY_TEXT}))) DESC,
       a.created_at DESC, a.id DESC`
    : sortOptions[sort];

  try {
    const paginationValues = [...values, limit, offset];
    const limitParameter = `$${paginationValues.length - 1}`;
    const offsetParameter = `$${paginationValues.length}`;
    const query = `
      ${PUBLIC_ASSET_CARD_SELECT.replace("SELECT", "SELECT COUNT(*) OVER()::int AS total_count,")}
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ${limitParameter} OFFSET ${offsetParameter}
    `;
    const { rows } = await pool.query(query, paginationValues);
    let totalItems = rows[0]?.total_count || 0;
    if (!rows.length && page > 1) {
      const countResult = await pool.query(`SELECT COUNT(*)::int AS total ${PUBLIC_ASSET_JOINS} WHERE ${whereClause}`, values);
      totalItems = countResult.rows[0]?.total || 0;
    }
    const data = rows.map(({ total_count: _totalCount, ...asset }) => asset);
    const totalPages = Math.ceil(totalItems / limit);

    res.json({
      data,
      pagination: { totalItems, totalPages, currentPage: page, limit },
    });
  } catch (error) {
    console.error("Error fetching public assets:", error);
    res.status(500).json({ error: "Gagal memuat katalog pengetahuan" });
  }
};

const getAssetById = async (req, res) => {
  const { id } = req.params;

  try {
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, id);
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    const filters = `
      WHERE ${identifierFilter}
        AND a.is_published = TRUE
        AND a.deleted_at IS NULL
        AND ${PUBLIC_WORK_UNIT_FILTER}
    `;

    let rows;
    try {
      ({ rows } = await pool.query(`${PUBLIC_ASSET_DETAIL_SELECT}${filters}`, values));
    } catch (error) {
      // A database without version history (or its read grant) still serves the page,
      // only without the reading estimate and content update date.
      if (!["42P01", "42501"].includes(error.code)) throw error;
      ({ rows } = await pool.query(`${PUBLIC_ASSET_SELECT}${filters}`, values));
    }

    if (rows.length === 0) {
      return res.status(404).json({ error: "Aset tidak ditemukan atau belum dipublikasikan" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error fetching asset by ID:", error);
    res.status(500).json({ error: "Gagal mengambil data aset" });
  }
};

const incrementAssetView = async (req, res) => {
  const { id } = req.params;

  try {
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, id);
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    const query = `
      WITH visible_asset AS (
        SELECT a.id
        FROM knowledge_assets a
        LEFT JOIN work_units w ON w.id = a.work_unit_id
        WHERE ${identifierFilter}
          AND a.is_published = TRUE
          AND a.deleted_at IS NULL
          AND ${PUBLIC_WORK_UNIT_FILTER}
      ),
      viewed_asset AS (
        UPDATE knowledge_assets
        SET view_count = COALESCE(view_count, 0) + 1
        WHERE id IN (SELECT id FROM visible_asset)
        RETURNING id, view_count
      ),
      view_event AS (
        INSERT INTO asset_views (asset_id)
        SELECT id FROM viewed_asset
        RETURNING asset_id
      )
      SELECT view_count FROM viewed_asset
    `;
    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Aset tidak ditemukan atau belum dipublikasikan" });
    }

    res.json({ view_count: rows[0].view_count });
  } catch (error) {
    console.error("Error incrementing asset view:", error);
    res.status(500).json({ error: "Gagal memperbarui jumlah tayangan" });
  }
};

const trackAssetShare = async (req, res) => {
  try {
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, req.params.id);
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    const { rows } = await pool.query(
      `SELECT a.id, a.author_id
       FROM knowledge_assets a
       LEFT JOIN work_units w ON w.id = a.work_unit_id
       WHERE ${identifierFilter}
         AND a.is_published = TRUE
         AND a.deleted_at IS NULL
         AND ${PUBLIC_WORK_UNIT_FILTER}`,
      values,
    );
    const asset = rows[0];
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan" });

    await pool.query("INSERT INTO asset_share_events (asset_id) VALUES ($1)", [asset.id]);
    if (req.user?.id) {
      await createNotification({
        recipientId: asset.author_id,
        actorId: req.user.id,
        assetId: asset.id,
        type: "share",
      });
    }
    res.status(201).json({ message: "Aktivitas bagikan tercatat" });
  } catch (error) {
    console.error("Error tracking asset share:", error);
    res.status(500).json({ error: "Gagal mencatat aktivitas bagikan" });
  }
};

const getRelatedAssets = async (req, res) => {
  const { id } = req.params;

  try {
    const identifierValues = [];
    const identifierFilter = addAssetIdentifierFilter(identifierValues, id);
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    const currentResult = await pool.query(
      `
        SELECT a.id, a.category_id
        FROM knowledge_assets a
        LEFT JOIN work_units w ON w.id = a.work_unit_id
        WHERE ${identifierFilter}
          AND a.is_published = TRUE
          AND a.deleted_at IS NULL
          AND ${PUBLIC_WORK_UNIT_FILTER}
      `,
      identifierValues,
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: "Aset tidak ditemukan atau belum dipublikasikan" });
    }

    const currentAssetId = currentResult.rows[0].id;
    const categoryId = currentResult.rows[0].category_id;
    const primaryResult = categoryId ? await pool.query(
      `${PUBLIC_ASSET_CARD_SELECT}
       WHERE a.id <> $1
         AND a.is_published = TRUE
         AND a.deleted_at IS NULL
         AND ${PUBLIC_WORK_UNIT_FILTER}
         AND a.category_id = $2
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 5`,
      [currentAssetId, categoryId],
    ) : { rows: [] };
    const selected = primaryResult.rows;
    const selectedIds = selected.map((asset) => asset.id);

    if (selected.length < 5) {
      const fallbackValues = [currentAssetId, ...selectedIds];
      const excludedIds = fallbackValues.map((_, index) => `$${index + 1}`).join(", ");
      const fallbackResult = await pool.query(
        `${PUBLIC_ASSET_CARD_SELECT}
         WHERE a.id NOT IN (${excludedIds})
            AND a.is_published = TRUE
            AND a.deleted_at IS NULL
            AND ${PUBLIC_WORK_UNIT_FILTER}
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT $${fallbackValues.length + 1}`,
        [...fallbackValues, 5 - selected.length],
      );
      selected.push(...fallbackResult.rows);
    }

    res.json(selected);
  } catch (error) {
    console.error("Error fetching related assets:", error);
    res.status(500).json({ error: "Gagal memuat pengetahuan terkait" });
  }
};

module.exports = {
  getHomepageAssets,
  getAssetById,
  incrementAssetView,
  trackAssetShare,
  getRelatedAssets,
};
