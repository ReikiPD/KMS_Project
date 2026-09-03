const fs = require("fs/promises");
const path = require("path");
const pool = require("../database/db");
const { uploadsDirectory } = require("../config/storage");
const { recordAudit } = require("./auditService");

const safeFileName = (value) => {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate && path.basename(candidate) === candidate ? candidate : null;
};

const removeUnreferencedFiles = async (values) => {
  const candidates = [...new Set(values.map(safeFileName).filter(Boolean))];
  if (!candidates.length) return { deleted: [], failed: [] };
  const { rows } = await pool.query(
    `SELECT file_name FROM (
       SELECT file_url AS file_name FROM knowledge_assets WHERE file_url = ANY($1::text[])
       UNION ALL
       SELECT thumbnail_url FROM knowledge_assets WHERE thumbnail_url = ANY($1::text[])
       UNION ALL
       SELECT avatar_url FROM users WHERE avatar_url = ANY($1::text[])
       UNION ALL
       SELECT image_url FROM announcements WHERE image_url = ANY($1::text[])
     ) references
     WHERE file_name IS NOT NULL`,
    [candidates],
  );
  const referenced = new Set(rows.map((row) => row.file_name));
  const deleted = [];
  const failed = [];

  for (const fileName of candidates) {
    if (referenced.has(fileName)) continue;
    const target = path.resolve(uploadsDirectory, fileName);
    if (path.dirname(target) !== path.resolve(uploadsDirectory)) continue;
    try {
      await fs.unlink(target);
      deleted.push(fileName);
    } catch (error) {
      if (error.code !== "ENOENT") failed.push({ fileName, error: error.message });
    }
  }
  return { deleted, failed };
};

const purgeExpiredAssets = async ({ batchSize = 100 } = {}) => {
  const limit = Math.max(1, Math.min(Number(batchSize) || 100, 500));
  const client = await pool.connect();
  let assets = [];
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id, title, file_url, thumbnail_url, deleted_at
       FROM knowledge_assets
       WHERE deleted_at IS NOT NULL
         AND deleted_at <= CURRENT_TIMESTAMP - INTERVAL '1 month'
       ORDER BY deleted_at ASC, id ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    assets = rows;
    if (assets.length) {
      await client.query("DELETE FROM knowledge_assets WHERE id = ANY($1::integer[])", [assets.map((asset) => asset.id)]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  if (!assets.length) return { count: 0, deletedIds: [], fileCleanup: { deleted: [], failed: [] } };
  const fileCleanup = await removeUnreferencedFiles(assets.flatMap((asset) => [asset.file_url, asset.thumbnail_url]));
  await recordAudit({
    actorLabel: "Sistem Retensi KMS",
    actorRole: "system",
    action: "asset.retention_purged",
    targetType: "asset_batch",
    metadata: {
      retention: "1 month",
      ids: assets.map((asset) => asset.id),
      count: assets.length,
      deletedFiles: fileCleanup.deleted,
      fileCleanupFailures: fileCleanup.failed,
    },
  });
  return { count: assets.length, deletedIds: assets.map((asset) => asset.id), fileCleanup };
};

module.exports = { purgeExpiredAssets };
