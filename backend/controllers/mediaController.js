const fs = require("fs/promises");
const path = require("path");
const pool = require("../database/db");
const { uploads } = require("../config/env");
const { resolveUploadFile } = require("../services/mediaService");
const { loadSession } = require("../services/sessionService");

const { hasPermission } = require("../services/permissionService");
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

const sendStoredMedia = async (req, res, { fileName, title, isPublic }) => {
  let filePath;
  try {
    filePath = resolveUploadFile(fileName);
    await fs.access(filePath);
  } catch {
    return res.status(404).json({ error: "File tidak ditemukan pada penyimpanan" });
  }

  const download = req.query.download === "1";
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
              NULL::integer AS author_id,
              NULL::integer AS reference_work_unit_id,
              announcement.title,
              FALSE AS is_primary_file,
              TRUE AS allow_download,
              (announcement.is_published = TRUE AND announcement.deleted_at IS NULL) AS is_public
       FROM announcements announcement
       WHERE announcement.image_url = $1`,
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
    const user = loadedSession?.user;
    const scopedReferenceIds = new Set();
    const referenceWorkUnitIds = [...new Set(rows
      .filter((row) => row.source_type === "asset" && row.reference_work_unit_id)
      .map((row) => Number(row.reference_work_unit_id)))];
    if (user?.work_unit_id && referenceWorkUnitIds.length && (
      hasPermission(user, "staff_management", "view")
      || hasPermission(user, "asset_verification", "view")
    )) {
      const scopedResult = await pool.query(
        `WITH RECURSIVE scoped_units AS (
           SELECT id FROM work_units WHERE id = $1 AND deleted_at IS NULL
           UNION ALL
           SELECT child.id FROM work_units child
           INNER JOIN scoped_units parent_scope ON child.parent_id = parent_scope.id
           WHERE child.deleted_at IS NULL
         )
         SELECT id FROM scoped_units WHERE id = ANY($2::INTEGER[])`,
        [Number(user.work_unit_id), referenceWorkUnitIds],
      );
      scopedResult.rows.forEach((row) => scopedReferenceIds.add(Number(row.id)));
    }
    const privateReference = user && user.role !== "user" && (
      hasPermission(user, "assets", "view") || hasPermission(user, "asset_verification", "view")
    )
      ? rows.find((row) => {
        if (downloadRequested && row.source_type === "asset" && row.is_primary_file && row.allow_download === false) {
          return user.role === "admin" || row.author_id === user.id;
        }
        return user.role === "admin"
          || (row.source_type !== "announcement" && (
            row.author_id === user.id
            || (row.source_type === "asset" && scopedReferenceIds.has(Number(row.reference_work_unit_id)))
          ));
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

module.exports = { getMedia };
