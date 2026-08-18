const pool = require("../database/db");
const { createNotification } = require("../services/notificationService");
const { recordAudit } = require("../services/auditService");
const { extractPdfText } = require("../services/mediaService");

const PUBLIC_ASSET_SELECT = `
  SELECT
    a.id,
    a.title,
    a.slug,
    a.asset_type,
    a.file_url,
    a.content,
    a.thumbnail_url,
    a.video_duration_seconds,
    a.video_chapters,
    a.is_featured,
    a.is_published,
    a.deleted_at,
    a.view_count,
    a.created_at,
    a.updated_at,
    CASE WHEN u.id IS NULL
      THEN json_build_object('id', NULL, 'full_name', 'Pegawai tidak aktif', 'department', NULL)
      ELSE json_build_object('id', u.id, 'full_name', u.full_name, 'department', u.department)
    END AS author,
    CASE WHEN c.id IS NULL THEN NULL
      ELSE json_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
    END AS category,
    CASE WHEN w.id IS NULL THEN NULL
      ELSE json_build_object('id', w.id, 'name', w.name)
    END AS work_unit
  FROM knowledge_assets a
  LEFT JOIN users u ON a.author_id = u.id AND u.deleted_at IS NULL
  LEFT JOIN categories c ON a.category_id = c.id
  LEFT JOIN work_units w ON a.work_unit_id = w.id
`;

const getPositiveInteger = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const DASHBOARD_PERIODS = new Set(["all", "7d", "30d", "90d", "year", "custom"]);
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const dateToIsoDay = (date) => date.toISOString().slice(0, 10);

const addUtcDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const parseIsoDay = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || dateToIsoDay(parsed) !== value ? null : parsed;
};

const getDashboardPeriod = (query) => {
  const period = typeof query.period === "string" && DASHBOARD_PERIODS.has(query.period) ? query.period : "all";
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  let startDate = null;
  let endDate = today;

  if (period === "7d") startDate = addUtcDays(today, -6);
  if (period === "30d") startDate = addUtcDays(today, -29);
  if (period === "90d") startDate = addUtcDays(today, -89);
  if (period === "year") startDate = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  if (period === "custom") {
    startDate = parseIsoDay(query.startDate);
    endDate = parseIsoDay(query.endDate);
    if (!startDate || !endDate) return { error: "Rentang tanggal khusus tidak valid" };
    if (startDate > endDate) return { error: "Tanggal mulai tidak boleh melebihi tanggal akhir" };
    if (endDate > today) return { error: "Tanggal akhir tidak boleh melewati hari ini" };
    if ((endDate.getTime() - startDate.getTime()) / DAY_IN_MS > 365) {
      return { error: "Rentang tanggal maksimal satu tahun" };
    }
  }

  const hasRange = Boolean(startDate);
  return {
    key: period,
    hasRange,
    startDate: hasRange ? dateToIsoDay(startDate) : null,
    endDate: hasRange ? dateToIsoDay(endDate) : null,
    endExclusive: hasRange ? dateToIsoDay(addUtcDays(endDate, 1)) : null,
  };
};

const getTrendRange = (period) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const trendStart = period.hasRange ? new Date(`${period.startDate}T00:00:00.000Z`) : addUtcDays(today, -364);
  const trendEnd = period.hasRange ? new Date(`${period.endDate}T00:00:00.000Z`) : today;
  const dayCount = Math.floor((trendEnd.getTime() - trendStart.getTime()) / DAY_IN_MS) + 1;
  if (dayCount <= 31) return { startDate: dateToIsoDay(trendStart), endExclusive: dateToIsoDay(addUtcDays(trendEnd, 1)), unit: "day", label: "Harian" };
  if (dayCount <= 90) return { startDate: dateToIsoDay(trendStart), endExclusive: dateToIsoDay(addUtcDays(trendEnd, 1)), unit: "week", label: "Mingguan" };
  return { startDate: dateToIsoDay(trendStart), endExclusive: dateToIsoDay(addUtcDays(trendEnd, 1)), unit: "month", label: "Bulanan" };
};

const buildPublicFilters = ({ q, categoryId, workUnitId }) => {
  const values = [];
  const filters = ["a.is_published = TRUE", "a.deleted_at IS NULL"];
  const searchTerm = typeof q === "string" ? q.trim() : "";

  if (searchTerm.length >= 3) {
    values.push(searchTerm);
    const parameter = `$${values.length}`;
    filters.push(`(
      to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '') || ' ' || COALESCE(a.extracted_text, ''))
        @@ websearch_to_tsquery('simple', ${parameter})
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
    filters.push(`a.work_unit_id = $${values.length}`);
  }

  return { values, whereClause: filters.join(" AND "), searchTerm };
};

const ASSET_TYPES = new Set(["document", "video"]);
const fileExtension = (value = "") => value.split(".").pop()?.toLowerCase() || "";
const fileKind = (file, fileName = "") => {
  const mimeType = file?.mimetype || "";
  const extension = fileExtension(file?.originalname || fileName);
  if (mimeType === "application/pdf" || extension === "pdf") return "document";
  if (["video/mp4", "video/webm", "video/ogg"].includes(mimeType) || ["mp4", "webm", "ogg"].includes(extension)) return "video";
  return null;
};

const validateAssetMedia = (assetType, file, existingFileName = "") => {
  const normalizedType = ASSET_TYPES.has(assetType) ? assetType : "document";
  const kind = fileKind(file, existingFileName);
  if (kind && kind !== normalizedType) {
    return normalizedType === "video"
      ? "Aset video hanya dapat menggunakan file MP4, WebM, atau OGG"
      : "Aset dokumen hanya dapat menggunakan file PDF";
  }
  return null;
};

const buildAssetQuality = (asset) => {
  const checks = [
    { key: "title", label: "Judul aset", complete: Boolean(asset.title?.trim()) },
    { key: "content", label: "Isi pengetahuan", complete: Boolean(asset.content?.trim()) },
    { key: "category", label: "Kategori", complete: Boolean(asset.category_id || asset.category?.id) },
    { key: "workUnit", label: "Unit kerja", complete: Boolean(asset.work_unit_id || asset.work_unit?.id) },
    { key: "thumbnail", label: "Thumbnail", complete: Boolean(asset.thumbnail_url) },
    { key: "file", label: "File utama", complete: Boolean(asset.file_url) },
  ];
  const completed = checks.filter((check) => check.complete).length;
  return {
    completed,
    total: checks.length,
    status: completed === checks.length ? "complete" : "needs_attention",
    checks,
  };
};

const slugify = (value) => value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)+/g, "") || "draft";

const getAvailableSlug = async (value, excludedId = null) => {
  const baseSlug = slugify(value).slice(0, 240);
  let sequence = 1;

  while (sequence <= 1000) {
    const suffix = sequence === 1 ? "" : `-${sequence}`;
    const candidate = `${baseSlug.slice(0, 255 - suffix.length)}${suffix}`;
    const { rows } = await pool.query(
      `SELECT 1 FROM knowledge_assets
       WHERE slug = $1 AND deleted_at IS NULL
         AND ($2::integer IS NULL OR id <> $2)
       LIMIT 1`,
      [candidate, excludedId],
    );
    if (!rows[0]) return candidate;
    sequence += 1;
  }

  throw new Error("Tidak dapat membuat slug aset yang unik");
};

const getRequestedAuthorId = (req, source = req.query.authorId) => {
  const requested = Number.parseInt(source, 10);
  const hasRequestedAuthor = Number.isInteger(requested) && requested > 0;
  if (req.user.role === "pegawai") {
    if (hasRequestedAuthor && requested !== req.user.id) return { error: "Anda hanya dapat mengakses aset sendiri" };
    return { authorId: req.user.id };
  }
  return { authorId: hasRequestedAuthor ? requested : null };
};

const resolveAssetAuthorId = async (req, source = req.body.authorId) => {
  if (req.user.role === "pegawai") return req.user.id;
  const parsed = Number.parseInt(source, 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("Admin wajib memilih pegawai sebagai kontributor aset");
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE id = $1 AND role = 'pegawai' AND deleted_at IS NULL",
    [parsed],
  );
  if (!rows[0]) throw new Error("Pegawai kontributor tidak ditemukan atau sudah tidak aktif");
  return parsed;
};

const auditActor = (req) => ({
  actorId: req.user.id || null,
  actorLabel: req.user.role === "admin" ? req.user.full_name : null,
  actorRole: req.user.role,
});

const getUploadedFiles = (req) => ({
  thumbnail: req.files?.thumbnail?.[0]?.filename || null,
  file: req.files?.file?.[0] || null,
});

const normalizeVideoMetadata = (body, assetType, current = {}) => {
  if (assetType !== "video") {
    return { duration: null, chapters: [] };
  }

  const durationInput = body.video_duration_seconds;
  let duration = durationInput === undefined ? current.video_duration_seconds ?? null : null;
  if (durationInput !== undefined && durationInput !== "") {
    const parsed = Number.parseInt(durationInput, 10);
    if (!Number.isInteger(parsed) || parsed < 0) throw new Error("Durasi video harus berupa angka detik yang valid");
    duration = parsed;
  }

  const chaptersInput = body.video_chapters;
  let chapters = chaptersInput === undefined ? (current.video_chapters || []) : [];
  if (chaptersInput !== undefined && chaptersInput !== "") {
    try {
      chapters = typeof chaptersInput === "string" ? JSON.parse(chaptersInput) : chaptersInput;
    } catch {
      throw new Error("Data bab video tidak valid");
    }
  }
  if (!Array.isArray(chapters)) throw new Error("Data bab video harus berupa daftar");
  const normalizedChapters = chapters.map((chapter) => {
    const time = Number.parseInt(chapter?.time, 10);
    const title = typeof chapter?.title === "string" ? chapter.title.trim().slice(0, 120) : "";
    if (!Number.isInteger(time) || time < 0 || !title) throw new Error("Setiap bab video memerlukan judul dan waktu yang valid");
    return { time, title };
  }).sort((left, right) => left.time - right.time);
  const chapterPastDuration = duration === null
    ? null
    : normalizedChapters.find((chapter) => chapter.time > duration);
  if (chapterPastDuration) {
    throw new Error(`Bab “${chapterPastDuration.title}” pada ${chapterPastDuration.time} detik melebihi durasi video ${duration} detik. Gunakan durasi total video atau sesuaikan timestamp.`);
  }
  if (new Set(normalizedChapters.map((chapter) => chapter.time)).size !== normalizedChapters.length) {
    throw new Error("Waktu setiap bab video harus berbeda");
  }
  return { duration, chapters: normalizedChapters };
};

const getExtractedText = async (assetType, uploadedFile, current = {}) => {
  if (assetType !== "document") return "";
  if (uploadedFile?.filename) return extractPdfText(uploadedFile.filename);
  return current.extracted_text || "";
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
    az: "a.title ASC, a.id ASC",
  };
  const { values, whereClause, searchTerm } = buildPublicFilters(req.query);
  const sort = req.query.sort === "relevansi" && searchTerm.length >= 3
    ? "relevansi"
    : (sortOptions[req.query.sort] ? req.query.sort : (searchTerm.length >= 3 ? "relevansi" : "terbaru"));
  const orderClause = sort === "relevansi"
    ? `ts_rank(to_tsvector('simple', COALESCE(a.title, '') || ' ' || COALESCE(a.content, '') || ' ' || COALESCE(a.extracted_text, '')), websearch_to_tsquery('simple', $1)) DESC, a.created_at DESC, a.id DESC`
    : sortOptions[sort];

  try {
    const countQuery = `SELECT COUNT(*) FROM knowledge_assets a WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const totalItems = Number.parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalItems / limit);

    const paginationValues = [...values, limit, offset];
    const limitParameter = `$${paginationValues.length - 1}`;
    const offsetParameter = `$${paginationValues.length}`;
    const query = `
      ${PUBLIC_ASSET_SELECT}
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ${limitParameter} OFFSET ${offsetParameter}
    `;
    const { rows } = await pool.query(query, paginationValues);

    res.json({
      data: rows,
      pagination: { totalItems, totalPages, currentPage: page, limit },
    });
  } catch (error) {
    console.error("Error fetching public assets:", error);
    res.status(500).json({ error: "Gagal memuat katalog pengetahuan" });
  }
};

const getFeaturedAssets = async (_req, res) => {
  try {
    const query = `
      ${PUBLIC_ASSET_SELECT}
      WHERE a.is_published = TRUE
        AND a.is_featured = TRUE
        AND a.deleted_at IS NULL
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 3
    `;
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching featured assets:", error);
    res.status(500).json({ error: "Gagal memuat aset sorotan" });
  }
};

const getAdminAssets = async (req, res) => {
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  try {
    const values = [];
    const authorFilter = scope.authorId ? ` AND a.author_id = $${values.push(scope.authorId)}` : "";
    const { rows } = await pool.query(`
      SELECT a.id, a.title, a.asset_type, a.is_published, a.created_at, a.updated_at,
             a.content, a.thumbnail_url, a.file_url, a.category_id, a.work_unit_id,
             c.name AS category_name, w.name AS work_unit_name,
             a.author_id, COALESCE(u.full_name, 'Pegawai tidak aktif') AS author_name
      FROM knowledge_assets a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN work_units w ON a.work_unit_id = w.id
      LEFT JOIN users u ON a.author_id = u.id AND u.deleted_at IS NULL
      WHERE a.deleted_at IS NULL${authorFilter}
      ORDER BY a.updated_at DESC, a.id DESC
    `, values);
    res.json(rows.map((asset) => ({ ...asset, quality: buildAssetQuality(asset) })));
  } catch (error) {
    console.error("Error fetching admin assets:", error);
    res.status(500).json({ error: "Gagal mengambil data aset backoffice" });
  }
};

const getDeletedAssets = async (req, res) => {
  const page = getPositiveInteger(req.query.page, 1, 100000);
  const limit = getPositiveInteger(req.query.limit, 10, 50);
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const values = [];
  const filters = ["a.deleted_at IS NOT NULL"];

  if (q) {
    values.push(`%${q}%`);
    const parameter = `$${values.length}`;
    filters.push(`(
      a.title ILIKE ${parameter}
      OR COALESCE(u.full_name, '') ILIKE ${parameter}
      OR COALESCE(c.name, '') ILIKE ${parameter}
      OR COALESCE(w.name, '') ILIKE ${parameter}
    )`);
  }

  try {
    const joins = `
      FROM knowledge_assets a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE ${filters.join(" AND ")}
    `;
    const countResult = await pool.query(`SELECT COUNT(*)::integer AS total ${joins}`, values);
    const totalItems = countResult.rows[0]?.total || 0;
    const dataValues = [...values, limit, (page - 1) * limit];
    const limitParameter = `$${dataValues.length - 1}`;
    const offsetParameter = `$${dataValues.length}`;
    const { rows } = await pool.query(
      `SELECT
         a.id, a.title, a.slug, a.asset_type, a.is_published,
         a.thumbnail_url, a.file_url, a.created_at, a.updated_at, a.deleted_at,
         a.author_id,
         CASE
           WHEN u.id IS NULL OR u.deleted_at IS NOT NULL THEN 'Pegawai tidak aktif'
           ELSE u.full_name
         END AS author_name,
         c.name AS category_name,
         w.name AS work_unit_name
       ${joins}
       ORDER BY a.deleted_at DESC, a.id DESC
       LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
      dataValues,
    );

    return res.json({
      data: rows,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: totalItems > 0 ? Math.ceil(totalItems / limit) : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching deleted assets:", error);
    return res.status(500).json({ error: "Gagal memuat aset yang telah dihapus" });
  }
};

const restoreAsset = async (req, res) => {
  const assetId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(assetId) || assetId < 1) return res.status(400).json({ error: "ID aset tidak valid" });

  try {
    const currentResult = await pool.query(
      "SELECT id, title, slug, is_published FROM knowledge_assets WHERE id = $1 AND deleted_at IS NOT NULL",
      [assetId],
    );
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ error: "Aset terhapus tidak ditemukan atau sudah dipulihkan" });

    const conflictResult = await pool.query(
      `SELECT id FROM knowledge_assets
       WHERE deleted_at IS NULL AND id <> $1
         AND (LOWER(title) = LOWER($2) OR slug = $3)
       LIMIT 1`,
      [assetId, current.title, current.slug],
    );
    if (conflictResult.rows[0]) {
      return res.status(409).json({ error: "Aset belum dapat dipulihkan karena judul atau alamatnya sudah digunakan aset aktif lain" });
    }

    const { rows } = await pool.query(
      `UPDATE knowledge_assets
       SET deleted_at = NULL,
           is_published = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING id, title, asset_type, is_published, author_id, updated_at`,
      [assetId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Aset terhapus tidak ditemukan atau sudah dipulihkan" });

    await recordAudit({
      ...auditActor(req),
      action: "asset.restored",
      targetType: "asset",
      targetId: assetId,
      metadata: { previousPublishedStatus: current.is_published, restoredAsDraft: true },
    });
    return res.json({ message: "Aset berhasil dipulihkan sebagai draf", asset: rows[0] });
  } catch (error) {
    console.error("Error restoring asset:", error);
    if (error.code === "23505") return res.status(409).json({ error: "Aset belum dapat dipulihkan karena judul atau alamatnya sudah digunakan" });
    return res.status(500).json({ error: "Gagal memulihkan aset" });
  }
};

const getAdminDashboard = async (req, res) => {
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  const period = getDashboardPeriod(req.query);
  if (period.error) return res.status(400).json({ error: period.error });
  const trend = getTrendRange(period);

  try {
    const scopedValues = period.hasRange ? [period.startDate, period.endExclusive] : [];
    const assetRangeFilter = period.hasRange ? " AND a.created_at >= $1::date AND a.created_at < $2::date" : "";
    const viewRangeFilter = period.hasRange ? " AND v.created_at >= $1::date AND v.created_at < $2::date" : "";
    const assetScope = scope.authorId ? ` AND a.author_id = $${scopedValues.push(scope.authorId)}` : "";
    const viewScope = scope.authorId ? ` AND a.author_id = $${scopedValues.length}` : "";
    const organizationQuery = period.hasRange ? `
      SELECT
        COUNT(*) FILTER (WHERE a.is_published = TRUE)::int AS published_asset_count,
        COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type <> 'video')::int AS document_count,
        COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type = 'video')::int AS video_count,
        (SELECT COUNT(v.id)::int FROM asset_views v INNER JOIN knowledge_assets av ON av.id = v.asset_id
         WHERE av.is_published = TRUE AND av.deleted_at IS NULL${scope.authorId ? ` AND av.author_id = $${scopedValues.length}` : ""}${viewRangeFilter.replaceAll("a.", "v.")}) AS total_view_count
      FROM knowledge_assets a
      WHERE a.deleted_at IS NULL${assetRangeFilter}${assetScope}
    ` : `
      SELECT COUNT(*) FILTER (WHERE a.is_published = TRUE)::int AS published_asset_count,
             COALESCE(SUM(a.view_count) FILTER (WHERE a.is_published = TRUE), 0)::int AS total_view_count,
             COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type <> 'video')::int AS document_count,
             COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type = 'video')::int AS video_count
      FROM knowledge_assets a
      WHERE a.deleted_at IS NULL${assetScope}
    `;
    const topAssetsQuery = period.hasRange ? `
      SELECT a.id, a.title, a.asset_type, COUNT(v.id)::int AS view_count, a.created_at,
             c.name AS category_name, w.name AS work_unit_name
      FROM asset_views v INNER JOIN knowledge_assets a ON a.id = v.asset_id
      LEFT JOIN categories c ON a.category_id = c.id LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE a.is_published = TRUE AND a.deleted_at IS NULL${viewRangeFilter}${viewScope}
      GROUP BY a.id, c.name, w.name ORDER BY COUNT(v.id) DESC, a.created_at DESC, a.id DESC LIMIT 5
    ` : `
      SELECT a.id, a.title, a.asset_type, COALESCE(a.view_count, 0)::int AS view_count, a.created_at,
             c.name AS category_name, w.name AS work_unit_name
      FROM knowledge_assets a LEFT JOIN categories c ON a.category_id = c.id LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE a.is_published = TRUE AND a.deleted_at IS NULL${assetScope}
      ORDER BY COALESCE(a.view_count, 0) DESC, a.created_at DESC, a.id DESC LIMIT 5
    `;
    const shareRangeFilter = period.hasRange ? " AND s.created_at >= $1::date AND s.created_at < $2::date" : "";
    const topSharedQuery = `
      SELECT a.id, a.title, a.asset_type, COUNT(s.id)::int AS share_count, a.created_at
      FROM asset_share_events s INNER JOIN knowledge_assets a ON a.id = s.asset_id
      WHERE a.is_published = TRUE AND a.deleted_at IS NULL${shareRangeFilter}${scope.authorId ? ` AND a.author_id = $${scopedValues.length}` : ""}
      GROUP BY a.id ORDER BY COUNT(s.id) DESC, a.created_at DESC, a.id DESC LIMIT 5`;
    const searchFilter = period.hasRange ? "WHERE e.created_at >= $1::date AND e.created_at < $2::date" : "";
    const labelFormat = trend.unit === "month" ? "Mon YY" : "DD Mon";
    const trendAuthorFilter = scope.authorId ? " AND a.author_id = $3" : "";
    const trendQuery = `
      WITH buckets AS (SELECT generate_series(date_trunc('${trend.unit}', $1::date), date_trunc('${trend.unit}', ($2::date - INTERVAL '1 day')), INTERVAL '1 ${trend.unit}') AS bucket_start)
      SELECT TO_CHAR(b.bucket_start, 'YYYY-MM-DD') AS bucket, TO_CHAR(b.bucket_start, '${labelFormat}') AS label, COUNT(a.id)::int AS asset_count
      FROM buckets b LEFT JOIN knowledge_assets a ON a.created_at >= b.bucket_start AND a.created_at < b.bucket_start + INTERVAL '1 ${trend.unit}'
        AND a.is_published = TRUE AND a.deleted_at IS NULL AND a.created_at >= $1::date AND a.created_at < $2::date${trendAuthorFilter}
      GROUP BY b.bucket_start ORDER BY b.bucket_start ASC`;
    const personalAuthorId = scope.authorId || (req.user.role === "pegawai" ? req.user.id : null);
    const personalPromise = personalAuthorId ? pool.query(`
      SELECT COUNT(*)::int AS asset_count, COUNT(*) FILTER (WHERE is_published)::int AS published_asset_count,
        COUNT(*) FILTER (WHERE NOT is_published)::int AS draft_count, COALESCE(SUM(view_count), 0)::int AS total_view_count
      FROM knowledge_assets WHERE author_id = $1 AND deleted_at IS NULL`, [personalAuthorId]) : Promise.resolve({ rows: [{ asset_count: 0, published_asset_count: 0, draft_count: 0, total_view_count: 0 }] });
    const recentPromise = personalAuthorId ? pool.query(`
      SELECT a.id, a.title, a.asset_type, a.is_published, COALESCE(a.view_count, 0)::int AS view_count, a.created_at, c.name AS category_name
      FROM knowledge_assets a LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.author_id = $1 AND a.deleted_at IS NULL ORDER BY a.created_at DESC, a.id DESC LIMIT 5`, [personalAuthorId]) : Promise.resolve({ rows: [] });
    const [organizationResult, trendResult, topAssetsResult, topSharedResult, searchInsightsResult, popularSearchesResult, personalResult, recentAssetsResult] = await Promise.all([
      pool.query(organizationQuery, scopedValues),
      pool.query(trendQuery, scope.authorId ? [trend.startDate, trend.endExclusive, scope.authorId] : [trend.startDate, trend.endExclusive]),
      pool.query(topAssetsQuery, scopedValues), pool.query(topSharedQuery, scopedValues),
      pool.query(`SELECT COUNT(*)::int AS total_searches, COUNT(*) FILTER (WHERE result_count = 0)::int AS zero_result_searches FROM search_events e ${searchFilter}`, period.hasRange ? [period.startDate, period.endExclusive] : []),
      pool.query(`SELECT e.query, COUNT(*)::int AS search_count, COUNT(*) FILTER (WHERE e.result_count = 0)::int AS zero_result_count FROM search_events e ${searchFilter} GROUP BY e.query ORDER BY COUNT(*) DESC, MAX(e.created_at) DESC LIMIT 5`, period.hasRange ? [period.startDate, period.endExclusive] : []),
      personalPromise, recentPromise,
    ]);
    res.json({
      organization: organizationResult.rows[0], publicationTrend: trendResult.rows, topAssets: topAssetsResult.rows,
      discovery: { ...searchInsightsResult.rows[0], topShared: topSharedResult.rows, popularSearches: popularSearchesResult.rows },
      rankings: {
        search: popularSearchesResult.rows.map((row) => ({ ...row, metric_value: row.search_count })),
        view: topAssetsResult.rows.map((row) => ({ ...row, metric_value: row.view_count })),
        share: topSharedResult.rows.map((row) => ({ ...row, metric_value: row.share_count })),
      },
      period: { key: period.key, startDate: period.startDate, endDate: period.endDate, trendGranularity: trend.label, viewMetric: period.hasRange ? "period" : "all_time" },
      selectedAuthorId: personalAuthorId,
      personal: { ...personalResult.rows[0], recentAssets: recentAssetsResult.rows },
    });
  } catch (error) {
    console.error("Error fetching admin dashboard:", error);
    res.status(500).json({ error: "Gagal memuat ringkasan dashboard" });
  }
};

const getAdminDashboardRanking = async (req, res) => {
  const metric = typeof req.query.metric === "string" ? req.query.metric : "";
  if (!new Set(["search", "view", "share"]).has(metric)) {
    return res.status(400).json({ error: "Metric ranking harus search, view, atau share" });
  }

  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  const period = getDashboardPeriod(req.query);
  if (period.error) return res.status(400).json({ error: period.error });

  const pageValue = Number.parseInt(req.query.page, 10);
  const limitValue = Number.parseInt(req.query.limit, 10);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 50) : 10;
  const offset = (page - 1) * limit;
  const query = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 160) : "";
  const values = [];
  const addValue = (value) => {
    values.push(value);
    return `$${values.length}`;
  };
  const rangeFilter = (alias, column = "created_at") => period.hasRange
    ? ` AND ${alias}.${column} >= ${addValue(period.startDate)}::date AND ${alias}.${column} < ${addValue(period.endExclusive)}::date`
    : "";

  let baseSql;
  if (metric === "search") {
    const filters = ["1 = 1"];
    if (period.hasRange) {
      filters.push(`e.created_at >= ${addValue(period.startDate)}::date`);
      filters.push(`e.created_at < ${addValue(period.endExclusive)}::date`);
    }
    if (query) filters.push(`e.query ILIKE ${addValue(`%${query}%`)}`);
    baseSql = `
      SELECT e.query AS label, e.query AS sort_label, COUNT(*)::int AS metric_value, MAX(e.created_at) AS last_event_at
      FROM search_events e
      WHERE ${filters.join(" AND ")}
      GROUP BY e.query`;
  } else {
    const eventAlias = metric === "view" ? "v" : "s";
    const eventTable = metric === "view" ? "asset_views" : "asset_share_events";
    const eventFilter = period.hasRange ? rangeFilter(eventAlias) : "";
    const assetFilters = ["a.is_published = TRUE", "a.deleted_at IS NULL"];
    if (scope.authorId) assetFilters.push(`a.author_id = ${addValue(scope.authorId)}`);
    if (query) assetFilters.push(`a.title ILIKE ${addValue(`%${query}%`)}`);

    if (metric === "view" && !period.hasRange) {
      baseSql = `
        SELECT a.id, a.title, a.asset_type, a.thumbnail_url,
               COALESCE(u.full_name, 'Pegawai tidak aktif') AS author_name,
               c.name AS category_name, COALESCE(a.view_count, 0)::int AS metric_value,
               a.title AS sort_label
        FROM knowledge_assets a
        LEFT JOIN users u ON u.id = a.author_id AND u.deleted_at IS NULL
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE ${assetFilters.join(" AND ")}`;
    } else {
      baseSql = `
        SELECT a.id, a.title, a.asset_type, a.thumbnail_url,
               COALESCE(u.full_name, 'Pegawai tidak aktif') AS author_name,
               c.name AS category_name, COUNT(${eventAlias}.id)::int AS metric_value,
               a.title AS sort_label
        FROM ${eventTable} ${eventAlias}
        INNER JOIN knowledge_assets a ON a.id = ${eventAlias}.asset_id
        LEFT JOIN users u ON u.id = a.author_id AND u.deleted_at IS NULL
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE ${assetFilters.join(" AND ")}${eventFilter}
        GROUP BY a.id, u.full_name, c.name`;
    }
  }

  try {
    const countResult = await pool.query(`SELECT COUNT(*)::int AS count FROM (${baseSql}) ranked`, values);
    const listValues = [...values, limit, offset];
    const listResult = await pool.query(
      `WITH ranked AS (${baseSql})
       SELECT ranked.*, ROW_NUMBER() OVER (ORDER BY metric_value DESC, sort_label ASC) AS rank
       FROM ranked
       ORDER BY metric_value DESC, sort_label ASC
       LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );
    const totalItems = countResult.rows[0].count;
    return res.json({
      metric,
      data: listResult.rows,
      pagination: { currentPage: page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
      period: { key: period.key, startDate: period.startDate, endDate: period.endDate },
    });
  } catch (error) {
    console.error("Error fetching dashboard ranking:", error);
    return res.status(500).json({ error: "Gagal memuat ranking dashboard" });
  }
};

const getAssetById = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `
      ${PUBLIC_ASSET_SELECT}
      WHERE a.id = $1
        AND a.is_published = TRUE
        AND a.deleted_at IS NULL
    `;

    const { rows } = await pool.query(query, [id]);

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
    const query = `
      WITH viewed_asset AS (
        UPDATE knowledge_assets
        SET view_count = COALESCE(view_count, 0) + 1
        WHERE id = $1
          AND is_published = TRUE
          AND deleted_at IS NULL
        RETURNING id, view_count
      ),
      view_event AS (
        INSERT INTO asset_views (asset_id)
        SELECT id FROM viewed_asset
        RETURNING asset_id
      )
      SELECT view_count FROM viewed_asset
    `;
    const { rows } = await pool.query(query, [id]);

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
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "ID aset tidak valid" });

  try {
    const { rows } = await pool.query(
      `SELECT id, author_id
       FROM knowledge_assets
       WHERE id = $1 AND is_published = TRUE AND deleted_at IS NULL`,
      [id],
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
    const currentResult = await pool.query(
      `
        SELECT category_id
        FROM knowledge_assets
        WHERE id = $1 AND is_published = TRUE AND deleted_at IS NULL
      `,
      [id],
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: "Aset tidak ditemukan atau belum dipublikasikan" });
    }

    const categoryId = currentResult.rows[0].category_id;
    const primaryResult = categoryId ? await pool.query(
      `${PUBLIC_ASSET_SELECT}
       WHERE a.id <> $1
         AND a.is_published = TRUE
         AND a.deleted_at IS NULL
         AND a.category_id = $2
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT 5`,
      [id, categoryId],
    ) : { rows: [] };
    const selected = primaryResult.rows;
    const selectedIds = selected.map((asset) => asset.id);

    if (selected.length < 5) {
      const fallbackValues = [id, ...selectedIds];
      const excludedIds = fallbackValues.map((_, index) => `$${index + 1}`).join(", ");
      const fallbackResult = await pool.query(
        `${PUBLIC_ASSET_SELECT}
         WHERE a.id NOT IN (${excludedIds})
           AND a.is_published = TRUE
           AND a.deleted_at IS NULL
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

const getAdminAssetById = async (req, res) => {
  const { id } = req.params;
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });

  try {
    const query = `
      SELECT a.*, c.name AS category_name, w.name AS work_unit_name
      FROM knowledge_assets a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE a.id = $1 AND a.deleted_at IS NULL${scope.authorId ? " AND a.author_id = $2" : ""}
    `;
    const { rows } = await pool.query(query, scope.authorId ? [id, scope.authorId] : [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Aset tidak ditemukan" });
    }

    res.json({ ...rows[0], quality: buildAssetQuality(rows[0]) });
  } catch (error) {
    console.error("Error fetching admin asset:", error);
    res.status(500).json({ error: "Gagal mengambil data aset" });
  }
};

const getAdminAssetDetail = async (req, res) => {
  const { id } = req.params;
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  const includeDeleted = req.user?.role === "admin" && req.query.includeDeleted === "true";
  try {
    const { rows } = await pool.query(
      `${PUBLIC_ASSET_SELECT}
       WHERE a.id = $1 AND a.deleted_at ${includeDeleted ? "IS NOT NULL" : "IS NULL"}${scope.authorId ? " AND a.author_id = $2" : ""}`,
      scope.authorId ? [id, scope.authorId] : [id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Aset tidak ditemukan" });
    const asset = rows[0];
    res.json({ ...asset, quality: buildAssetQuality(asset) });
  } catch (error) {
    console.error("Error fetching admin asset detail:", error);
    res.status(500).json({ error: "Gagal memuat detail aset" });
  }
};

const createDraft = async (req, res) => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const assetType = ASSET_TYPES.has(req.body.asset_type) ? req.body.asset_type : "document";
  if (!title) return res.status(400).json({ error: "Judul diperlukan sebelum draf dapat disimpan otomatis" });

  const uploaded = getUploadedFiles(req);
  const mediaError = validateAssetMedia(assetType, uploaded.file);
  if (mediaError) return res.status(400).json({ error: mediaError });

  try {
    const video = normalizeVideoMetadata(req.body, assetType);
    const extractedText = await getExtractedText(assetType, uploaded.file);
    const { rows } = await pool.query(
      `INSERT INTO knowledge_assets
       (title, slug, asset_type, file_url, content, thumbnail_url, extracted_text, video_duration_seconds, video_chapters, is_published, author_id, category_id, work_unit_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, FALSE, $10, $11, $12)
       RETURNING *`,
      [
        title,
        `${slugify(title)}-draft-${Date.now()}`,
        assetType,
        uploaded.file?.filename || null,
        typeof req.body.content === "string" ? req.body.content : null,
        uploaded.thumbnail,
        extractedText,
        video.duration,
        JSON.stringify(video.chapters),
        await resolveAssetAuthorId(req),
        req.body.category_id ? Number(req.body.category_id) : null,
        req.body.work_unit_id ? Number(req.body.work_unit_id) : null,
      ],
    );
    await recordAudit({ ...auditActor(req), action: "asset.draft_created", targetType: "asset", targetId: rows[0].id, metadata: { assetType } });
    res.status(201).json({ ...rows[0], quality: buildAssetQuality(rows[0]) });
  } catch (error) {
    console.error("Error creating draft:", error);
    if (error.code === "23505") return res.status(409).json({ error: "Judul draf sudah digunakan. Ubah judul lalu coba kembali." });
    res.status(500).json({ error: "Gagal menyimpan draf otomatis" });
  }
};

const updateDraft = async (req, res) => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const assetType = ASSET_TYPES.has(req.body.asset_type) ? req.body.asset_type : "document";
  if (!title) return res.status(400).json({ error: "Judul draf wajib diisi" });

  try {
    const draftScope = getRequestedAuthorId(req, req.body.authorId);
    if (draftScope.error) return res.status(403).json({ error: draftScope.error });
    const currentResult = await pool.query(
      `SELECT * FROM knowledge_assets WHERE id = $1 AND is_published = FALSE AND deleted_at IS NULL${draftScope.authorId ? " AND author_id = $2" : ""}`,
      draftScope.authorId ? [req.params.id, draftScope.authorId] : [req.params.id],
    );
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ error: "Draf tidak ditemukan atau sudah diterbitkan" });

    const uploaded = getUploadedFiles(req);
    const mediaError = validateAssetMedia(assetType, uploaded.file, uploaded.file ? "" : current.file_url);
    if (mediaError) return res.status(400).json({ error: mediaError });
    const video = normalizeVideoMetadata(req.body, assetType, current);
    const extractedText = await getExtractedText(assetType, uploaded.file, current);
    const { rows } = await pool.query(
      `UPDATE knowledge_assets SET
         title = $1, asset_type = $2, content = $3,
         category_id = $4, work_unit_id = $5,
         thumbnail_url = COALESCE($6, thumbnail_url), file_url = COALESCE($7, file_url),
         extracted_text = $8, video_duration_seconds = $9, video_chapters = $10::jsonb,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND is_published = FALSE AND deleted_at IS NULL
       RETURNING *`,
      [
        title,
        assetType,
        typeof req.body.content === "string" ? req.body.content : null,
        req.body.category_id ? Number(req.body.category_id) : null,
        req.body.work_unit_id ? Number(req.body.work_unit_id) : null,
        uploaded.thumbnail,
        uploaded.file?.filename || null,
        extractedText,
        video.duration,
        JSON.stringify(video.chapters),
        current.id,
      ],
    );
    await recordAudit({ ...auditActor(req), action: "asset.draft_updated", targetType: "asset", targetId: current.id, metadata: { assetType } });
    res.json({ ...rows[0], quality: buildAssetQuality(rows[0]) });
  } catch (error) {
    console.error("Error updating draft:", error);
    if (error.code === "23505") return res.status(409).json({ error: "Judul draf sudah digunakan. Ubah judul lalu coba kembali." });
    res.status(500).json({ error: "Gagal menyimpan draf otomatis" });
  }
};

const createAsset = async (req, res) => {
  const {
    title,
    slug,
    asset_type,
    content,
    is_published,
    category_id,
    work_unit_id,
  } = req.body;
  const assetType = ASSET_TYPES.has(asset_type) ? asset_type : "document";

  try {
    const uploaded = getUploadedFiles(req);
    const mediaError = validateAssetMedia(assetType, uploaded.file);
    if (mediaError) return res.status(400).json({ error: mediaError });
    const video = normalizeVideoMetadata(req.body, assetType);
    const extractedText = await getExtractedText(assetType, uploaded.file);
    const uniqueSlug = await getAvailableSlug(slug || title);
    const authorId = await resolveAssetAuthorId(req);

    const query = `
      INSERT INTO knowledge_assets 
        (title, slug, asset_type, file_url, content, thumbnail_url, extracted_text, video_duration_seconds, video_chapters, is_published, author_id, category_id, work_unit_id)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
      RETURNING *;
    `;

    const values = [
      title,
      uniqueSlug,
      assetType,
      uploaded.file?.filename || null,
      content,
      uploaded.thumbnail,
      extractedText,
      video.duration,
      JSON.stringify(video.chapters),
      is_published === "true",
      authorId,
      category_id ? Number(category_id) : null,
      work_unit_id ? Number(work_unit_id) : null,
    ];

    const { rows } = await pool.query(query, values);
    await recordAudit({ ...auditActor(req), action: is_published === "true" ? "asset.created_published" : "asset.created_draft", targetType: "asset", targetId: rows[0].id, metadata: { assetType, authorId } });
    res.status(201).json({ ...rows[0], quality: buildAssetQuality(rows[0]) });
  } catch (error) {
    console.error("Error detail:", error.message || error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "Judul atau alamat aset sudah digunakan. Gunakan judul lain." });
    }
    res
      .status(500)
      .json({ error: "Gagal menyimpan aset", detail: error.message });
  }
};

const updateAsset = async (req, res) => {
  const { id } = req.params;

  const {
    title,
    slug,
    asset_type,
    content,
    category_id,
    work_unit_id,
    is_published,
  } = req.body;

  try {
    // 1. Cek ketersediaan dan kepemilikan aset
    const scope = getRequestedAuthorId(req, req.body.authorId);
    if (scope.error) return res.status(403).json({ error: scope.error });
    const { rows: currentRows } = await pool.query(
      `SELECT * FROM knowledge_assets WHERE id = $1 AND deleted_at IS NULL${scope.authorId ? " AND author_id = $2" : ""}`,
      scope.authorId ? [id, scope.authorId] : [id],
    );
    const current = currentRows[0];

    if (!current) {
      return res.status(403).json({
        error:
          "Aset tidak ditemukan atau Anda tidak memiliki izin untuk mengeditnya.",
      });
    }

    // 2. Tangkap path file baru (jika user mengunggahnya)
    const normalizedAssetType = ASSET_TYPES.has(asset_type) ? asset_type : "document";
    const uploaded = getUploadedFiles(req);
    const mediaError = validateAssetMedia(normalizedAssetType, uploaded.file, uploaded.file ? "" : current.file_url);
    if (mediaError) return res.status(400).json({ error: mediaError });
    const video = normalizeVideoMetadata(req.body, normalizedAssetType, current);
    const extractedText = await getExtractedText(normalizedAssetType, uploaded.file, current);
    const uniqueSlug = await getAvailableSlug(slug || title, Number(id));

    // 3. Eksekusi Update menggunakan COALESCE
    // COALESCE akan menyimpan nilai baru jika ada, atau mempertahankan data lama di database jika file baru = null
    const updateQuery = `
      UPDATE knowledge_assets
      SET 
        title = $1,
        slug = $2,
        asset_type = $3,
        content = $4,
        category_id = $5,
        work_unit_id = $6,
        is_published = $7,
        thumbnail_url = COALESCE($8, thumbnail_url), -- Nama disesuaikan
        file_url = COALESCE($9, file_url),          -- Nama disesuaikan
        extracted_text = $10,
        video_duration_seconds = $11,
        video_chapters = $12::jsonb,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $13
      RETURNING *;
    `;

    const values = [
      title,
      uniqueSlug,
      normalizedAssetType,
      content,
      category_id ? parseInt(category_id) : null,
      work_unit_id ? parseInt(work_unit_id) : null,
      is_published === "true",
      uploaded.thumbnail,
      uploaded.file?.filename || null,
      extractedText,
      video.duration,
      JSON.stringify(video.chapters),
      id,
    ];

    const { rows } = await pool.query(updateQuery, values);
    await recordAudit({ ...auditActor(req), action: is_published === "true" ? "asset.updated_published" : "asset.updated_draft", targetType: "asset", targetId: rows[0].id, metadata: { assetType: normalizedAssetType, authorId: current.author_id } });

    res.json({
      message: "Aset berhasil diperbarui",
      asset: { ...rows[0], quality: buildAssetQuality(rows[0]) },
    });
  } catch (error) {
    console.error("Error updating asset:", error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "Judul atau alamat aset sudah digunakan. Gunakan judul lain." });
    }
    res.status(500).json({ error: "Gagal memperbarui aset" });
  }
};

const deleteAsset = async (req, res) => {
  const { id } = req.params;
  try {
    const scope = getRequestedAuthorId(req);
    if (scope.error) return res.status(403).json({ error: scope.error });
    const query = `UPDATE knowledge_assets SET deleted_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND deleted_at IS NULL${scope.authorId ? " AND author_id = $2" : ""} RETURNING id`;
    const { rows } = await pool.query(query, scope.authorId ? [id, scope.authorId] : [id]);

    if (rows.length === 0)
      return res.status(404).json({ error: "Aset tidak ditemukan atau bukan milik Anda" });
    await recordAudit({ ...auditActor(req), action: "asset.deleted", targetType: "asset", targetId: rows[0].id });
    res.json({ message: "Aset berhasil dihapus (soft delete)" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal menghapus aset", detail: error.message });
  }
};

// ============================================================================
// BAGIAN 2: CATEGORIES (KATEGORI)
// ============================================================================

const getAllCategories = async (req, res) => {
  try {
    // Tambahkan filter WHERE deleted_at IS NULL
    const { rows } = await pool.query(
      "SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY id ASC",
    );
    res.json(rows);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal mengambil kategori", detail: error.message });
  }
};
const createCategory = async (req, res) => {
  const { name, slug, description } = req.body;
  try {
    const query =
      "INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3) RETURNING *";
    const { rows } = await pool.query(query, [name, slug, description]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal membuat kategori", detail: error.message });
  }
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, slug, description } = req.body;
  try {
    const query =
      "UPDATE categories SET name=$1, slug=$2, description=$3 WHERE id=$4 RETURNING *";
    const { rows } = await pool.query(query, [name, slug, description, id]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    res.json(rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal mengubah kategori", detail: error.message });
  }
};

const deleteCategory = async (req, res) => {
  const { id } = req.params;
  try {
    // Ubah DELETE FROM menjadi UPDATE
    const query =
      "UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id=$1 RETURNING id";
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0)
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    res.json({ message: "Kategori berhasil diarsipkan (soft delete)" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal menghapus kategori", detail: error.message });
  }
};

// ============================================================================
// BAGIAN 3: WORK UNITS (UNIT KERJA)
// ============================================================================

const getAllWorkUnits = async (req, res) => {
  try {
    const shouldIncludeAssetCount = req.query.withAssetCount === "true";
    const query = shouldIncludeAssetCount
      ? `
        SELECT
          w.*,
          COUNT(a.id)::INTEGER AS asset_count
        FROM work_units w
        LEFT JOIN knowledge_assets a
          ON a.work_unit_id = w.id
          AND a.is_published = TRUE
          AND a.deleted_at IS NULL
        WHERE w.deleted_at IS NULL
        GROUP BY w.id
        ORDER BY w.id ASC
      `
      : "SELECT * FROM work_units WHERE deleted_at IS NULL ORDER BY id ASC";
    const { rows } = await pool.query(query);
    res.json(rows);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal mengambil unit kerja", detail: error.message });
  }
};

const createWorkUnit = async (req, res) => {
  const { name } = req.body;
  try {
    const query = "INSERT INTO work_units (name) VALUES ($1) RETURNING *";
    const { rows } = await pool.query(query, [name]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal membuat unit kerja", detail: error.message });
  }
};

const updateWorkUnit = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    const query = "UPDATE work_units SET name=$1 WHERE id=$2 RETURNING *";
    const { rows } = await pool.query(query, [name, id]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Unit kerja tidak ditemukan" });
    res.json(rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal mengubah unit kerja", detail: error.message });
  }
};

const deleteWorkUnit = async (req, res) => {
  const { id } = req.params;
  try {
    // Ubah DELETE FROM menjadi UPDATE
    const query =
      "UPDATE work_units SET deleted_at = CURRENT_TIMESTAMP WHERE id=$1 RETURNING id";
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0)
      return res.status(404).json({ error: "Unit kerja tidak ditemukan" });
    res.json({ message: "Unit kerja berhasil diarsipkan (soft delete)" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal menghapus unit kerja", detail: error.message });
  }
};

// ============================================================================
// EXPORT SEMUA FUNGSI
// ============================================================================
module.exports = {
  // Assets
  getHomepageAssets,
  getFeaturedAssets,
  getAdminAssets,
  getDeletedAssets,
  restoreAsset,
  getAdminDashboard,
  getAdminDashboardRanking,
  getAdminAssetDetail,
  getAssetById,
  incrementAssetView,
  trackAssetShare,
  getRelatedAssets,
  getAdminAssetById,
  createDraft,
  updateDraft,
  createAsset,
  updateAsset,
  deleteAsset,
  // Categories
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // Work Units
  getAllWorkUnits,
  createWorkUnit,
  updateWorkUnit,
  deleteWorkUnit,
};
