const pool = require("../../config/db");
const { getPositiveInteger } = require("../../utils");
const { queryWithAssetVersion } = require("../../services/assetVersionService");
const { notifyPublicationReviewers } = require("../../services/notificationService");
const { recordAudit } = require("../../services/auditService");
const { extractPdfText } = require("../../services/mediaService");
const { commitAssetUploads, withAssetUploadCleanup } = require("../../services/assetUploadLifecycle");
const { hasPermission, hasOrganizationScope } = require("../../services/permissionService");
const { requestedAssetReadPredicate, assetCapabilities, hasCombinedAssetScope } = require("../../services/assetAccessService");
const {
  PUBLIC_ASSET_SELECT,
  addAssetIdentifierFilter,
  getSearchTerms,
  slugify,
  getAvailableSlug,
  getRequestedAuthorId,
  auditActor,
} = require("./shared");

const parseBooleanInput = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
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

const resolveAssetAuthorId = async (req, source = req.body.authorId) => {
  const subject = req.accessContext || req.user;
  if (!subject?.environmentAdmin && req.accessContext?.id) {
    const parsed = Number.parseInt(source, 10);
    if (Number.isInteger(parsed) && parsed > 0 && parsed !== req.accessContext.id) {
      throw new Error("Kontributor harus sama dengan akun yang sedang diakses");
    }
    return req.accessContext.id;
  }
  if (!subject?.environmentAdmin) return subject.id;
  const parsed = Number.parseInt(source, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    if (subject.id) return subject.id;
    throw new Error("Pilih akun kontributor aset terlebih dahulu");
  }
  const { rows } = await pool.query(
    "SELECT u.id FROM users u JOIN access_roles ar ON ar.code=u.role AND ar.is_backoffice=TRUE WHERE u.id = $1 AND u.deleted_at IS NULL",
    [parsed],
  );
  if (!rows[0]) throw new Error("Pegawai kontributor tidak ditemukan atau sudah tidak aktif");
  return parsed;
};

const wantsPublicationReview = (value) => value === true || value === "true";

const recordPublicationSubmission = async (asset, req, database = pool) => {
  if (asset?.publication_status !== "pending_review") return;
  const actor = req.accessContext || req.user;
  await database.query(
    `INSERT INTO asset_publication_reviews
       (asset_id, review_round, action, actor_id, actor_label, actor_role)
     VALUES ($1, $2, 'submitted', $3, $4, $5)`,
    [asset.id, asset.review_round, actor?.id || req.user?.id || null, actor?.full_name || req.user?.full_name || "Akun KMS", actor?.role || req.user?.role || "pegawai"],
  );
  await notifyPublicationReviewers({
    actorId: actor?.id || req.user?.id || asset.author_id || null,
    assetId: asset.id,
    workUnitId: asset.work_unit_id,
  }, database);
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

const getAdminAssets = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const subject = req.accessContext || req.user;
  try {
    const values = [];
    const filters = ["a.deleted_at IS NULL", requestedAssetReadPredicate(req, values)];

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
             a.created_at, a.updated_at, a.allow_download,
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
      return res.json(rows.map((asset) => ({ ...asset, ...assetCapabilities(subject, asset), quality: buildAssetQuality(asset) })));
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
    const data = rows.map(({ total_count: _totalCount, ...asset }) => ({ ...asset, ...assetCapabilities(subject, asset), quality: buildAssetQuality(asset) }));
    return res.json({
      data,
      scope: { type: subject?.environmentAdmin ? "all" : hasCombinedAssetScope(subject) ? "staff" : "own" },
      pagination: { currentPage: page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    });
  } catch (error) {
    console.error("Error fetching admin assets:", error);
    if (error.status === 400) return res.status(400).json({ error: error.message });
    return res.status(500).json({ error: "Gagal mengambil data aset backoffice" });
  }
};

const getAdminAssetById = async (req, res) => {
  const { id } = req.params;
  res.setHeader("Cache-Control", "private, no-store");

  try {
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, id);
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    const readScope = requestedAssetReadPredicate(req, values);
    const query = `
      SELECT a.*, c.name AS category_name, w.name AS work_unit_name
      FROM knowledge_assets a
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE ${identifierFilter} AND a.deleted_at IS NULL AND ${readScope}
    `;
    const { rows } = await pool.query(query, values);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Aset tidak ditemukan" });
    }

    res.json({ ...rows[0], ...assetCapabilities(req.accessContext || req.user, rows[0]), quality: buildAssetQuality(rows[0]) });
  } catch (error) {
    console.error("Error fetching admin asset:", error);
    if (error.status === 400) return res.status(400).json({ error: error.message });
    res.status(500).json({ error: "Gagal mengambil data aset" });
  }
};

const getAdminAssetDetail = async (req, res) => {
  const { id } = req.params;
  res.setHeader("Cache-Control", "private, no-store");
  const includeDeleted = hasOrganizationScope(req.accessContext || req.user) && hasPermission(req.accessContext || req.user, "asset_recovery", "view") && req.query.includeDeleted === "true";
  try {
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, id);
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    const readScope = requestedAssetReadPredicate(req, values, 'a', { recovery: includeDeleted });
    const { rows } = await pool.query(
      `${PUBLIC_ASSET_SELECT}
       WHERE ${identifierFilter} AND a.deleted_at ${includeDeleted ? "IS NOT NULL" : "IS NULL"} AND ${readScope}`,
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
    const reviewedAsset = { ...asset, ...reviewResult.rows[0] };
    res.json({ ...reviewedAsset, ...assetCapabilities(req.accessContext || req.user, reviewedAsset), quality: buildAssetQuality(asset) });
  } catch (error) {
    console.error("Error fetching admin asset detail:", error);
    if (error.status === 400) return res.status(400).json({ error: error.message });
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
    const { rows } = await queryWithAssetVersion(pool, req,
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
      "create",
    );
    commitAssetUploads(req, rows[0]);
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
    const draftScope = getRequestedAuthorId(req, req.body.authorId, true);
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
    const { rows } = await queryWithAssetVersion(pool, req,
      `UPDATE knowledge_assets SET
         title = $1, asset_type = $2, content = $3,
         category_id = $4, work_unit_id = $5,
         thumbnail_url = COALESCE($6, thumbnail_url), file_url = COALESCE($7, file_url),
         extracted_text = $8, video_duration_seconds = $9, video_chapters = $10::jsonb,
         allow_download = $11,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 AND is_published = FALSE AND deleted_at IS NULL
         AND publication_status IN ('draft', 'revision_required', 'rejected')
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
      "autosave",
    );
    if (!rows[0]) {
      return res.status(409).json({ error: "Draf sudah disimpan atau diterbitkan oleh proses lain" });
    }
    commitAssetUploads(req, rows[0]);
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

    const { rows } = await queryWithAssetVersion(pool, req, query, values, "create",
      (result, database) => recordPublicationSubmission(result.rows[0], req, database));
    commitAssetUploads(req, rows[0]);
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
    const scope = getRequestedAuthorId(req, req.body.authorId, true);
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
      return res.status(409).json({ code: "ASSET_PENDING_REVIEW", error: "Aset sedang diverifikasi dan tidak dapat diubah sampai keputusan diberikan" });
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
      WHERE id = $15 AND deleted_at IS NULL AND publication_status <> 'pending_review'
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

    const { rows } = await queryWithAssetVersion(pool, req, updateQuery, values, "edit",
      (result, database) => recordPublicationSubmission(result.rows[0], req, database));
    if (!rows[0]) return res.status(409).json({ error: "Aset sudah berubah atau sedang diverifikasi. Muat ulang sebelum menyimpan." });
    commitAssetUploads(req, rows[0]);
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
    const scope = getRequestedAuthorId(req, req.query.authorId, true);
    if (scope.error) return res.status(403).json({ error: scope.error });
    const values = [];
    const identifierFilter = addAssetIdentifierFilter(values, id, "");
    if (!identifierFilter) return res.status(400).json({ error: "Referensi aset tidak valid" });
    if (scope.authorId) values.push(scope.authorId);
    const query = `UPDATE knowledge_assets SET deleted_at = CURRENT_TIMESTAMP
      WHERE ${identifierFilter} AND deleted_at IS NULL${scope.authorId ? ` AND author_id = $${values.length}` : ""} RETURNING id`;
    const { rows } = await queryWithAssetVersion(pool, req, query, values, "delete");

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
  getAdminAssets,
  getAdminAssetDetail,
  getAdminAssetById,
  createDraft: withAssetUploadCleanup(createDraft),
  updateDraft: withAssetUploadCleanup(updateDraft),
  createAsset: withAssetUploadCleanup(createAsset),
  updateAsset: withAssetUploadCleanup(updateAsset),
  deleteAsset,
};
