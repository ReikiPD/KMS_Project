const fs = require("fs/promises");
const path = require("path");
const pool = require("../config/db");
const { uploads } = require("../config/env");
const { resolveUploadFile } = require("../services/mediaService");
const { loadSession } = require("../services/sessionService");
const { loadAccessContext } = require("../middleware/authMiddleware");

const { hasPermission } = require("../services/permissionService");
const { assetReadPredicate } = require("../services/assetAccessService");
const MIME_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
};

const safeDownloadName = (title, fileName) => {
  const extension = path.extname(fileName).toLowerCase();
  const baseName = String(title || "dokumen-kms")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 100) || "dokumen-kms";
  return `${baseName}${extension}`;
};

const contentDisposition = (disposition, fileName) => {
  const asciiName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
};

const sendStoredMedia = async (req, res, { fileName, title, isPublic, forceDownload = false }) => {
  let filePath;
  try {
    filePath = resolveUploadFile(fileName);
    await fs.access(filePath);
  } catch {
    return res.status(404).json({ error: "File tidak ditemukan pada penyimpanan" });
  }

  const download = forceDownload || req.query.download === "1";
  const responseName = safeDownloadName(title, fileName);
  res.setHeader("Content-Type", MIME_TYPES[path.extname(fileName).toLowerCase()] || "application/octet-stream");
  res.setHeader("Content-Disposition", contentDisposition(download ? "attachment" : "inline", responseName));
  res.setHeader("Cache-Control", isPublic && !download ? "public, max-age=300" : "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (uploads.accelRedirectPrefix) {
    res.setHeader("X-Accel-Redirect", `${uploads.accelRedirectPrefix}/${encodeURIComponent(fileName)}`);
    return res.status(200).end();
  }

  return res.sendFile(filePath);
};

const getMedia = async (req, res) => {
  const fileName = String(req.params.fileName || "").trim();
  try {
    resolveUploadFile(fileName);
  } catch {
    return res.status(400).json({ error: "Referensi file tidak valid" });
  }

  try {
    const { rows } = await pool.query(
      `SELECT 'asset'::text AS source_type,
              a.id AS asset_id,
              a.deleted_at AS reference_deleted_at,
              a.author_id,
              a.work_unit_id AS reference_work_unit_id,
              a.title,
              (a.file_url = $1) AS is_primary_file,
              a.allow_download,
              (a.is_published = TRUE
                AND a.deleted_at IS NULL
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
                ))) AS is_public
       FROM knowledge_assets a
       LEFT JOIN work_units w ON w.id = a.work_unit_id
       WHERE a.file_url = $1 OR a.thumbnail_url = $1
       UNION ALL
       SELECT 'avatar'::text AS source_type,
              NULL::integer AS asset_id,
              u.deleted_at AS reference_deleted_at,
              u.id AS author_id,
              u.work_unit_id AS reference_work_unit_id,
              u.full_name AS title,
              FALSE AS is_primary_file,
              TRUE AS allow_download,
              (u.deleted_at IS NULL) AS is_public
       FROM users u
       WHERE u.avatar_url = $1
       UNION ALL
       SELECT 'announcement'::text AS source_type,
              NULL::integer AS asset_id,
              announcement.deleted_at AS reference_deleted_at,
              NULL::integer AS author_id,
              NULL::integer AS reference_work_unit_id,
              announcement.title,
              FALSE AS is_primary_file,
              TRUE AS allow_download,
              (announcement.is_published = TRUE AND announcement.deleted_at IS NULL) AS is_public
       FROM announcements announcement
       WHERE announcement.image_url = $1
       UNION ALL
       SELECT 'work_unit'::text, NULL::integer, unit.deleted_at,
              NULL::integer, unit.id, unit.name, FALSE, TRUE,
              (unit.deleted_at IS NULL AND NOT EXISTS (
                WITH RECURSIVE ancestors AS (
                  SELECT id, parent_id, is_public, deleted_at FROM work_units WHERE id = unit.id
                  UNION ALL
                  SELECT parent.id, parent.parent_id, parent.is_public, parent.deleted_at
                  FROM work_units parent INNER JOIN ancestors child ON child.parent_id = parent.id
                ) SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL OR is_public = FALSE
              ))
       FROM work_units unit WHERE unit.logo_url = $1
       UNION ALL
       SELECT 'category'::text, NULL::integer, category.deleted_at,
              NULL::integer, NULL::integer, category.name, FALSE, TRUE,
              (category.deleted_at IS NULL)
       FROM categories category WHERE category.logo_url = $1`,
      [fileName],
    );

    if (!rows.length) return res.status(404).json({ error: "File tidak terdaftar" });
    const downloadRequested = req.query.download === "1";
    const restrictedPublicDownload = downloadRequested && rows.find((row) => (
      row.source_type === "asset"
      && row.is_primary_file
      && row.is_public
      && row.allow_download === false
    ));
    const publicReference = rows.find((row) => (
      row.is_public
      && (!downloadRequested || row.source_type !== "asset" || !row.is_primary_file || row.allow_download)
    ));
    const loadedSession = publicReference ? null : await loadSession(req, { optional: true });
    let user = loadedSession?.user;
    if (user && req.get?.("X-KMS-Context-User")) {
      req.user = user;
      const context = await loadAccessContext(req);
      if (context?.error) return res.status(403).json({ error: context.error });
      user = context || user;
    }
    const readableAssets = new Set();
    const assetIds = rows.filter(row => row.source_type === "asset").map(row => row.asset_id);
    if (user && assetIds.length && !publicReference) {
      const values = [assetIds];
      const scope = assetReadPredicate(user, values, 'a', { allowReview: true });
      const accessible = await pool.query(`SELECT a.id FROM knowledge_assets a
        WHERE a.id = ANY($1::integer[]) AND a.deleted_at IS NULL AND ${scope}`, values);
      accessible.rows.forEach(row => readableAssets.add(Number(row.id)));
    }
    const privateReference = user
      ? rows.find((row) => {
        if (row.reference_deleted_at) return false;
        if (downloadRequested && row.source_type === "asset" && row.is_primary_file && row.allow_download === false) {
          return readableAssets.has(Number(row.asset_id)) && (row.author_id === user.id || user.environmentAdmin);
        }
        if (row.source_type === "asset") return readableAssets.has(Number(row.asset_id));
        return Boolean(user.environmentAdmin || (row.source_type === "avatar" && row.author_id === user.id)
          || (row.source_type === "announcement" && hasPermission(user, "announcements", "view"))
          || (row.source_type === "work_unit" && hasPermission(user, "work_units", "view"))
          || (row.source_type === "category" && hasPermission(user, "categories", "view")));
      })
      : null;
    const reference = publicReference || privateReference;
    if (!reference && restrictedPublicDownload) {
      return res.status(403).json({ error: "Unduhan file dinonaktifkan oleh penerbit" });
    }
    if (!reference) return res.status(404).json({ error: "File tidak tersedia" });

    return sendStoredMedia(req, res, {
      fileName,
      title: reference.title,
      isPublic: Boolean(publicReference),
    });
  } catch (error) {
    console.error("Error serving registered media:", error);
    return res.status(500).json({ error: "Gagal memuat file" });
  }
};

module.exports = { getMedia, sendStoredMedia };
