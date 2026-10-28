const readFeaturedVisibility = async (database) => {
  const { rows } = await database.query(
    "SELECT featured_enabled FROM homepage_settings WHERE id = 1",
  );
  if (!rows[0]) throw new Error("Pengaturan homepage belum tersedia; jalankan migrasi database.");
  return rows[0].featured_enabled;
};

const saveFeaturedVisibility = async (database, enabled) => {
  if (typeof enabled !== "boolean") {
    throw Object.assign(new Error("featuredEnabled harus berupa boolean."), { status: 400 });
  }
  const { rows } = await database.query(
    `UPDATE homepage_settings SET featured_enabled = $1::boolean, updated_at = CURRENT_TIMESTAMP
     WHERE id = 1 RETURNING featured_enabled`,
    [enabled],
  );
  if (!rows[0]) throw new Error("Pengaturan homepage belum tersedia; jalankan migrasi database.");
  return rows[0].featured_enabled;
};

module.exports = { readFeaturedVisibility, saveFeaturedVisibility };
