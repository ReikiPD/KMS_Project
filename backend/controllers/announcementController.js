const fs = require("fs/promises");
const pool = require("../database/db");
const { recordAudit } = require("../services/auditService");
const { resolveUploadFile } = require("../services/mediaService");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const auditActor = (req) => ({
  actorId: req.user.id || null,
  actorLabel: req.user.role === "admin" ? req.user.full_name : null,
  actorRole: req.user.role,
});

const removeFile = async (fileName) => {
  if (!fileName) return;
  try {
    await fs.unlink(resolveUploadFile(fileName));
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Gagal membersihkan gambar pengumuman ${fileName}: ${error.message}`);
  }
};

const cleanText = (value, maxLength) => String(value || "").trim().slice(0, maxLength);
const parseBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return value === true || value === "true" || value === "1";
};
const parseDisplayOrder = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.max(-10_000, Math.min(parsed, 10_000)) : 0;
};

const PUBLIC_ASSET_AVAILABLE = `(
  a.id IS NOT NULL
  AND a.is_published = TRUE
  AND a.deleted_at IS NULL
  AND (
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
  )
)`;

const assetReferenceClause = (value, values) => {
  const reference = String(value || "").trim();
  if (UUID_PATTERN.test(reference)) return `a.public_id = $${values.push(reference)}::uuid`;
  if (/^\d+$/.test(reference)) return `a.id = $${values.push(Number.parseInt(reference, 10))}`;
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(reference)) return `a.slug = $${values.push(reference)}`;
  return null;
};

const resolvePublicAsset = async (reference) => {
  if (!reference) return null;
  const values = [];
  const clause = assetReferenceClause(reference, values);
  if (!clause) return null;
  const { rows } = await pool.query(`
    SELECT a.id
    FROM knowledge_assets a
    LEFT JOIN work_units w ON a.work_unit_id = w.id
    LEFT JOIN work_units parent_w ON w.parent_id = parent_w.id
    WHERE ${clause} AND ${PUBLIC_ASSET_AVAILABLE}
    LIMIT 1`, values);
  return rows[0] || null;
};

const normalizeLink = (value) => {
  const link = cleanText(value, 1000);
  if (!link) return null;
  if (link.startsWith("/") && !link.startsWith("//")) return link;
  try {
    const parsed = new URL(link);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

const validatePayload = (body) => {
  const title = cleanText(body.title, 180);
  const content = cleanText(body.content, 4000);
  const rawLink = cleanText(body.linkUrl ?? body.link_url, 1000);
  const linkUrl = normalizeLink(rawLink);
  if (!title) return { error: "Judul pengumuman wajib diisi" };
  if (!content) return { error: "Isi pengumuman wajib diisi" };
  if (rawLink && !linkUrl) return { error: "Tautan harus berupa path internal atau alamat HTTPS yang valid" };
  return {
    title,
    content,
    linkUrl,
    linkLabel: cleanText(body.linkLabel ?? body.link_label, 60) || "Lihat selengkapnya",
    displayOrder: parseDisplayOrder(body.displayOrder ?? body.display_order),
    isPublished: parseBoolean(body.isPublished ?? body.is_published),
    assetReference: cleanText(body.assetId ?? body.asset_id, 255) || null,
  };
};

const identifierClause = (value, values) => {
  const identifier = String(value || "").trim();
  if (UUID_PATTERN.test(identifier)) return `public_id = $${values.push(identifier)}::uuid`;
  if (/^\d+$/.test(identifier)) return `id = $${values.push(Number.parseInt(identifier, 10))}`;
  return null;
};

const ANNOUNCEMENT_ASSET_JSON = `json_build_object(
  'public_id', a.public_id,
  'slug', a.slug,
  'title', a.title,
  'asset_type', a.asset_type,
  'thumbnail_url', a.thumbnail_url,
  'work_unit_name', w.name,
  'work_unit_alias', w.alias,
  'parent_work_unit_name', parent_w.name,
  'parent_work_unit_alias', parent_w.alias
)`;

const PUBLIC_SELECT = `
  SELECT n.public_id, n.title, n.content, n.image_url, n.link_url, n.link_label,
         n.display_order, n.created_at, n.updated_at,
         CASE WHEN ${PUBLIC_ASSET_AVAILABLE} THEN ${ANNOUNCEMENT_ASSET_JSON} ELSE NULL END AS asset
  FROM announcements n
  LEFT JOIN knowledge_assets a ON n.asset_id = a.id
  LEFT JOIN work_units w ON a.work_unit_id = w.id
  LEFT JOIN work_units parent_w ON w.parent_id = parent_w.id
`;

const getPublicAnnouncements = async (_req, res) => {
  try {
    const { rows } = await pool.query(`${PUBLIC_SELECT}
      WHERE n.is_published = TRUE AND n.deleted_at IS NULL
      ORDER BY n.display_order ASC, n.updated_at DESC, n.id DESC
      LIMIT 10`);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching public announcements:", error);
    return res.status(500).json({ error: "Gagal memuat pengumuman" });
  }
};

const getAdminAnnouncements = async (req, res) => {
  const q = cleanText(req.query.q, 120);
  const values = [];
  const filters = ["n.deleted_at IS NULL"];
  if (q) {
    values.push(`%${q}%`);
    filters.push(`(n.title ILIKE $${values.length} OR n.content ILIKE $${values.length} OR a.title ILIKE $${values.length})`);
  }
  try {
    const { rows } = await pool.query(`
      SELECT n.public_id, n.title, n.content, n.image_url, n.link_url, n.link_label,
             n.display_order, n.is_published, n.created_at, n.updated_at,
             CASE WHEN a.id IS NULL THEN NULL ELSE ${ANNOUNCEMENT_ASSET_JSON} END AS asset,
             ${PUBLIC_ASSET_AVAILABLE} AS asset_is_available
      FROM announcements n
      LEFT JOIN knowledge_assets a ON n.asset_id = a.id
      LEFT JOIN work_units w ON a.work_unit_id = w.id
      LEFT JOIN work_units parent_w ON w.parent_id = parent_w.id
      WHERE ${filters.join(" AND ")}
      ORDER BY n.display_order ASC, n.updated_at DESC, n.id DESC`, values);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching admin announcements:", error);
    return res.status(500).json({ error: "Gagal memuat daftar pengumuman" });
  }
};

const getAnnouncementAssetOptions = async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.public_id, a.slug, a.title, a.asset_type, a.thumbnail_url,
             w.name AS work_unit_name, w.alias AS work_unit_alias,
             parent_w.name AS parent_work_unit_name, parent_w.alias AS parent_work_unit_alias
      FROM knowledge_assets a
      LEFT JOIN work_units w ON a.work_unit_id = w.id
      LEFT JOIN work_units parent_w ON w.parent_id = parent_w.id
      WHERE ${PUBLIC_ASSET_AVAILABLE}
      ORDER BY a.title ASC, a.id ASC
      LIMIT 500`);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching announcement asset options:", error);
    return res.status(500).json({ error: "Gagal memuat pilihan aset pengumuman" });
  }
};

const createAnnouncement = async (req, res) => {
  const uploadedImage = req.file?.filename || null;
  const payload = validatePayload(req.body || {});
  if (payload.error) {
    await removeFile(uploadedImage);
    return res.status(400).json({ error: payload.error });
  }
  try {
    const referencedAsset = await resolvePublicAsset(payload.assetReference);
    if (payload.assetReference && !referencedAsset) {
      await removeFile(uploadedImage);
      return res.status(400).json({ error: "Aset referensi harus berupa aset terbit yang tampil di publik" });
    }
    const { rows } = await pool.query(`
      INSERT INTO announcements
        (title, content, image_url, asset_id, link_url, link_label, display_order, is_published, created_by_label)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, public_id, title, content, image_url, link_url, link_label,
                display_order, is_published, created_at, updated_at`, [
      payload.title,
      payload.content,
      uploadedImage,
      referencedAsset?.id || null,
      payload.linkUrl,
      payload.linkLabel,
      payload.displayOrder,
      payload.isPublished,
      req.user.full_name,
    ]);
    await recordAudit({ ...auditActor(req), action: "announcement.created", targetType: "announcement", targetId: rows[0].id, metadata: { isPublished: payload.isPublished, hasAssetReference: Boolean(referencedAsset) } });
    const { id: _id, ...announcement } = rows[0];
    return res.status(201).json({ message: "Pengumuman berhasil dibuat", announcement });
  } catch (error) {
    await removeFile(uploadedImage);
    console.error("Error creating announcement:", error);
    return res.status(500).json({ error: "Gagal membuat pengumuman" });
  }
};

const updateAnnouncement = async (req, res) => {
  const uploadedImage = req.file?.filename || null;
  const payload = validatePayload(req.body || {});
  if (payload.error) {
    await removeFile(uploadedImage);
    return res.status(400).json({ error: payload.error });
  }
  const values = [];
  const clause = identifierClause(req.params.id, values);
  if (!clause) {
    await removeFile(uploadedImage);
    return res.status(400).json({ error: "Referensi pengumuman tidak valid" });
  }

  try {
    const referencedAsset = await resolvePublicAsset(payload.assetReference);
    if (payload.assetReference && !referencedAsset) {
      await removeFile(uploadedImage);
      return res.status(400).json({ error: "Aset referensi harus berupa aset terbit yang tampil di publik" });
    }
    const currentResult = await pool.query(`SELECT id, image_url FROM announcements WHERE ${clause} AND deleted_at IS NULL`, values);
    const current = currentResult.rows[0];
    if (!current) {
      await removeFile(uploadedImage);
      return res.status(404).json({ error: "Pengumuman tidak ditemukan" });
    }
    const removeImage = parseBoolean(req.body.removeImage);
    const nextImage = uploadedImage || (removeImage ? null : current.image_url);
    const { rows } = await pool.query(`
      UPDATE announcements
      SET title = $1, content = $2, image_url = $3, asset_id = $4, link_url = $5, link_label = $6,
          display_order = $7, is_published = $8, updated_at = CURRENT_TIMESTAMP
      WHERE id = $9
      RETURNING public_id, title, content, image_url, link_url, link_label,
                display_order, is_published, created_at, updated_at`, [
      payload.title,
      payload.content,
      nextImage,
      referencedAsset?.id || null,
      payload.linkUrl,
      payload.linkLabel,
      payload.displayOrder,
      payload.isPublished,
      current.id,
    ]);
    if (current.image_url && current.image_url !== nextImage) await removeFile(current.image_url);
    await recordAudit({ ...auditActor(req), action: "announcement.updated", targetType: "announcement", targetId: current.id, metadata: { isPublished: payload.isPublished, hasAssetReference: Boolean(referencedAsset) } });
    return res.json({ message: "Pengumuman berhasil diperbarui", announcement: rows[0] });
  } catch (error) {
    await removeFile(uploadedImage);
    console.error("Error updating announcement:", error);
    return res.status(500).json({ error: "Gagal memperbarui pengumuman" });
  }
};

const deleteAnnouncement = async (req, res) => {
  const values = [];
  const clause = identifierClause(req.params.id, values);
  if (!clause) return res.status(400).json({ error: "Referensi pengumuman tidak valid" });
  try {
    const { rows } = await pool.query(`
      UPDATE announcements
      SET deleted_at = CURRENT_TIMESTAMP, is_published = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE ${clause} AND deleted_at IS NULL
      RETURNING id`, values);
    if (!rows[0]) return res.status(404).json({ error: "Pengumuman tidak ditemukan" });
    await recordAudit({ ...auditActor(req), action: "announcement.deleted", targetType: "announcement", targetId: rows[0].id });
    return res.json({ message: "Pengumuman berhasil dihapus" });
  } catch (error) {
    console.error("Error deleting announcement:", error);
    return res.status(500).json({ error: "Gagal menghapus pengumuman" });
  }
};

module.exports = {
  createAnnouncement,
  deleteAnnouncement,
  getAdminAnnouncements,
  getAnnouncementAssetOptions,
  getPublicAnnouncements,
  updateAnnouncement,
};
