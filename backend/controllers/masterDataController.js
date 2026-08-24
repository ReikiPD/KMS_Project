const pool = require("../database/db");

const sendDatabaseError = (res, message, error) => res.status(500).json({
  error: message,
  detail: error.message,
});

const getAllCategories = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY id ASC",
    );
    return res.json(rows);
  } catch (error) {
    return sendDatabaseError(res, "Gagal mengambil kategori", error);
  }
};

const createCategory = async (req, res) => {
  const { name, slug, description } = req.body;
  try {
    const { rows } = await pool.query(
      "INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3) RETURNING *",
      [name, slug, description],
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    return sendDatabaseError(res, "Gagal membuat kategori", error);
  }
};

const updateCategory = async (req, res) => {
  const { name, slug, description } = req.body;
  try {
    const { rows } = await pool.query(
      "UPDATE categories SET name=$1, slug=$2, description=$3 WHERE id=$4 RETURNING *",
      [name, slug, description, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Kategori tidak ditemukan" });
    return res.json(rows[0]);
  } catch (error) {
    return sendDatabaseError(res, "Gagal mengubah kategori", error);
  }
};

const deleteCategory = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id=$1 AND deleted_at IS NULL RETURNING id",
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Kategori tidak ditemukan" });
    return res.json({ message: "Kategori berhasil diarsipkan (soft delete)" });
  } catch (error) {
    return sendDatabaseError(res, "Gagal menghapus kategori", error);
  }
};

const getAllWorkUnits = async (req, res) => {
  try {
    const query = req.query.withAssetCount === "true"
      ? `SELECT w.*, COUNT(a.id)::INTEGER AS asset_count
         FROM work_units w
         LEFT JOIN knowledge_assets a
           ON a.work_unit_id = w.id
           AND a.is_published = TRUE
           AND a.deleted_at IS NULL
         WHERE w.deleted_at IS NULL
         GROUP BY w.id
         ORDER BY w.id ASC`
      : "SELECT * FROM work_units WHERE deleted_at IS NULL ORDER BY id ASC";
    const { rows } = await pool.query(query);
    return res.json(rows);
  } catch (error) {
    return sendDatabaseError(res, "Gagal mengambil unit kerja", error);
  }
};

const createWorkUnit = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "INSERT INTO work_units (name) VALUES ($1) RETURNING *",
      [req.body.name],
    );
    return res.status(201).json(rows[0]);
  } catch (error) {
    return sendDatabaseError(res, "Gagal membuat unit kerja", error);
  }
};

const updateWorkUnit = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE work_units SET name=$1 WHERE id=$2 RETURNING *",
      [req.body.name, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Unit kerja tidak ditemukan" });
    return res.json(rows[0]);
  } catch (error) {
    return sendDatabaseError(res, "Gagal mengubah unit kerja", error);
  }
};

const deleteWorkUnit = async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE work_units SET deleted_at = CURRENT_TIMESTAMP WHERE id=$1 AND deleted_at IS NULL RETURNING id",
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Unit kerja tidak ditemukan" });
    return res.json({ message: "Unit kerja berhasil diarsipkan (soft delete)" });
  } catch (error) {
    return sendDatabaseError(res, "Gagal menghapus unit kerja", error);
  }
};

module.exports = {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllWorkUnits,
  createWorkUnit,
  updateWorkUnit,
  deleteWorkUnit,
};
