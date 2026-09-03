const pool = require("../database/db");
const fs = require("fs/promises");
const path = require("path");
const { createNotification, notifyPublicationReviewers } = require("../services/notificationService");
const { recordAudit } = require("../services/auditService");
const { extractPdfText, uploadsDirectory } = require("../services/mediaService");
const { hasPermission } = require("../services/permissionService");

const PUBLIC_ASSET_JOINS = `
  FROM knowledge_assets a
  LEFT JOIN users u ON a.author_id = u.id AND u.deleted_at IS NULL
  LEFT JOIN categories c ON a.category_id = c.id
  LEFT JOIN work_units w ON a.work_unit_id = w.id
  LEFT JOIN work_units parent_w ON w.parent_id = parent_w.id
  LEFT JOIN work_units grandparent_w ON parent_w.parent_id = grandparent_w.id
`;

const PUBLIC_WORK_UNIT_FILTER = `(
  a.work_unit_id IS NULL
  OR (
    w.id IS NOT NULL
    AND NOT EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, is_public, deleted_at FROM work_units WHERE id = w.id
        UNION ALL
        SELECT parent.id, parent.parent_id, parent.is_public, parent.deleted_at
        FROM work_units parent INNER JOIN ancestors child ON child.parent_id = parent.id
      )
      SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL OR is_public = FALSE
    )
  )
)`;

const PUBLIC_ASSET_RELATIONS = `
  CASE WHEN u.id IS NULL
    THEN json_build_object('id', NULL, 'full_name', 'Pegawai tidak aktif', 'department', NULL)
    ELSE json_build_object('id', u.id, 'full_name', u.full_name, 'department', u.department)
  END AS author,
  CASE WHEN c.id IS NULL THEN NULL
    ELSE json_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
  END AS category,
  CASE WHEN w.id IS NULL THEN NULL
    ELSE json_build_object(
      'id', w.id,
      'name', w.name,
      'alias', w.alias,
      'echelon_level', w.echelon_level,
      'parent_id', w.parent_id,
      'parent_name', parent_w.name,
      'parent_alias', parent_w.alias,
      'grandparent_name', grandparent_w.name,
      'grandparent_alias', grandparent_w.alias
    )
  END AS work_unit
`;

const PUBLIC_ASSET_SELECT = `
  SELECT
    a.id,
    a.public_id,
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
    a.allow_download,
    a.deleted_at,
    a.view_count,
    a.created_at,
    a.updated_at,
    ${PUBLIC_ASSET_RELATIONS}
  ${PUBLIC_ASSET_JOINS}
`;

const PUBLIC_ASSET_CARD_SELECT = `
  SELECT
    a.id,
    a.public_id,
    a.title,
    a.slug,
    a.asset_type,
    a.file_url,
    a.thumbnail_url,
    a.allow_download,
    a.view_count,
    a.created_at,
    ${PUBLIC_ASSET_RELATIONS}
  ${PUBLIC_ASSET_JOINS}
`;

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

const getPositiveInteger = (value, fallback, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
};

const parseBooleanInput = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
};

const addAssetIdentifierFilter = (values, value, alias = "a") => {
  const identifier = typeof value === "string" ? value.trim() : String(value || "");
  if (!identifier) return null;
  const prefix = alias ? `${alias}.` : "";
  const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (publicIdPattern.test(identifier)) {
    return `${prefix}public_id = $${values.push(identifier)}::uuid`;
  }
  if (/^\d+$/.test(identifier)) {
    const numericId = Number.parseInt(identifier, 10);
    if (Number.isInteger(numericId) && numericId > 0) {
      return `${prefix}id = $${values.push(numericId)}`;
    }
  }
  return `${prefix}slug = $${values.push(identifier)}`;
};

const getSearchTerms = (value, maxTerms = 8) => {
  if (typeof value !== "string") return [];
  const candidates = value.match(/[\p{L}\p{N}]+/gu) || [];
  const seen = new Set();
  return candidates.filter((term) => {
    const normalized = term.toLocaleLowerCase("id-ID");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, maxTerms);
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

const getPreviousDashboardRange = (period) => {
  if (!period.hasRange) return null;
  const currentStart = new Date(`${period.startDate}T00:00:00.000Z`);
  const currentEnd = new Date(`${period.endExclusive}T00:00:00.000Z`);
  const duration = currentEnd.getTime() - currentStart.getTime();
  const previousStart = new Date(currentStart.getTime() - duration);
  return { startDate: dateToIsoDay(previousStart), endExclusive: period.startDate };
};

const buildPublicFilters = ({ q, categoryId, workUnitId }) => {
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

  return { values, whereClause: filters.join(" AND "), searchTerm };
};

const ASSET_TYPES = new Set(["document", "video"]);
const fileExtension = (value) => (typeof value === "string" ? value : "").split(".").pop()?.toLowerCase() || "";
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

const slugify = (value) => {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "draft";
  return /^\d+$/.test(slug) ? `aset-${slug}` : slug;
};

const getAvailableSlug = async (value, excludedId = null, queryable = pool) => {
  const baseSlug = slugify(value).slice(0, 240);
  let sequence = 1;

  while (sequence <= 1000) {
    const suffix = sequence === 1 ? "" : `-${sequence}`;
    const candidate = `${baseSlug.slice(0, 255 - suffix.length)}${suffix}`;
    const { rows } = await queryable.query(
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

const getAssetIds = (value, maxItems = 100) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => Number.parseInt(item, 10)).filter((item) => Number.isInteger(item) && item > 0))]
    .slice(0, maxItems);
};

const localUploadName = (value) => {
  if (!value || typeof value !== "string" || /^https?:\/\//i.test(value)) return null;
  const normalized = value.split(/[?#]/, 1)[0].replace(/\\/g, "/");
  const name = path.basename(normalized);
  return name && name !== "." && path.extname(name) ? name : null;
};

const removeUnreferencedUploads = async (values) => {
  const candidates = [...new Set(values.map(localUploadName).filter(Boolean))];
  const deleted = [];
  const failed = [];
  let referencedFiles;

  try {
    const [assetReferences, avatarReferences] = await Promise.all([
      pool.query("SELECT file_url, thumbnail_url FROM knowledge_assets"),
      pool.query("SELECT avatar_url FROM users"),
    ]);
    referencedFiles = new Set([
      ...assetReferences.rows.flatMap((asset) => [asset.file_url, asset.thumbnail_url]),
      ...avatarReferences.rows.map((user) => user.avatar_url),
    ].map(localUploadName).filter(Boolean));
  } catch (error) {
    return {
      deleted,
      failed: candidates.map((fileName) => ({ fileName, error: `Pemeriksaan referensi gagal: ${error.message}` })),
    };
  }

  for (const fileName of candidates) {
    try {
      if (referencedFiles.has(fileName)) continue;

      const target = path.resolve(uploadsDirectory, fileName);
      if (path.dirname(target) !== path.resolve(uploadsDirectory)) throw new Error("Target file berada di luar direktori unggahan");
      await fs.unlink(target);
      deleted.push(fileName);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      failed.push({ fileName, error: error.message });
    }
  }
  return { deleted, failed };
};

const getRequestedAuthorId = (req, source = req.query.authorId) => {
  const requested = Number.parseInt(source, 10);
  const hasRequestedAuthor = Number.isInteger(requested) && requested > 0;
  if (req.accessContext?.id) {
    if (hasRequestedAuthor && requested !== req.accessContext.id) return { error: "Konteks akun hanya dapat mengakses aset akun yang sedang dipilih" };
    return { authorId: req.accessContext.id };
  }
  const isWriteRequest = !["GET", "HEAD"].includes(req.method);
  if (!["admin", "pimpinan"].includes(req.user.role) || (isWriteRequest && req.user.role !== "admin")) {
    if (hasRequestedAuthor && requested !== req.user.id) return { error: "Anda hanya dapat mengakses aset sendiri" };
    return { authorId: req.user.id };
  }
  return { authorId: hasRequestedAuthor ? requested : null };
};

const resolveAssetAuthorId = async (req, source = req.body.authorId) => {
  if (req.accessContext?.id) {
    const parsed = Number.parseInt(source, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed !== req.accessContext.id) {
      throw new Error("Kontributor harus sama dengan akun yang sedang diakses");
    }
    return req.accessContext.id;
  }
  if (req.user.role !== "admin") return req.user.id;
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

const wantsPublicationReview = (value) => value === true || value === "true";

const recordPublicationSubmission = async (asset, req) => {
  if (asset?.publication_status !== "pending_review") return;
  const actor = req.accessContext || req.user;
  await pool.query(
    `INSERT INTO asset_publication_reviews
       (asset_id, review_round, action, actor_id, actor_label, actor_role)
     VALUES ($1, $2, 'submitted', $3, $4, $5)`,
    [asset.id, asset.review_round, actor?.id || req.user?.id || null, actor?.full_name || req.user?.full_name || "Akun KMS", actor?.role || req.user?.role || "pegawai"],
  );
  await notifyPublicationReviewers({
    actorId: actor?.id || req.user?.id || null,
    assetId: asset.id,
    workUnitId: asset.work_unit_id,
  });
};

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

const DRAFT_VALIDATION_ERROR_PREFIXES = [
  "Admin wajib memilih pegawai",
  "Pegawai kontributor",
  "Durasi video",
  "Bab “",
  "Waktu setiap bab",
];

const sendDraftFailure = (res, error, fallbackMessage) => {
  console.error(fallbackMessage, {
    message: error.message,
    code: error.code,
    constraint: error.constraint,
    detail: error.detail,
  });

  if (error.code === "23505") {
    if (error.constraint === "unique_active_slug") {
      return res.status(409).json({ error: "Alamat draf mengalami konflik. Coba simpan kembali." });
    }
    return res.status(409).json({ error: "Draf mengalami konflik dengan data aktif lain." });
  }

  if (error.code === "23503") {
    return res.status(400).json({ error: "Kontributor, kategori, atau unit kerja yang dipilih sudah tidak tersedia." });
  }

  if (DRAFT_VALIDATION_ERROR_PREFIXES.some((prefix) => error.message?.startsWith(prefix))) {
    return res.status(400).json({ error: error.message });
  }

  const payload = { error: fallbackMessage };
  if (process.env.NODE_ENV !== "production") payload.detail = error.message;
  return res.status(500).json(payload);
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

const getFeaturedAssets = async (_req, res) => {
  try {
    const manualQuery = `
      ${PUBLIC_ASSET_CARD_SELECT}
      WHERE a.is_published = TRUE
        AND a.is_featured = TRUE
        AND a.deleted_at IS NULL
        AND ${PUBLIC_WORK_UNIT_FILTER}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT 3
    `;
    const manualResult = await pool.query(manualQuery);
    if (manualResult.rows.length) return res.json(manualResult.rows);

    const popularQuery = `
      ${PUBLIC_ASSET_CARD_SELECT}
      WHERE a.is_published = TRUE
        AND a.deleted_at IS NULL
        AND COALESCE(a.view_count, 0) > 0
        AND ${PUBLIC_WORK_UNIT_FILTER}
      ORDER BY a.view_count DESC, a.created_at DESC, a.id DESC
      LIMIT 3
    `;
    const popularResult = await pool.query(popularQuery);
    return res.json(popularResult.rows);
  } catch (error) {
    console.error("Error fetching featured assets:", error);
    res.status(500).json({ error: "Gagal memuat aset sorotan" });
  }
};

const updateFeaturedStatus = async (req, res) => {
  const shouldFeature = req.body?.isFeatured === true || req.body?.isFeatured === "true";
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  const values = [];
  const identifierFilter = addAssetIdentifierFilter(values, req.params.id, "a");
  if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
  if (scope.authorId) values.push(scope.authorId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE knowledge_assets IN SHARE ROW EXCLUSIVE MODE");
    const currentResult = await client.query(`
      SELECT a.id, a.title, a.is_published, a.is_featured,
             ${PUBLIC_WORK_UNIT_FILTER} AS is_publicly_visible
      FROM knowledge_assets a
      LEFT JOIN work_units w ON w.id = a.work_unit_id
      WHERE ${identifierFilter} AND a.deleted_at IS NULL${scope.authorId ? ` AND a.author_id = $${values.length}` : ""}
      FOR UPDATE OF a`, values);
    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Aset tidak ditemukan" });
    }
    if (shouldFeature && (!current.is_published || !current.is_publicly_visible)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Hanya aset terbit dari Unit Kerja publik yang dapat dijadikan sorotan" });
    }
    if (shouldFeature && !current.is_featured) {
      const countResult = await client.query(`
        SELECT COUNT(*)::integer AS total
        FROM knowledge_assets a
        LEFT JOIN work_units w ON w.id = a.work_unit_id
        WHERE a.is_featured = TRUE
          AND a.is_published = TRUE
          AND a.deleted_at IS NULL
          AND ${PUBLIC_WORK_UNIT_FILTER}`);
      if ((countResult.rows[0]?.total || 0) >= 3) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "Maksimal tiga aset dapat ditampilkan sebagai Pengetahuan Sorotan" });
      }
    }
    const { rows } = await client.query(`
      UPDATE knowledge_assets
      SET is_featured = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, public_id, title, is_featured`, [shouldFeature, current.id]);
    await client.query("COMMIT");
    await recordAudit({
      ...auditActor(req),
      action: shouldFeature ? "asset.featured" : "asset.unfeatured",
      targetType: "asset",
      targetId: current.id,
    });
    const { id: _id, ...asset } = rows[0];
    return res.json({
      message: shouldFeature ? "Aset ditambahkan ke Pengetahuan Sorotan" : "Aset dihapus dari Pengetahuan Sorotan",
      asset,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Error updating featured asset:", error);
    return res.status(500).json({ error: "Gagal memperbarui Pengetahuan Sorotan" });
  } finally {
    client.release();
  }
};

const getAdminAssets = async (req, res) => {
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  try {
    const values = [];
    const filters = ["a.deleted_at IS NULL"];
    if (scope.authorId) filters.push(`a.author_id = $${values.push(scope.authorId)}`);

    const paginated = req.query.paginated === "true";
    if (paginated) {
      for (const term of getSearchTerms(req.query.q)) {
        const parameter = `$${values.push(`%${term}%`)}`;
        filters.push(`CONCAT_WS(' ', a.title, a.content, c.name, w.name, u.full_name,
          CASE WHEN a.asset_type = 'video' THEN 'video mp4' ELSE 'dokumen pdf' END,
          CASE a.publication_status
            WHEN 'pending_review' THEN 'menunggu verifikasi diajukan'
            WHEN 'approved' THEN 'terbit disetujui dipublikasikan'
            WHEN 'revision_required' THEN 'perlu perbaikan revisi'
            WHEN 'rejected' THEN 'ditolak tidak layak'
            ELSE 'draf'
          END
        ) ILIKE ${parameter}`);
      }
    }

    const page = getPositiveInteger(req.query.page, 1, 100000);
    const limit = getPositiveInteger(req.query.limit, 10, 50);
    const sortFields = {
      title: "a.title",
      asset_type: "a.asset_type",
      is_published: "a.is_published",
      created_at: "a.created_at",
    };
    const sortField = sortFields[req.query.sortField] || "a.updated_at";
    const sortOrder = req.query.sortOrder === "asc" ? "ASC" : "DESC";
    const select = `
      SELECT ${paginated ? "COUNT(*) OVER()::int AS total_count," : ""}
             a.id, a.public_id, a.slug, a.title, a.asset_type, a.is_published, a.is_featured,
             a.publication_status, a.submitted_at, a.reviewed_at, a.review_note, a.review_round,
             reviewer.full_name AS reviewer_name,
             a.created_at, a.updated_at,
             ${paginated ? "LEFT(a.content, 360)" : "a.content"} AS content,
             a.thumbnail_url, a.file_url, a.category_id, a.work_unit_id,
             c.name AS category_name, w.name AS work_unit_name,
             a.author_id, COALESCE(u.full_name, 'Pegawai tidak aktif') AS author_name
      FROM knowledge_assets a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN work_units w ON a.work_unit_id = w.id
      LEFT JOIN users u ON a.author_id = u.id AND u.deleted_at IS NULL
      LEFT JOIN users reviewer ON a.reviewed_by = reviewer.id AND reviewer.deleted_at IS NULL
      WHERE ${filters.join(" AND ")}
      ORDER BY ${sortField} ${sortOrder}, a.id ${sortOrder}`;

    if (!paginated) {
      const { rows } = await pool.query(select, values);
      return res.json(rows.map((asset) => ({ ...asset, quality: buildAssetQuality(asset) })));
    }

    const listValues = [...values, limit, (page - 1) * limit];
    const { rows } = await pool.query(
      `${select} LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
      listValues,
    );
    let totalItems = rows[0]?.total_count || 0;
    if (!rows.length && page > 1) {
      const countResult = await pool.query(`
        SELECT COUNT(*)::int AS total
        FROM knowledge_assets a
        LEFT JOIN categories c ON a.category_id = c.id
        LEFT JOIN work_units w ON a.work_unit_id = w.id
        LEFT JOIN users u ON a.author_id = u.id AND u.deleted_at IS NULL
        WHERE ${filters.join(" AND ")}`,
      values);
      totalItems = countResult.rows[0]?.total || 0;
    }
    const data = rows.map(({ total_count: _totalCount, ...asset }) => ({ ...asset, quality: buildAssetQuality(asset) }));
    return res.json({
      data,
      pagination: { currentPage: page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    });
  } catch (error) {
    console.error("Error fetching admin assets:", error);
    return res.status(500).json({ error: "Gagal mengambil data aset backoffice" });
  }
};

const getDeletedAssets = async (req, res) => {
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  const page = getPositiveInteger(req.query.page, 1, 100000);
  const limit = getPositiveInteger(req.query.limit, 10, 50);
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
  const values = [];
  const filters = ["a.deleted_at IS NOT NULL"];
  if (scope.authorId) filters.push(`a.author_id = $${values.push(scope.authorId)}`);

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
         a.id, a.public_id, a.title, a.slug, a.asset_type, a.is_published,
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
  try {
    const scope = getRequestedAuthorId(req, req.body?.authorId);
    if (scope.error) return res.status(403).json({ error: scope.error });
    const lookupValues = [];
    const identifierFilter = addAssetIdentifierFilter(lookupValues, req.params.id, "");
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    if (scope.authorId) lookupValues.push(scope.authorId);
    const currentResult = await pool.query(
      `SELECT id, title, slug, is_published, author_id FROM knowledge_assets
       WHERE ${identifierFilter} AND deleted_at IS NOT NULL${scope.authorId ? ` AND author_id = $${lookupValues.length}` : ""}`,
      lookupValues,
    );
    const current = currentResult.rows[0];
    if (!current) return res.status(404).json({ error: "Aset terhapus tidak ditemukan atau sudah dipulihkan" });
    const assetId = current.id;

    const restoredSlug = await getAvailableSlug(current.slug || current.title, assetId);

    const { rows } = await pool.query(
      `UPDATE knowledge_assets
       SET deleted_at = NULL,
           is_published = FALSE,
           publication_status = 'draft',
           submitted_at = NULL,
           submitted_by = NULL,
           reviewed_at = NULL,
           reviewed_by = NULL,
           review_note = NULL,
           slug = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING id, title, asset_type, is_published, publication_status, author_id, updated_at`,
      [assetId, restoredSlug],
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
    if (error.code === "23505") return res.status(409).json({ error: "Alamat aset mengalami konflik saat dipulihkan. Coba kembali." });
    return res.status(500).json({ error: "Gagal memulihkan aset" });
  }
};

const restoreAssetsBulk = async (req, res) => {
  const assetIds = getAssetIds(req.body?.ids);
  if (!assetIds.length) return res.status(400).json({ error: "Pilih minimal satu aset yang akan dipulihkan" });
  const scope = getRequestedAuthorId(req, req.body?.authorId);
  if (scope.error) return res.status(403).json({ error: scope.error });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lookupValues = [assetIds];
    if (scope.authorId) lookupValues.push(scope.authorId);
    const currentResult = await client.query(
      `SELECT id, title, slug, is_published, author_id
       FROM knowledge_assets
       WHERE id = ANY($1::integer[]) AND deleted_at IS NOT NULL${scope.authorId ? " AND author_id = $2" : ""}
       ORDER BY id
       FOR UPDATE`,
      lookupValues,
    );
    if (!currentResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Aset terhapus tidak ditemukan atau sudah diproses" });
    }

    const restored = [];
    for (const asset of currentResult.rows) {
      const restoredSlug = await getAvailableSlug(asset.slug || asset.title, asset.id, client);
      const { rows } = await client.query(
        `UPDATE knowledge_assets
         SET deleted_at = NULL, is_published = FALSE, publication_status = 'draft',
             submitted_at = NULL, submitted_by = NULL, reviewed_at = NULL,
             reviewed_by = NULL, review_note = NULL,
             slug = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND deleted_at IS NOT NULL
         RETURNING id, title, asset_type, is_published, author_id, updated_at`,
        [asset.id, restoredSlug],
      );
      if (rows[0]) restored.push(rows[0]);
    }
    await client.query("COMMIT");

    await recordAudit({
      ...auditActor(req),
      action: "asset.bulk_restored",
      targetType: "asset_batch",
      metadata: { ids: restored.map((asset) => asset.id), count: restored.length, restoredAsDraft: true },
    });
    return res.json({
      message: `${restored.length} aset berhasil dipulihkan sebagai draf`,
      data: restored,
      skippedIds: assetIds.filter((id) => !restored.some((asset) => asset.id === id)),
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Error restoring assets in bulk:", error);
    return res.status(500).json({ error: "Gagal memulihkan aset terpilih" });
  } finally {
    client.release();
  }
};

const permanentlyDeleteAssets = async (req, res) => {
  const assetIds = getAssetIds(req.body?.ids);
  if (!assetIds.length) return res.status(400).json({ error: "Pilih minimal satu aset yang akan dihapus permanen" });
  if (req.body?.confirmation !== "HAPUS PERMANEN") {
    return res.status(400).json({ error: "Konfirmasi penghapusan permanen tidak sesuai" });
  }
  const scope = getRequestedAuthorId(req, req.body?.authorId);
  if (scope.error) return res.status(403).json({ error: scope.error });

  const client = await pool.connect();
  let deletedAssets = [];
  try {
    await client.query("BEGIN");
    const lookupValues = [assetIds];
    if (scope.authorId) lookupValues.push(scope.authorId);
    const currentResult = await client.query(
      `SELECT id, title, file_url, thumbnail_url
       FROM knowledge_assets
       WHERE id = ANY($1::integer[]) AND deleted_at IS NOT NULL${scope.authorId ? " AND author_id = $2" : ""}
       ORDER BY id
       FOR UPDATE`,
      lookupValues,
    );
    if (!currentResult.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Aset terhapus tidak ditemukan atau sudah diproses" });
    }
    deletedAssets = currentResult.rows;
    await client.query(
      "DELETE FROM knowledge_assets WHERE id = ANY($1::integer[]) AND deleted_at IS NOT NULL",
      [deletedAssets.map((asset) => asset.id)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Error permanently deleting assets:", error);
    return res.status(500).json({ error: "Gagal menghapus aset secara permanen" });
  } finally {
    client.release();
  }

  const uploadCleanup = await removeUnreferencedUploads(
    deletedAssets.flatMap((asset) => [asset.file_url, asset.thumbnail_url]),
  );
  await recordAudit({
    ...auditActor(req),
    action: "asset.permanently_deleted",
    targetType: "asset_batch",
    metadata: {
      ids: deletedAssets.map((asset) => asset.id),
      titles: deletedAssets.map((asset) => asset.title),
      count: deletedAssets.length,
      deletedFiles: uploadCleanup.deleted,
      fileCleanupFailures: uploadCleanup.failed,
    },
  });

  return res.json({
    message: `${deletedAssets.length} aset dihapus permanen`,
    deletedIds: deletedAssets.map((asset) => asset.id),
    skippedIds: assetIds.filter((id) => !deletedAssets.some((asset) => asset.id === id)),
    fileCleanup: { deleted: uploadCleanup.deleted.length, failed: uploadCleanup.failed.length },
  });
};

const getAdminDashboard = async (req, res) => {
  const accessSubject = req.accessContext || req.user;
  const isGlobalAdmin = req.user?.role === "admin" && !req.accessContext;
  const hasOrganizationAnalytics = [1, 2, 3].some((level) => hasPermission(accessSubject, `analytics_echelon_${level}`, "view"));
  if (!isGlobalAdmin && accessSubject?.role !== "pegawai" && hasOrganizationAnalytics) {
    return res.status(403).json({ error: accessSubject.work_unit_id
      ? "Gunakan halaman Analitik Unit Saya untuk melihat statistik sesuai cakupan organisasi"
      : "Akun pimpinan belum memiliki Unit Kerja sebagai batas analitik" });
  }
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });
  const period = getDashboardPeriod(req.query);
  if (period.error) return res.status(400).json({ error: period.error });
  const trend = getTrendRange(period);
  const previousPeriod = getPreviousDashboardRange(period);

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
      SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, COUNT(v.id)::int AS view_count, a.created_at,
             c.name AS category_name, w.name AS work_unit_name
      FROM asset_views v INNER JOIN knowledge_assets a ON a.id = v.asset_id
      LEFT JOIN categories c ON a.category_id = c.id LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE a.is_published = TRUE AND a.deleted_at IS NULL${viewRangeFilter}${viewScope}
      GROUP BY a.id, c.name, w.name ORDER BY COUNT(v.id) DESC, a.created_at DESC, a.id DESC LIMIT 5
    ` : `
      SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, COALESCE(a.view_count, 0)::int AS view_count, a.created_at,
             c.name AS category_name, w.name AS work_unit_name
      FROM knowledge_assets a LEFT JOIN categories c ON a.category_id = c.id LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE a.is_published = TRUE AND a.deleted_at IS NULL${assetScope}
      ORDER BY COALESCE(a.view_count, 0) DESC, a.created_at DESC, a.id DESC LIMIT 5
    `;
    const shareRangeFilter = period.hasRange ? " AND s.created_at >= $1::date AND s.created_at < $2::date" : "";
    const topSharedQuery = `
      SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, COUNT(s.id)::int AS share_count, a.created_at
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
    const previousValues = previousPeriod
      ? [previousPeriod.startDate, previousPeriod.endExclusive, ...(scope.authorId ? [scope.authorId] : [])]
      : [];
    const previousOrganizationPromise = previousPeriod ? pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE a.is_published = TRUE)::int AS published_asset_count,
        COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type <> 'video')::int AS document_count,
        COUNT(*) FILTER (WHERE a.is_published = TRUE AND a.asset_type = 'video')::int AS video_count,
        (SELECT COUNT(v.id)::int FROM asset_views v
         INNER JOIN knowledge_assets av ON av.id = v.asset_id
         WHERE av.is_published = TRUE AND av.deleted_at IS NULL
           AND v.created_at >= $1::date AND v.created_at < $2::date${scope.authorId ? " AND av.author_id = $3" : ""}) AS total_view_count
      FROM knowledge_assets a
      WHERE a.deleted_at IS NULL
        AND a.created_at >= $1::date AND a.created_at < $2::date${scope.authorId ? " AND a.author_id = $3" : ""}
    `, previousValues) : Promise.resolve({ rows: [null] });
    const personalPromise = personalAuthorId ? pool.query(`
      SELECT COUNT(*)::int AS asset_count, COUNT(*) FILTER (WHERE is_published)::int AS published_asset_count,
        COUNT(*) FILTER (WHERE NOT is_published)::int AS draft_count, COALESCE(SUM(view_count), 0)::int AS total_view_count
      FROM knowledge_assets WHERE author_id = $1 AND deleted_at IS NULL`, [personalAuthorId]) : Promise.resolve({ rows: [{ asset_count: 0, published_asset_count: 0, draft_count: 0, total_view_count: 0 }] });
    const recentPromise = personalAuthorId ? pool.query(`
      SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, a.is_published, COALESCE(a.view_count, 0)::int AS view_count, a.created_at, c.name AS category_name
      FROM knowledge_assets a LEFT JOIN categories c ON c.id = a.category_id
      WHERE a.author_id = $1 AND a.deleted_at IS NULL ORDER BY a.created_at DESC, a.id DESC LIMIT 5`, [personalAuthorId]) : Promise.resolve({ rows: [] });
    // Selalu sertakan ranking global untuk Admin. Frontend menyembunyikannya
    // ketika Admin sedang berada dalam konteks akun Pegawai.
    const includeStaffRankings = req.user.role === "admin" && !req.accessContext;
    const staffPeriodValues = period.hasRange ? [period.startDate, period.endExclusive] : [];
    const staffAssetRangeFilter = period.hasRange ? " AND a.created_at >= $1::date AND a.created_at < $2::date" : "";
    const emptyStaffRanking = () => Promise.resolve({ rows: [] });
    const staffPublishedPromise = includeStaffRankings ? pool.query(`
      SELECT u.id, u.full_name, u.email, u.department, COUNT(a.id)::int AS metric_value
      FROM users u
      INNER JOIN knowledge_assets a ON a.author_id = u.id
      WHERE u.role = 'pegawai' AND u.deleted_at IS NULL
        AND a.deleted_at IS NULL AND a.is_published = TRUE${staffAssetRangeFilter}
      GROUP BY u.id, u.full_name, u.email, u.department
      HAVING COUNT(a.id) > 0
      ORDER BY metric_value DESC, u.full_name ASC
      LIMIT 5`, staffPeriodValues) : emptyStaffRanking();
    const staffCreatedPromise = includeStaffRankings ? pool.query(`
      SELECT u.id, u.full_name, u.email, u.department, COUNT(a.id)::int AS metric_value
      FROM users u
      INNER JOIN knowledge_assets a ON a.author_id = u.id
      WHERE u.role = 'pegawai' AND u.deleted_at IS NULL
        AND a.deleted_at IS NULL${staffAssetRangeFilter}
      GROUP BY u.id, u.full_name, u.email, u.department
      HAVING COUNT(a.id) > 0
      ORDER BY metric_value DESC, u.full_name ASC
      LIMIT 5`, staffPeriodValues) : emptyStaffRanking();
    const staffViewsPromise = includeStaffRankings ? pool.query(period.hasRange ? `
      SELECT u.id, u.full_name, u.email, u.department, COUNT(v.id)::int AS metric_value
      FROM users u
      INNER JOIN knowledge_assets a ON a.author_id = u.id
      INNER JOIN asset_views v ON v.asset_id = a.id
      WHERE u.role = 'pegawai' AND u.deleted_at IS NULL
        AND a.deleted_at IS NULL AND a.is_published = TRUE
        AND v.created_at >= $1::date AND v.created_at < $2::date
      GROUP BY u.id, u.full_name, u.email, u.department
      HAVING COUNT(v.id) > 0
      ORDER BY metric_value DESC, u.full_name ASC
      LIMIT 5` : `
      SELECT u.id, u.full_name, u.email, u.department, COALESCE(SUM(a.view_count), 0)::int AS metric_value
      FROM users u
      INNER JOIN knowledge_assets a ON a.author_id = u.id
      WHERE u.role = 'pegawai' AND u.deleted_at IS NULL
        AND a.deleted_at IS NULL AND a.is_published = TRUE
      GROUP BY u.id, u.full_name, u.email, u.department
      HAVING COALESCE(SUM(a.view_count), 0) > 0
      ORDER BY metric_value DESC, u.full_name ASC
      LIMIT 5`, staffPeriodValues) : emptyStaffRanking();
    const echelonComparisonPromise = scope.authorId
      ? Promise.resolve({ rows: [] })
      : period.hasRange ? pool.query(`
      SELECT w.public_id, w.name, w.alias,
        (SELECT COUNT(a.id)::INTEGER
         FROM knowledge_assets a
         INNER JOIN work_units aw ON aw.id = a.work_unit_id
         WHERE a.deleted_at IS NULL AND a.is_published = TRUE
           AND (aw.id = w.id OR aw.parent_id = w.id)
           AND a.created_at >= $1::date AND a.created_at < $2::date) AS published_asset_count,
        (SELECT COUNT(v.id)::INTEGER
         FROM asset_views v
         INNER JOIN knowledge_assets a ON a.id = v.asset_id
         INNER JOIN work_units aw ON aw.id = a.work_unit_id
         WHERE a.deleted_at IS NULL AND a.is_published = TRUE
           AND (aw.id = w.id OR aw.parent_id = w.id)
           AND v.created_at >= $1::date AND v.created_at < $2::date) AS total_view_count
      FROM work_units w
      WHERE w.echelon_level = 1 AND w.deleted_at IS NULL
      ORDER BY w.name ASC`, [period.startDate, period.endExclusive]) : pool.query(`
      SELECT w.public_id, w.name, w.alias,
        COUNT(a.id) FILTER (WHERE a.is_published = TRUE)::INTEGER AS published_asset_count,
        COALESCE(SUM(a.view_count) FILTER (WHERE a.is_published = TRUE), 0)::INTEGER AS total_view_count
      FROM work_units w
      LEFT JOIN work_units aw ON aw.deleted_at IS NULL AND (aw.id = w.id OR aw.parent_id = w.id)
      LEFT JOIN knowledge_assets a ON a.work_unit_id = aw.id AND a.deleted_at IS NULL
      WHERE w.echelon_level = 1 AND w.deleted_at IS NULL
      GROUP BY w.id
      ORDER BY w.name ASC`);
    const [organizationResult, trendResult, topAssetsResult, topSharedResult, popularSearchesResult, personalResult, recentAssetsResult, staffPublishedResult, staffViewsResult, staffCreatedResult, previousOrganizationResult, echelonComparisonResult] = await Promise.all([
      pool.query(organizationQuery, scopedValues),
      pool.query(trendQuery, scope.authorId ? [trend.startDate, trend.endExclusive, scope.authorId] : [trend.startDate, trend.endExclusive]),
      pool.query(topAssetsQuery, scopedValues), pool.query(topSharedQuery, scopedValues),
      pool.query(`
        SELECT e.query,
               COUNT(*)::int AS search_count,
               COUNT(*) FILTER (WHERE e.result_count = 0)::int AS zero_result_count,
               SUM(COUNT(*)) OVER()::int AS total_searches,
               SUM(COUNT(*) FILTER (WHERE e.result_count = 0)) OVER()::int AS zero_result_searches
        FROM search_events e ${searchFilter}
        GROUP BY e.query
        ORDER BY COUNT(*) DESC, MAX(e.created_at) DESC
        LIMIT 5`, period.hasRange ? [period.startDate, period.endExclusive] : []),
      personalPromise, recentPromise, staffPublishedPromise, staffViewsPromise, staffCreatedPromise, previousOrganizationPromise, echelonComparisonPromise,
    ]);
    const searchTotals = popularSearchesResult.rows[0] || { total_searches: 0, zero_result_searches: 0 };
    const popularSearches = popularSearchesResult.rows.map(({ total_searches: _total, zero_result_searches: _zero, ...row }) => row);
    res.json({
      organization: organizationResult.rows[0], publicationTrend: trendResult.rows, topAssets: topAssetsResult.rows,
      discovery: {
        total_searches: searchTotals.total_searches,
        zero_result_searches: searchTotals.zero_result_searches,
        topShared: topSharedResult.rows,
        popularSearches,
      },
      rankings: {
        search: popularSearches.map((row) => ({ ...row, metric_value: row.search_count })),
        view: topAssetsResult.rows.map((row) => ({ ...row, metric_value: row.view_count })),
        share: topSharedResult.rows.map((row) => ({ ...row, metric_value: row.share_count })),
      },
      staffRankings: {
        published: staffPublishedResult.rows,
        views: staffViewsResult.rows,
        created: staffCreatedResult.rows,
      },
      echelonComparison: echelonComparisonResult.rows,
      period: { key: period.key, startDate: period.startDate, endDate: period.endDate, trendGranularity: trend.label, viewMetric: period.hasRange ? "period" : "all_time" },
      comparison: { available: Boolean(previousPeriod), previous: previousOrganizationResult.rows[0] },
      selectedAuthorId: personalAuthorId,
      personal: { ...personalResult.rows[0], recentAssets: recentAssetsResult.rows },
    });
  } catch (error) {
    console.error("Error fetching admin dashboard:", error);
    res.status(500).json({ error: "Gagal memuat ringkasan dashboard" });
  }
};

const getAdminDashboardRanking = async (req, res) => {
  const accessSubject = req.accessContext || req.user;
  const isGlobalAdmin = req.user?.role === "admin" && !req.accessContext;
  if (!isGlobalAdmin && accessSubject?.role !== "pegawai"
    && [1, 2, 3].some((level) => hasPermission(accessSubject, `analytics_echelon_${level}`, "view"))) {
    return res.status(403).json({ error: "Ranking global tidak tersedia di luar cakupan organisasi" });
  }
  const metric = typeof req.query.metric === "string" ? req.query.metric : "";
  const validMetrics = new Set(["search", "view", "share", "staff_published", "staff_views", "staff_created"]);
  if (!validMetrics.has(metric)) {
    return res.status(400).json({ error: "Metric ranking tidak valid" });
  }
  const isStaffMetric = metric.startsWith("staff_");
  if (isStaffMetric && (req.user.role !== "admin" || req.accessContext)) {
    return res.status(403).json({ error: "Ranking kontribusi Pegawai hanya tersedia untuk Admin" });
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
  if (isStaffMetric) {
    const filters = ["u.role = 'pegawai'", "u.deleted_at IS NULL", "a.deleted_at IS NULL"];
    if (query) {
      const searchParameter = addValue(`%${query}%`);
      filters.push(`(u.full_name ILIKE ${searchParameter} OR u.email ILIKE ${searchParameter} OR COALESCE(u.department, '') ILIKE ${searchParameter})`);
    }

    if (metric === "staff_views") {
      filters.push("a.is_published = TRUE");
      if (period.hasRange) {
        filters.push(`v.created_at >= ${addValue(period.startDate)}::date`);
        filters.push(`v.created_at < ${addValue(period.endExclusive)}::date`);
        baseSql = `
          SELECT u.id, u.full_name, u.email, u.department,
                 COUNT(v.id)::int AS metric_value, u.full_name AS sort_label
          FROM users u
          INNER JOIN knowledge_assets a ON a.author_id = u.id
          INNER JOIN asset_views v ON v.asset_id = a.id
          WHERE ${filters.join(" AND ")}
          GROUP BY u.id, u.full_name, u.email, u.department
          HAVING COUNT(v.id) > 0`;
      } else {
        baseSql = `
          SELECT u.id, u.full_name, u.email, u.department,
                 COALESCE(SUM(a.view_count), 0)::int AS metric_value, u.full_name AS sort_label
          FROM users u
          INNER JOIN knowledge_assets a ON a.author_id = u.id
          WHERE ${filters.join(" AND ")}
          GROUP BY u.id, u.full_name, u.email, u.department
          HAVING COALESCE(SUM(a.view_count), 0) > 0`;
      }
    } else {
      if (metric === "staff_published") filters.push("a.is_published = TRUE");
      if (period.hasRange) {
        filters.push(`a.created_at >= ${addValue(period.startDate)}::date`);
        filters.push(`a.created_at < ${addValue(period.endExclusive)}::date`);
      }
      baseSql = `
        SELECT u.id, u.full_name, u.email, u.department,
               COUNT(a.id)::int AS metric_value, u.full_name AS sort_label
        FROM users u
        INNER JOIN knowledge_assets a ON a.author_id = u.id
        WHERE ${filters.join(" AND ")}
        GROUP BY u.id, u.full_name, u.email, u.department
        HAVING COUNT(a.id) > 0`;
    }
  } else if (metric === "search") {
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
        SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, a.thumbnail_url,
               COALESCE(u.full_name, 'Pegawai tidak aktif') AS author_name,
               c.name AS category_name, COALESCE(a.view_count, 0)::int AS metric_value,
               a.title AS sort_label
        FROM knowledge_assets a
        LEFT JOIN users u ON u.id = a.author_id AND u.deleted_at IS NULL
        LEFT JOIN categories c ON c.id = a.category_id
        WHERE ${assetFilters.join(" AND ")}`;
    } else {
      baseSql = `
        SELECT a.id, a.public_id, a.slug, a.title, a.asset_type, a.thumbnail_url,
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
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, id);
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    const query = `
      ${PUBLIC_ASSET_SELECT}
      WHERE ${identifierFilter}
        AND a.is_published = TRUE
        AND a.deleted_at IS NULL
        AND ${PUBLIC_WORK_UNIT_FILTER}
    `;

    const { rows } = await pool.query(query, values);

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

const getAdminAssetById = async (req, res) => {
  const { id } = req.params;
  const scope = getRequestedAuthorId(req);
  if (scope.error) return res.status(403).json({ error: scope.error });

  try {
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, id);
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    if (scope.authorId) values.push(scope.authorId);
    const query = `
      SELECT a.*, c.name AS category_name, w.name AS work_unit_name
      FROM knowledge_assets a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE ${identifierFilter} AND a.deleted_at IS NULL${scope.authorId ? ` AND a.author_id = $${values.length}` : ""}
    `;
    const { rows } = await pool.query(query, values);

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
    const includeDeleted = req.user?.role === "admin" && !req.accessContext && req.query.includeDeleted === "true";
  try {
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, id);
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    if (scope.authorId) values.push(scope.authorId);
    const { rows } = await pool.query(
      `${PUBLIC_ASSET_SELECT}
       WHERE ${identifierFilter} AND a.deleted_at ${includeDeleted ? "IS NOT NULL" : "IS NULL"}${scope.authorId ? ` AND a.author_id = $${values.length}` : ""}`,
      values,
    );
    if (!rows[0]) return res.status(404).json({ error: "Aset tidak ditemukan" });
    const asset = rows[0];
    const reviewResult = await pool.query(
      `SELECT a.publication_status, a.submitted_at, a.reviewed_at, a.review_note, a.review_round,
              reviewer.full_name AS reviewer_name
       FROM knowledge_assets a
       LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
       WHERE a.id = $1`,
      [asset.id],
    );
    res.json({ ...asset, ...reviewResult.rows[0], quality: buildAssetQuality(asset) });
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
       (title, slug, asset_type, file_url, content, thumbnail_url, extracted_text, video_duration_seconds, video_chapters, is_published, allow_download, author_id, category_id, work_unit_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, FALSE, $10, $11, $12, $13)
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
        parseBooleanInput(req.body.allow_download, true),
        await resolveAssetAuthorId(req),
        req.body.category_id ? Number(req.body.category_id) : null,
        req.body.work_unit_id ? Number(req.body.work_unit_id) : null,
      ],
    );
    await recordAudit({ ...auditActor(req), action: "asset.draft_created", targetType: "asset", targetId: rows[0].id, metadata: { assetType } });
    res.status(201).json({ ...rows[0], quality: buildAssetQuality(rows[0]) });
  } catch (error) {
    return sendDraftFailure(res, error, "Gagal menyimpan draf otomatis");
  }
};

const updateDraft = async (req, res) => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const assetType = ASSET_TYPES.has(req.body.asset_type) ? req.body.asset_type : "document";
  if (!title) return res.status(400).json({ error: "Judul draf wajib diisi" });

  try {
    const draftScope = getRequestedAuthorId(req, req.body.authorId);
    if (draftScope.error) return res.status(403).json({ error: draftScope.error });
    const lookupValues = [];
    const identifierFilter = addAssetIdentifierFilter(lookupValues, req.params.id, "");
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    if (draftScope.authorId) lookupValues.push(draftScope.authorId);
    const currentResult = await pool.query(
       `SELECT * FROM knowledge_assets
        WHERE ${identifierFilter}
          AND is_published = FALSE
          AND publication_status IN ('draft', 'revision_required', 'rejected')
          AND deleted_at IS NULL${draftScope.authorId ? ` AND author_id = $${lookupValues.length}` : ""}`,
      lookupValues,
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
         allow_download = $11,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 AND is_published = FALSE AND deleted_at IS NULL
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
        parseBooleanInput(req.body.allow_download, current.allow_download),
        current.id,
      ],
    );
    if (!rows[0]) {
      return res.status(409).json({ error: "Draf sudah disimpan atau diterbitkan oleh proses lain" });
    }
    await recordAudit({ ...auditActor(req), action: "asset.draft_updated", targetType: "asset", targetId: current.id, metadata: { assetType } });
    res.json({ ...rows[0], quality: buildAssetQuality(rows[0]) });
  } catch (error) {
    return sendDraftFailure(res, error, "Gagal memperbarui draf otomatis");
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

    const submitForReview = wantsPublicationReview(is_published);
    const publicationStatus = submitForReview ? "pending_review" : "draft";
    const query = `
      INSERT INTO knowledge_assets 
        (title, slug, asset_type, file_url, content, thumbnail_url, extracted_text,
         video_duration_seconds, video_chapters, is_published, publication_status,
         submitted_at, submitted_by, review_round, allow_download, author_id, category_id, work_unit_id)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, FALSE, $10::varchar,
         CASE WHEN $10::varchar = 'pending_review' THEN CURRENT_TIMESTAMP END,
         $11, CASE WHEN $10::varchar = 'pending_review' THEN 1 ELSE 0 END,
         $12, $13, $14, $15)
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
      publicationStatus,
      submitForReview ? authorId : null,
      parseBooleanInput(req.body.allow_download, true),
      authorId,
      category_id ? Number(category_id) : null,
      work_unit_id ? Number(work_unit_id) : null,
    ];

    const { rows } = await pool.query(query, values);
    await recordPublicationSubmission(rows[0], req);
    await recordAudit({ ...auditActor(req), action: submitForReview ? "asset.publication_submitted" : "asset.created_draft", targetType: "asset", targetId: rows[0].id, metadata: { assetType, authorId, reviewRound: rows[0].review_round } });
    res.status(201).json({
      ...rows[0],
      message: submitForReview ? "Aset berhasil diajukan untuk verifikasi" : "Aset berhasil disimpan sebagai draf",
      quality: buildAssetQuality(rows[0]),
    });
  } catch (error) {
    console.error("Error detail:", error.message || error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "Alamat aset mengalami konflik. Coba simpan kembali agar sistem membuat alamat baru." });
    }
    const payload = { error: "Gagal menyimpan aset" };
    if (process.env.NODE_ENV !== "production") payload.detail = error.message;
    res.status(500).json(payload);
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
    const lookupValues = [];
    const identifierFilter = addAssetIdentifierFilter(lookupValues, id, "");
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    if (scope.authorId) lookupValues.push(scope.authorId);
    const { rows: currentRows } = await pool.query(
      `SELECT * FROM knowledge_assets WHERE ${identifierFilter} AND deleted_at IS NULL${scope.authorId ? ` AND author_id = $${lookupValues.length}` : ""}`,
      lookupValues,
    );
    const current = currentRows[0];

    if (!current) {
      return res.status(403).json({
        error:
          "Aset tidak ditemukan atau Anda tidak memiliki izin untuk mengeditnya.",
      });
    }
    if (current.publication_status === "pending_review") {
      return res.status(409).json({ error: "Aset sedang diverifikasi dan tidak dapat diubah sampai keputusan diberikan" });
    }

    // 2. Tangkap path file baru (jika user mengunggahnya)
    const normalizedAssetType = ASSET_TYPES.has(asset_type) ? asset_type : "document";
    const uploaded = getUploadedFiles(req);
    const mediaError = validateAssetMedia(normalizedAssetType, uploaded.file, uploaded.file ? "" : current.file_url);
    if (mediaError) return res.status(400).json({ error: mediaError });
    const video = normalizeVideoMetadata(req.body, normalizedAssetType, current);
    const extractedText = await getExtractedText(normalizedAssetType, uploaded.file, current);
    const uniqueSlug = await getAvailableSlug(slug || title, current.id);

    // 3. Eksekusi Update menggunakan COALESCE
    // COALESCE akan menyimpan nilai baru jika ada, atau mempertahankan data lama di database jika file baru = null
    const submitForReview = wantsPublicationReview(is_published);
    const publicationStatus = submitForReview ? "pending_review" : "draft";
    const updateQuery = `
      UPDATE knowledge_assets
      SET 
        title = $1,
        slug = $2,
        asset_type = $3,
        content = $4,
        category_id = $5,
        work_unit_id = $6,
        is_published = FALSE,
        publication_status = $7::varchar,
        submitted_at = CASE WHEN $7::varchar = 'pending_review' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
        submitted_by = CASE WHEN $7::varchar = 'pending_review' THEN $8 ELSE submitted_by END,
        reviewed_at = CASE WHEN $7::varchar = 'pending_review' THEN NULL ELSE reviewed_at END,
        reviewed_by = CASE WHEN $7::varchar = 'pending_review' THEN NULL ELSE reviewed_by END,
        review_note = CASE WHEN $7::varchar = 'pending_review' THEN NULL ELSE review_note END,
        review_round = CASE WHEN $7::varchar = 'pending_review' THEN review_round + 1 ELSE review_round END,
        thumbnail_url = COALESCE($9, thumbnail_url),
        file_url = COALESCE($10, file_url),
        extracted_text = $11,
        video_duration_seconds = $12,
        video_chapters = $13::jsonb,
        allow_download = $14,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *;
    `;

    const values = [
      title,
      uniqueSlug,
      normalizedAssetType,
      content,
      category_id ? parseInt(category_id) : null,
      work_unit_id ? parseInt(work_unit_id) : null,
      publicationStatus,
      submitForReview ? current.author_id : null,
      uploaded.thumbnail,
      uploaded.file?.filename || null,
      extractedText,
      video.duration,
      JSON.stringify(video.chapters),
      parseBooleanInput(req.body.allow_download, current.allow_download),
      current.id,
    ];

    const { rows } = await pool.query(updateQuery, values);
    await recordPublicationSubmission(rows[0], req);
    await recordAudit({ ...auditActor(req), action: submitForReview ? "asset.publication_submitted" : "asset.updated_draft", targetType: "asset", targetId: rows[0].id, metadata: { assetType: normalizedAssetType, authorId: current.author_id, reviewRound: rows[0].review_round } });

    res.json({
      message: submitForReview ? "Aset berhasil diajukan untuk verifikasi" : "Aset berhasil diperbarui sebagai draf",
      asset: { ...rows[0], quality: buildAssetQuality(rows[0]) },
    });
  } catch (error) {
    console.error("Error updating asset:", error);
    if (error.code === "23505") {
      return res.status(409).json({ error: "Alamat aset mengalami konflik. Coba simpan kembali agar sistem membuat alamat baru." });
    }
    res.status(500).json({ error: "Gagal memperbarui aset" });
  }
};

const deleteAsset = async (req, res) => {
  const { id } = req.params;
  try {
    const scope = getRequestedAuthorId(req);
    if (scope.error) return res.status(403).json({ error: scope.error });
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, id, "");
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    if (scope.authorId) values.push(scope.authorId);
    const query = `UPDATE knowledge_assets SET deleted_at = CURRENT_TIMESTAMP
      WHERE ${identifierFilter} AND deleted_at IS NULL${scope.authorId ? ` AND author_id = $${values.length}` : ""} RETURNING id`;
    const { rows } = await pool.query(query, values);

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

module.exports = {
  // Assets
  getHomepageAssets,
  getFeaturedAssets,
  updateFeaturedStatus,
  getAdminAssets,
  getDeletedAssets,
  restoreAsset,
  restoreAssetsBulk,
  permanentlyDeleteAssets,
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
};
