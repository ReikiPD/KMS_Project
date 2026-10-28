const pool = require("../../config/db");
const { getPositiveInteger } = require("../../utils");
const { queryWithAssetVersion, setAssetVersionActor, getVersionFiles } = require("../../services/assetVersionService");
const fs = require("fs/promises");
const path = require("path");
const { recordAudit } = require("../../services/auditService");
const { uploadsDirectory } = require("../../services/mediaService");
const {
  addAssetIdentifierFilter,
  getAvailableSlug,
  getRequestedAuthorId,
  auditActor,
} = require("./shared");

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
    const [assetReferences, avatarReferences, versionFiles, announcementReferences] = await Promise.all([
      pool.query("SELECT file_url, thumbnail_url FROM knowledge_assets"),
      pool.query("SELECT avatar_url FROM users"),
      pool.query("SELECT snapshot->>'file_url' AS file_url, snapshot->>'thumbnail_url' AS thumbnail_url FROM asset_versions"),
      pool.query("SELECT image_url FROM announcements"),
    ]);
    referencedFiles = new Set([
      ...assetReferences.rows.flatMap((asset) => [asset.file_url, asset.thumbnail_url]),
      ...avatarReferences.rows.map((user) => user.avatar_url),
      ...versionFiles.rows.flatMap((asset) => [asset.file_url, asset.thumbnail_url]),
      ...announcementReferences.rows.map((item) => item.image_url),
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

    const { rows } = await queryWithAssetVersion(pool, req,
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
      "restore",
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
    await setAssetVersionActor(client, req, "restore");
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
  let historicalFiles = [];
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
    historicalFiles = await getVersionFiles(client, deletedAssets.map((asset) => asset.id));
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
    [...historicalFiles, ...deletedAssets.flatMap((asset) => [asset.file_url, asset.thumbnail_url])],
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

module.exports = {
  getDeletedAssets,
  restoreAsset,
  restoreAssetsBulk,
  permanentlyDeleteAssets,
};
