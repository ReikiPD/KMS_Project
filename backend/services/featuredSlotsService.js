const { PUBLIC_ID_PATTERN } = require('../utils');
const invalid = message => Object.assign(new Error(message), { status: 400 });

const validateFeaturedSlots = slots => {
  if (!Array.isArray(slots) || slots.length !== 3) throw invalid('Pengaturan harus berisi tepat tiga posisi kartu.');
  const manualIds = new Set();
  return slots.map((slot, index) => {
    if (!slot || !['manual', 'popular', 'latest'].includes(slot.mode)) throw invalid(`Metode Kartu ${index + 1} tidak valid.`);
    if (slot.hidden !== undefined && typeof slot.hidden !== 'boolean') throw invalid(`Pilihan tampil Kartu ${index + 1} harus berupa boolean.`);
    const visibility = slot.hidden ? { hidden: true } : {};
    if (slot.mode !== 'manual') return { mode: slot.mode, ...visibility };
    if (slot.hidden && [undefined, null, ''].includes(slot.assetId)) return { mode: 'manual', ...visibility };
    if (typeof slot.assetId !== 'string' || !PUBLIC_ID_PATTERN.test(slot.assetId)) throw invalid(`Pilih aset publik untuk Kartu ${index + 1}.`);
    const assetId = slot.assetId.toLowerCase();
    if (!slot.hidden && manualIds.has(assetId)) throw invalid('Pilihan manual tidak boleh menggunakan aset yang sama pada dua posisi.');
    if (!slot.hidden) manualIds.add(assetId);
    return { mode: 'manual', assetId, ...visibility };
  });
};

const readFeaturedSettings = async database => {
  const { rows } = await database.query('SELECT featured_enabled, featured_slots FROM homepage_settings WHERE id = 1');
  if (!rows[0]) throw new Error('Pengaturan homepage belum tersedia; jalankan migrasi database.');
  return { featuredEnabled: rows[0].featured_enabled, slots: rows[0].featured_slots ?? null };
};

// Reuse the public card projection and recursive unit visibility rule verbatim.
const publicQuery = ({ select, visibility }, condition = '') => `${select}
  WHERE a.is_published = TRUE AND a.deleted_at IS NULL AND ${visibility} ${condition}`;

const readLegacyManual = async (database, projection) => {
  const { rows } = await database.query(`${publicQuery(projection, 'AND a.is_featured = TRUE')}
    ORDER BY a.created_at DESC, a.id DESC LIMIT 3`);
  return rows;
};

const defaultFeaturedSlots = assets => Array.from({ length: 3 }, (_, index) => assets[index]
  ? { mode: 'manual', assetId: assets[index].public_id } : { mode: 'popular' });

const resolveFeaturedSlots = async (database, input, projection) => {
  const slots = validateFeaturedSlots(input);
  const manualIds = slots.filter(slot => slot.mode === 'manual' && !slot.hidden).map(slot => slot.assetId);
  const manual = manualIds.length ? (await database.query(publicQuery(projection, 'AND a.public_id = ANY($1::uuid[])'), [manualIds])).rows : [];
  const byId = new Map(manual.map(asset => [asset.public_id.toLowerCase(), asset]));
  // Reserve all surviving manual choices, even if their position comes last.
  const excluded = new Set(byId.keys());
  const resolved = [];
  for (const [index, slot] of slots.entries()) {
    if (slot.hidden) {
      resolved.push({ position: index + 1, hidden: true, asset: null, unavailable: false });
      continue;
    }
    let asset = slot.mode === 'manual' ? byId.get(slot.assetId) : null;
    const unavailable = slot.mode === 'manual' && !asset;
    if (!asset) {
      const order = slot.mode === 'popular' ? 'COALESCE(a.view_count, 0) DESC, a.created_at DESC, a.id DESC' : 'a.created_at DESC, a.id DESC';
      const result = await database.query(`${publicQuery(projection, 'AND NOT (a.public_id = ANY($1::uuid[]))')}
        ORDER BY ${order} LIMIT 1`, [[...excluded]]);
      asset = result.rows[0] || null;
      if (asset) excluded.add(asset.public_id.toLowerCase());
    }
    resolved.push({ position: index + 1, asset, unavailable: Boolean(unavailable) });
  }
  return resolved;
};

module.exports = { validateFeaturedSlots, readFeaturedSettings, readLegacyManual, defaultFeaturedSlots, resolveFeaturedSlots };
