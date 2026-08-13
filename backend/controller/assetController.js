const pool = require("../database/db");

// ============================================================================
// BAGIAN 1: KNOWLEDGE ASSETS (ASET PENGETAHUAN)
// ============================================================================

const getHomepageAssets = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const offset = (page - 1) * limit;

  try {
    const countQuery = `SELECT COUNT(*) FROM knowledge_assets WHERE is_published = true AND deleted_at IS NULL;`;
    const countResult = await pool.query(countQuery);
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    const query = `
      SELECT a.id, a.title, a.slug, a.asset_type, a.summary, a.thumbnail_url, 
             a.view_count, a.created_at,
             json_build_object('id', u.id, 'full_name', u.full_name) as author,
             json_build_object('id', c.id, 'name', c.name) as category,
             json_build_object('id', w.id, 'name', w.name) as work_unit
      FROM knowledge_assets a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN categories c ON a.category_id = c.id
      LEFT JOIN work_units w ON a.work_unit_id = w.id
      WHERE a.is_published = true AND a.deleted_at IS NULL
      ORDER BY a.created_at DESC
      LIMIT $1 OFFSET $2; 
    `;

    const { rows } = await pool.query(query, [limit, offset]);

    res.json({
      data: rows,
      pagination: { totalItems, totalPages, currentPage: page, limit },
    });
  } catch (error) {
    console.error("Error fetching assets:", error);
    res.status(500).json({ error: "Gagal memuat data beranda" });
  }
};

// Tambahkan fungsi ini di bawah fungsi getHomepageAssets

const getAdminAssets = async (req, res) => {
  try {
    // Ambil ID user yang sedang login dari token JWT
    const author_id = req.user.id;

    // Tambahkan kondisi "AND a.author_id = $1" pada query
    const query = `
      SELECT a.id, a.title, a.asset_type, a.is_published, a.created_at,
             c.name as category_name
      FROM knowledge_assets a
      LEFT JOIN categories c ON a.category_id = c.id
      WHERE a.deleted_at IS NULL AND a.author_id = $1
      ORDER BY a.created_at DESC
    `;

    // Masukkan author_id ke dalam eksekusi query
    const { rows } = await pool.query(query, [author_id]);

    res.json(rows);
  } catch (error) {
    console.error("Error fetching admin assets:", error);
    res.status(500).json({ error: "Gagal mengambil data aset admin" });
  }
};

const createAsset = async (req, res) => {
  const {
    title,
    slug,
    asset_type,
    summary,
    content,
    is_published,
    category_id,
    work_unit_id,
  } = req.body;
  const author_id = req.user.id;
  const file_url = req.file ? req.file.path : null;

  try {
    let final_thumbnail = null;
    let final_file_url = null;

    if (asset_type === "article") {
      final_thumbnail = file_url;
    } else {
      final_file_url = file_url;
    }

    const query = `
      INSERT INTO knowledge_assets 
        (title, slug, asset_type, file_url, summary, content, thumbnail_url, is_published, author_id, category_id, work_unit_id)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *;
    `;

    const values = [
      title,
      slug,
      asset_type || "article",
      final_file_url,
      summary,
      content,
      final_thumbnail,
      is_published === "true",
      author_id,
      category_id ? Number(category_id) : null,
      work_unit_id ? Number(work_unit_id) : null,
    ];

    const { rows } = await pool.query(query, values);
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error detail:", error.message || error);
    res
      .status(500)
      .json({ error: "Gagal menyimpan aset", detail: error.message });
  }
};

const updateAsset = async (req, res) => {
  const { id } = req.params;
  const {
    title,
    slug,
    summary,
    content,
    is_published,
    category_id,
    work_unit_id,
  } = req.body;

  try {
    const query = `
      UPDATE knowledge_assets 
      SET title = $1, slug = $2, summary = $3, content = $4, is_published = $5, 
          category_id = $6, work_unit_id = $7, updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 
      RETURNING *;
    `;

    const values = [
      title,
      slug,
      summary,
      content,
      is_published === "true" || is_published === true,
      category_id ? Number(category_id) : null,
      work_unit_id ? Number(work_unit_id) : null,
      id,
    ];

    const { rows } = await pool.query(query, values);
    if (rows.length === 0)
      return res.status(404).json({ error: "Aset tidak ditemukan" });

    res.json(rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal mengubah aset", detail: error.message });
  }
};

const deleteAsset = async (req, res) => {
  const { id } = req.params;
  try {
    const query =
      "UPDATE knowledge_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id";
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0)
      return res.status(404).json({ error: "Aset tidak ditemukan" });
    res.json({ message: "Aset berhasil dihapus (soft delete)" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal menghapus aset", detail: error.message });
  }
};

// ============================================================================
// BAGIAN 2: CATEGORIES (KATEGORI)
// ============================================================================

const getAllCategories = async (req, res) => {
  try {
    // Tambahkan filter WHERE deleted_at IS NULL
    const { rows } = await pool.query(
      "SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY id ASC",
    );
    res.json(rows);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal mengambil kategori", detail: error.message });
  }
};
const createCategory = async (req, res) => {
  const { name, slug, description } = req.body;
  try {
    const query =
      "INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3) RETURNING *";
    const { rows } = await pool.query(query, [name, slug, description]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal membuat kategori", detail: error.message });
  }
};

const updateCategory = async (req, res) => {
  const { id } = req.params;
  const { name, slug, description } = req.body;
  try {
    const query =
      "UPDATE categories SET name=$1, slug=$2, description=$3 WHERE id=$4 RETURNING *";
    const { rows } = await pool.query(query, [name, slug, description, id]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    res.json(rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal mengubah kategori", detail: error.message });
  }
};

const deleteCategory = async (req, res) => {
  const { id } = req.params;
  try {
    // Ubah DELETE FROM menjadi UPDATE
    const query =
      "UPDATE categories SET deleted_at = CURRENT_TIMESTAMP WHERE id=$1 RETURNING id";
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0)
      return res.status(404).json({ error: "Kategori tidak ditemukan" });
    res.json({ message: "Kategori berhasil diarsipkan (soft delete)" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal menghapus kategori", detail: error.message });
  }
};

// ============================================================================
// BAGIAN 3: WORK UNITS (UNIT KERJA)
// ============================================================================

const getAllWorkUnits = async (req, res) => {
  try {
    // Tambahkan filter WHERE deleted_at IS NULL
    const { rows } = await pool.query(
      "SELECT * FROM work_units WHERE deleted_at IS NULL ORDER BY id ASC",
    );
    res.json(rows);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal mengambil unit kerja", detail: error.message });
  }
};

const createWorkUnit = async (req, res) => {
  const { name } = req.body;
  try {
    const query = "INSERT INTO work_units (name) VALUES ($1) RETURNING *";
    const { rows } = await pool.query(query, [name]);
    res.status(201).json(rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal membuat unit kerja", detail: error.message });
  }
};

const updateWorkUnit = async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  try {
    const query = "UPDATE work_units SET name=$1 WHERE id=$2 RETURNING *";
    const { rows } = await pool.query(query, [name, id]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Unit kerja tidak ditemukan" });
    res.json(rows[0]);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal mengubah unit kerja", detail: error.message });
  }
};

const deleteWorkUnit = async (req, res) => {
  const { id } = req.params;
  try {
    // Ubah DELETE FROM menjadi UPDATE
    const query =
      "UPDATE work_units SET deleted_at = CURRENT_TIMESTAMP WHERE id=$1 RETURNING id";
    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0)
      return res.status(404).json({ error: "Unit kerja tidak ditemukan" });
    res.json({ message: "Unit kerja berhasil diarsipkan (soft delete)" });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Gagal menghapus unit kerja", detail: error.message });
  }
};

// ============================================================================
// EXPORT SEMUA FUNGSI
// ============================================================================
module.exports = {
  // Assets
  getHomepageAssets,
  getAdminAssets,
  createAsset,
  updateAsset,
  deleteAsset,
  // Categories
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // Work Units
  getAllWorkUnits,
  createWorkUnit,
  updateWorkUnit,
  deleteWorkUnit,
};
