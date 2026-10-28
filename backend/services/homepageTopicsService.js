const MAX_TOPICS = 8;
const invalid = message => Object.assign(new Error(message), { status: 400 });

const validateTopicIds = ids => {
  if (!Array.isArray(ids) || ids.length > MAX_TOPICS) throw invalid(`Pilih maksimal ${MAX_TOPICS} topik.`);
  if (ids.some(id => !Number.isInteger(id) || id < 1 || id > 2147483647)) throw invalid('Pilihan topik harus menggunakan ID kategori yang valid.');
  if (new Set(ids).size !== ids.length) throw invalid('Topik yang sama tidak boleh dipilih lebih dari sekali.');
  return [...ids];
};

const readHomepageTopics = async database => {
  const { rows } = await database.query('SELECT topic_category_ids FROM homepage_settings WHERE id = 1');
  if (!rows[0]) throw new Error('Pengaturan homepage belum tersedia; jalankan migrasi database.');
  const configured = rows[0].topic_category_ids !== null;
  const ids = configured ? validateTopicIds(rows[0].topic_category_ids) : null;
  // NULL keeps the existing first-five-category behavior until the first save.
  const result = await database.query(
    `SELECT id, name, slug, logo_url FROM categories WHERE deleted_at IS NULL${configured ? ' AND id = ANY($1::integer[])' : ''} ORDER BY id ASC${configured ? '' : ' LIMIT 5'}`,
    configured ? [ids] : [],
  );
  const byId = new Map(result.rows.map(category => [category.id, category]));
  const categoryIds = ids ?? result.rows.map(category => category.id);
  return {
    configured,
    categoryIds,
    topics: categoryIds.flatMap(id => byId.has(id) ? [byId.get(id)] : []),
    unavailableIds: categoryIds.filter(id => !byId.has(id)),
  };
};

const saveHomepageTopics = async (database, categoryIds) => {
  const ids = validateTopicIds(categoryIds);
  // Call inside a transaction: serialize settings updates and protect categories
  // from deletion until the short write completes. Never acquire a table lock.
  const settings = await database.query('SELECT id FROM homepage_settings WHERE id = 1 FOR UPDATE');
  if (!settings.rows[0]) throw new Error('Pengaturan homepage belum tersedia; jalankan migrasi database.');
  const { rows } = await database.query('SELECT id, name, slug, logo_url FROM categories WHERE id = ANY($1::integer[]) AND deleted_at IS NULL ORDER BY id FOR SHARE', [ids]);
  if (rows.length !== ids.length) throw Object.assign(new Error('Sebagian kategori tidak lagi tersedia. Hapus atau ganti topik tersebut.'), { status: 409 });
  await database.query('UPDATE homepage_settings SET topic_category_ids = $1::integer[], updated_at = CURRENT_TIMESTAMP WHERE id = 1', [ids]);
  const byId = new Map(rows.map(category => [category.id, category]));
  return { configured: true, categoryIds: ids, topics: ids.map(id => byId.get(id)), unavailableIds: [] };
};

module.exports = { MAX_TOPICS, validateTopicIds, readHomepageTopics, saveHomepageTopics };
