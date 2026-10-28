const pool = require('../config/db');
const { omitFields } = require('../utils');
const { hasPermission, hasOrganizationScope } = require('../services/permissionService');
const { assetReadPredicate } = require('../services/assetAccessService');
const { sendStoredMedia } = require('./mediaController');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const subjectOf = (req) => req.accessContext || req.user;
const globalAdmin = (req) => Boolean(subjectOf(req)?.environmentAdmin);

// This scope is applied on every list, detail and file request, not only in the UI.
const findAccessibleAsset = async (req) => {
  const subject = subjectOf(req);
  const assetView = hasPermission(subject, 'assets', 'view');
  const reviewView = hasPermission(subject, 'asset_verification', 'view');
  if (!req.user || (!assetView && !reviewView)) return null;
  const reference = String(req.params.id || '').trim();
  if (!reference || reference.length > 255) return null;
  const values = [reference];
  const scope = assetReadPredicate(subject, values, 'a', { allowReview: true });
  const deleted = hasOrganizationScope(subject) && hasPermission(subject, 'asset_recovery', 'view');
  const { rows } = await pool.query(
    `SELECT a.id, a.title, a.author_id, a.allow_download
     FROM knowledge_assets a
     WHERE (a.public_id::text = $1 OR a.slug = $1)
       AND ((a.deleted_at IS NULL AND ${scope})
         OR (a.deleted_at IS NOT NULL AND $${values.push(deleted)}::boolean))`,
    values,
  );
  return rows[0] || null;
};

const presentVersion = (row) => ({
  public_id: row.public_id,
  version_number: row.version_number,
  created_at: row.created_at,
  changed_fields: row.changed_fields,
  source: row.source,
  actor: {
    name: row.actor?.name || (row.source === 'baseline' ? 'Data awal' : 'Sistem / migrasi'),
    role: row.actor?.role || null,
    context_name: row.actor?.context_name || null,
  },
});

const presentSnapshot = (snapshot = {}) => {
  // Do not return internal IDs or storage paths to the browser.
  return {
    ...omitFields(snapshot, ['category_id', 'work_unit_id', 'author_id', 'reviewed_by', 'file_url', 'thumbnail_url']),
    has_file: Boolean(snapshot.file_url),
    has_thumbnail: Boolean(snapshot.thumbnail_url),
  };
};

const getAssetVersions = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const asset = await findAccessibleAsset(req);
    if (!asset) return res.status(404).json({ error: 'Riwayat aset tidak ditemukan atau berada di luar akses Anda.' });
    const page = Math.max(1, Math.min(Number.parseInt(req.query.page, 10) || 1, 100000));
    const { rows } = await pool.query(
      `SELECT public_id, version_number, created_at, changed_fields, source, actor,
              COUNT(*) OVER()::integer AS total
       FROM asset_versions WHERE asset_id = $1
       ORDER BY version_number DESC LIMIT 10 OFFSET $2`, [asset.id, (page - 1) * 10],
    );
    return res.json({ data: rows.map(presentVersion), page, total: rows[0]?.total || 0 });
  } catch (error) {
    console.error('Error fetching asset versions:', error);
    return res.status(500).json({ error: 'Gagal memuat riwayat versi aset.' });
  }
};

const getAssetVersion = async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const asset = await findAccessibleAsset(req);
    if (!asset || !UUID.test(req.params.versionId || '')) return res.status(404).json({ error: 'Versi tidak ditemukan atau tidak dapat diakses.' });
    const { rows } = await pool.query(
      `SELECT v.*, previous.snapshot AS previous_snapshot
       FROM asset_versions v
       LEFT JOIN asset_versions previous ON previous.asset_id = v.asset_id
         AND previous.version_number = v.version_number - 1
       WHERE v.asset_id = $1 AND v.public_id = $2::uuid`, [asset.id, req.params.versionId],
    );
    const version = rows[0];
    if (!version) return res.status(404).json({ error: 'Versi tidak ditemukan.' });
    const canDownload = globalAdmin(req) || Number(asset.author_id) === Number(subjectOf(req)?.id)
      || (asset.allow_download !== false && version.snapshot.allow_download !== false);
    if (req.params.kind) {
      const key = { file: 'file_url', thumbnail: 'thumbnail_url' }[req.params.kind];
      if (!key || !version.snapshot[key]) return res.status(404).json({ error: 'File versi ini tidak tersedia.' });
      if (!canDownload) return res.status(403).json({ error: 'Publisher membatasi unduhan aset ini.' });
      return sendStoredMedia(req, res, {
        fileName: version.snapshot[key], title: `${version.snapshot.title}-versi-${version.version_number}`,
        isPublic: false, forceDownload: true,
      });
    }
    return res.json({
      ...presentVersion(version), snapshot: presentSnapshot(version.snapshot),
      previous_snapshot: version.previous_snapshot ? presentSnapshot(version.previous_snapshot) : null,
      can_download: canDownload,
    });
  } catch (error) {
    console.error('Error fetching asset version:', error);
    return res.status(500).json({ error: 'Gagal memuat detail versi aset.' });
  }
};

module.exports = { getAssetVersions, getAssetVersion, findAccessibleAsset };
