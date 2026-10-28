const pool = require("../../config/db");
const { recordAudit } = require("../../services/auditService");
const { readFeaturedVisibility, saveFeaturedVisibility } = require("../../services/homepageSettingsService");
const { validateFeaturedSlots, readFeaturedSettings, readLegacyManual, defaultFeaturedSlots, resolveFeaturedSlots } = require("../../services/featuredSlotsService");
const {
  PUBLIC_WORK_UNIT_FILTER,
  PUBLIC_ASSET_CARD_SELECT,
  addAssetIdentifierFilter,
  getRequestedAuthorId,
  auditActor,
} = require("./shared");

const getFeaturedAssets = async (_req, res) => {
  // Do not let a browser/proxy keep displaying the section after it is hidden.
  res.set("Cache-Control", "no-store");
  try {
    const settings = await readFeaturedSettings(pool);
    if (!settings.featuredEnabled) return res.json([]);
    if (settings.slots) {
      const resolved = await resolveFeaturedSlots(pool, settings.slots, { select: PUBLIC_ASSET_CARD_SELECT, visibility: PUBLIC_WORK_UNIT_FILTER });
      return res.json(resolved.flatMap(slot => slot.asset ? [slot.asset] : []));
    }
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

const featuredProjection = { select: PUBLIC_ASSET_CARD_SELECT, visibility: PUBLIC_WORK_UNIT_FILTER };

const getFeaturedSettings = async (_req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const settings = await readFeaturedSettings(pool);
    const slots = settings.slots || defaultFeaturedSlots(await readLegacyManual(pool, featuredProjection));
    const preview = await resolveFeaturedSlots(pool, slots, featuredProjection);
    return res.json({ ...settings, slots, configured: Boolean(settings.slots), preview });
  } catch (error) {
    console.error("Error fetching featured settings:", error);
    return res.status(500).json({ error: "Pengaturan sorotan belum dapat dimuat." });
  }
};

const previewFeaturedSettings = async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const slots = validateFeaturedSlots(req.body?.slots);
    return res.json({ preview: await resolveFeaturedSlots(pool, slots, featuredProjection) });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error("Error previewing featured settings:", error);
    return res.status(500).json({ error: "Pratinjau sorotan belum dapat dimuat." });
  }
};

const updateFeaturedSettings = async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  let client;
  try {
    const slots = validateFeaturedSlots(req.body?.slots);
    if (typeof req.body?.featuredEnabled !== 'boolean') return res.status(400).json({ error: "featuredEnabled harus berupa boolean." });
    client = await pool.connect();
    await client.query('BEGIN');
    const previous = await client.query('SELECT featured_slots FROM homepage_settings WHERE id = 1 FOR UPDATE');
    if (!previous.rows[0]) throw new Error('Pengaturan homepage belum tersedia; jalankan migrasi database.');
    const oldIds = new Set((previous.rows[0].featured_slots || []).filter(slot => slot.mode === 'manual' && slot.assetId).map(slot => slot.assetId.toLowerCase()));
    const newHiddenIds = slots.filter(slot => slot.hidden && slot.mode === 'manual' && slot.assetId && !oldIds.has(slot.assetId)).map(slot => slot.assetId);
    if (newHiddenIds.length) {
      const available = await client.query(`${PUBLIC_ASSET_CARD_SELECT} WHERE a.is_published = TRUE AND a.deleted_at IS NULL AND ${PUBLIC_WORK_UNIT_FILTER} AND a.public_id = ANY($1::uuid[])`, [newHiddenIds]);
      const availableIds = new Set(available.rows.map(asset => asset.public_id.toLowerCase()));
      if (newHiddenIds.some(id => !availableIds.has(id))) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: "Aset pilihan manual tidak lagi tersedia untuk publik. Pilih aset lain." });
      }
    }
    const preview = await resolveFeaturedSlots(client, slots, featuredProjection);
    // A previously saved manual choice may stay unavailable and use its fallback;
    // newly selected choices must still be public when the save reaches the server.
    if (preview.some((result, index) => result.unavailable && !oldIds.has(slots[index].assetId))) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: "Aset pilihan manual tidak lagi tersedia untuk publik. Pilih aset lain." });
    }
    await client.query('UPDATE homepage_settings SET featured_enabled = $1, featured_slots = $2::jsonb, updated_at = CURRENT_TIMESTAMP WHERE id = 1', [req.body.featuredEnabled, JSON.stringify(slots)]);
    await client.query('COMMIT');
    await recordAudit({ ...auditActor(req), action: 'homepage.featured_settings_updated', targetType: 'homepage_settings', targetId: 1, metadata: { featuredEnabled: req.body.featuredEnabled, slots } });
    return res.json({ featuredEnabled: req.body.featuredEnabled, slots, configured: true, preview });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error("Error updating featured settings:", error);
    return res.status(500).json({ error: "Pengaturan sorotan belum berhasil disimpan." });
  } finally { client?.release(); }
};

const getFeaturedVisibility = async (_req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    return res.json({ featuredEnabled: await readFeaturedVisibility(pool) });
  } catch (error) {
    console.error("Error fetching featured visibility:", error);
    return res.status(500).json({ error: "Pengaturan sorotan belum dapat dimuat." });
  }
};

const updateFeaturedVisibility = async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const featuredEnabled = await saveFeaturedVisibility(pool, req.body?.featuredEnabled);
    await recordAudit({
      ...auditActor(req),
      action: "homepage.featured_visibility_updated",
      targetType: "homepage_settings",
      targetId: 1,
      metadata: { featuredEnabled },
    });
    return res.json({ featuredEnabled });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error("Error updating featured visibility:", error);
    return res.status(500).json({ error: "Pengaturan sorotan belum berhasil disimpan." });
  }
};

const updateFeaturedStatus = async (req, res) => {
  const shouldFeature = req.body?.isFeatured === true || req.body?.isFeatured === "true";
  const scope = getRequestedAuthorId(req, req.query.authorId, true);
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

module.exports = {
  getFeaturedAssets,
  getFeaturedSettings,
  updateFeaturedSettings,
  previewFeaturedSettings,
  getFeaturedVisibility,
  updateFeaturedVisibility,
  updateFeaturedStatus,
};
