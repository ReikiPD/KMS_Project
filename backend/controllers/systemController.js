const fs = require("fs/promises");
const path = require("path");
const pool = require("../database/db");
const { uploadsDirectory } = require("../config/storage");

const CACHE_TTL_MS = 30_000;
let cachedSnapshot = null;
let snapshotPromise = null;

const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const localFileName = (value) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll("\\", "/");
  if (!normalized || /^(?:https?:|data:|blob:)/i.test(normalized)) return null;
  const fileName = path.posix.basename(normalized);
  return fileName && fileName !== "." && fileName !== ".." ? fileName : null;
};

const mediaGroup = (fileName) => {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".pdf") return "documents";
  if ([".mp4", ".webm", ".ogg"].includes(extension)) return "videos";
  if ([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(extension)) return "images";
  return "other";
};

const scanUploads = async () => {
  const entries = await fs.readdir(uploadsDirectory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const breakdown = {
    documents: { files: 0, bytes: 0 },
    videos: { files: 0, bytes: 0 },
    images: { files: 0, bytes: 0 },
    other: { files: 0, bytes: 0 },
  };
  const names = new Set();
  let totalBytes = 0;

  // Batasi operasi filesystem paralel agar panel monitoring tidak membuat
  // lonjakan I/O ketika jumlah unggahan sudah besar.
  const batchSize = 64;
  for (let index = 0; index < files.length; index += batchSize) {
    const batch = files.slice(index, index + batchSize);
    const statsBatch = await Promise.all(batch.map((entry) => (
      fs.stat(path.join(uploadsDirectory, entry.name))
    )));

    batch.forEach((entry, batchIndex) => {
      const bytes = toSafeNumber(statsBatch[batchIndex].size);
      const group = mediaGroup(entry.name);
      names.add(entry.name);
      totalBytes += bytes;
      breakdown[group].files += 1;
      breakdown[group].bytes += bytes;
    });
  }

  return { names, totalBytes, fileCount: files.length, breakdown };
};

const buildSnapshot = async () => {
  const [databaseResult, contentResult, referenceResult, fileSystem, uploadScan] = await Promise.all([
    pool.query("SELECT pg_database_size(current_database())::bigint AS size_bytes"),
    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_assets,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_published = TRUE)::int AS published_assets,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND is_published = FALSE)::int AS draft_assets,
        COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted_assets,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND file_url IS NULL)::int AS missing_main_file,
        COUNT(*) FILTER (WHERE deleted_at IS NULL AND thumbnail_url IS NULL)::int AS missing_thumbnail
      FROM knowledge_assets
    `),
    pool.query(`
      SELECT file_reference FROM (
        SELECT file_url AS file_reference FROM knowledge_assets
        UNION ALL SELECT thumbnail_url FROM knowledge_assets
        UNION ALL SELECT avatar_url FROM users
        UNION ALL SELECT image_url FROM announcements
      ) references_all
      WHERE file_reference IS NOT NULL
    `),
    fs.statfs(uploadsDirectory),
    scanUploads(),
  ]);

  const referencedFiles = new Set(referenceResult.rows.map((row) => localFileName(row.file_reference)).filter(Boolean));
  const orphanCount = [...uploadScan.names].filter((fileName) => !referencedFiles.has(fileName)).length;
  const missingReferencedCount = [...referencedFiles].filter((fileName) => !uploadScan.names.has(fileName)).length;
  const totalBytes = toSafeNumber(fileSystem.blocks) * toSafeNumber(fileSystem.bsize);
  const freeBytes = toSafeNumber(fileSystem.bavail) * toSafeNumber(fileSystem.bsize);
  const usedBytes = Math.max(0, totalBytes - freeBytes);
  const memory = process.memoryUsage();
  const content = contentResult.rows[0] || {};
  const warningCount = orphanCount + missingReferencedCount + toSafeNumber(content.missing_main_file);
  const usedPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;

  return {
    generatedAt: new Date().toISOString(),
    status: usedPercent >= 90 || missingReferencedCount > 0 ? "warning" : "healthy",
    services: {
      api: { status: "online", uptimeSeconds: Math.floor(process.uptime()) },
      database: {
        status: "online",
        sizeBytes: toSafeNumber(databaseResult.rows[0]?.size_bytes),
        pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
      },
    },
    memory: {
      residentBytes: toSafeNumber(memory.rss),
      heapUsedBytes: toSafeNumber(memory.heapUsed),
      heapTotalBytes: toSafeNumber(memory.heapTotal),
    },
    storage: {
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent,
      uploadsBytes: uploadScan.totalBytes,
      uploadFileCount: uploadScan.fileCount,
      breakdown: uploadScan.breakdown,
      orphanCount,
      missingReferencedCount,
    },
    content: {
      activeAssets: toSafeNumber(content.active_assets),
      publishedAssets: toSafeNumber(content.published_assets),
      draftAssets: toSafeNumber(content.draft_assets),
      deletedAssets: toSafeNumber(content.deleted_assets),
      missingMainFile: toSafeNumber(content.missing_main_file),
      missingThumbnail: toSafeNumber(content.missing_thumbnail),
    },
    warnings: warningCount,
  };
};

const getSystemHealth = async (_req, res) => {
  try {
    const now = Date.now();
    if (cachedSnapshot && now - cachedSnapshot.createdAt < CACHE_TTL_MS) {
      return res.json(cachedSnapshot.value);
    }

    snapshotPromise ||= buildSnapshot();
    const value = await snapshotPromise;
    cachedSnapshot = { createdAt: now, value };
    snapshotPromise = null;
    res.set("Cache-Control", "private, no-store");
    return res.json(value);
  } catch (error) {
    snapshotPromise = null;
    console.error("Error reading KMS system health:", error.message);
    return res.status(500).json({ error: "Status sistem belum dapat dimuat" });
  }
};

module.exports = { getSystemHealth };
