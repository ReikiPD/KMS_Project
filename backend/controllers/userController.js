const pool = require("../database/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { admin } = require("../config/env");
const { recordAudit } = require("../services/auditService");

const normalizeText = (value, maxLength) => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length <= maxLength ? normalized : null;
};

const getSearchTerms = (value, maxTerms = 8) => {
  if (typeof value !== "string") return [];
  const seen = new Set();
  return value.trim().split(/[\s,]+/).filter(Boolean).filter((term) => {
    const normalized = term.toLocaleLowerCase("id-ID");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, maxTerms);
};

const normalizeEmail = (value) => {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return normalized.length <= 150 && validEmail.test(normalized) ? normalized : null;
};

const getProfileById = async (userId) => {
  const { rows } = await pool.query(
    `SELECT id, full_name, email, department, avatar_url, role, created_at
     FROM users
     WHERE id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return rows[0] || null;
};

const issueSession = (user) => {
  const token = jwt.sign(
    { id: user.id, email: user.email, department: user.department, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );
  return {
    token,
    user: {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      department: user.department,
      avatar_url: user.avatar_url,
      role: user.role,
    },
  };
};

const registerUser = async (req, res) => {
  const fullName = normalizeText(req.body.full_name ?? req.body.fullName, 150);
  const email = normalizeEmail(req.body.email);
  const department = normalizeText(req.body.department, 100);
  const password = typeof req.body.password === "string" ? req.body.password : "";

  if (fullName === null || !fullName) return res.status(400).json({ error: "Nama lengkap wajib diisi dan maksimal 150 karakter" });
  if (email === null || !email) return res.status(400).json({ error: "Masukkan alamat email yang valid" });
  if (department === null) return res.status(400).json({ error: "Instansi/organisasi maksimal 100 karakter" });
  if (password.length < 8) return res.status(400).json({ error: "Kata sandi minimal terdiri dari 8 karakter" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password, department, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, role`,
      [fullName, email, hashedPassword, department || null, "user"],
    );
    await recordAudit({ actorId: rows[0].id, action: "account.registered", targetType: "account", targetId: rows[0].id });
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error register:", error);
    if (error.code === "23505") return res.status(409).json({ error: "Email tersebut sudah terdaftar" });
    res.status(500).json({ error: "Gagal mendaftarkan pengguna" });
  }
};

const loginUser = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const audience = req.body.audience === "public" ? "public" : "backoffice";
  if (!email || !password) return res.status(400).json({ error: "Email dan kata sandi wajib diisi" });

  try {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL",
      [email],
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Email atau kata sandi tidak sesuai" });
    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Email atau kata sandi tidak sesuai" });
    }

    const isPublicLogin = audience === "public";
    if ((isPublicLogin && user.role !== "user") || (!isPublicLogin && !["pegawai", "pimpinan"].includes(user.role))) {
      return res.status(403).json({ error: isPublicLogin ? "Gunakan akses Pegawai untuk akun kedinasan." : "Akun ini tidak memiliki akses ruang Pegawai." });
    }

    await recordAudit({ actorId: user.id, action: "account.logged_in", targetType: "account", targetId: user.id });
    res.json({ message: "Login berhasil", ...issueSession(user) });
  } catch (error) {
    console.error("Error login:", error);
    res.status(500).json({ error: "Terjadi kesalahan saat login" });
  }
};

const loginAdmin = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!admin.email || !admin.passwordHash) return res.status(503).json({ error: "Kredensial Admin belum dikonfigurasi pada server" });
  if (!email || email !== admin.email || !(await bcrypt.compare(password, admin.passwordHash))) {
    return res.status(401).json({ error: "Email atau kata sandi Admin tidak sesuai" });
  }

  const token = jwt.sign(
    { email: admin.email, full_name: admin.fullName, role: "admin", environmentAdmin: true },
    process.env.JWT_SECRET,
    { expiresIn: "1d" },
  );
  await recordAudit({ actorLabel: admin.fullName, actorRole: "admin", action: "admin.logged_in", targetType: "account", metadata: { email: admin.email } });
  return res.json({ message: "Login Admin berhasil", token, user: { full_name: admin.fullName, email: admin.email, role: "admin", avatar_url: null } });
};

const getStaff = async (req, res) => {
  try {
    const q = normalizeText(req.query.q, 100) || "";
    const usePagination = req.query.page !== undefined || req.query.limit !== undefined;
    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 10;
    const filters = ["u.role IN ('pegawai', 'pimpinan')", "u.deleted_at IS NULL"];
    const values = [];

    if (req.user?.role === "pimpinan" && Number.isInteger(req.user.id)) {
      values.push(req.user.id);
      filters.push(`u.id <> $${values.length}`);
    }
    getSearchTerms(q).forEach((term) => {
      values.push(`%${term}%`);
      const parameter = `$${values.length}`;
      filters.push(`(u.full_name ILIKE ${parameter} OR u.email ILIKE ${parameter} OR COALESCE(u.department, '') ILIKE ${parameter} OR u.role ILIKE ${parameter})`);
    });

    let paginationClause = "";
    if (usePagination) {
      values.push(limit);
      const limitParameter = values.length;
      values.push((page - 1) * limit);
      paginationClause = ` LIMIT $${limitParameter} OFFSET $${values.length}`;
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.department, u.role, u.created_at,
              COUNT(a.id)::integer AS asset_count,
              COUNT(a.id) FILTER (WHERE a.is_published = TRUE)::integer AS published_asset_count,
              COUNT(a.id) FILTER (WHERE a.is_published = FALSE)::integer AS draft_count,
              COALESCE(SUM(a.view_count), 0)::integer AS total_view_count,
              COUNT(*) OVER()::integer AS total_count
       FROM users u
       LEFT JOIN knowledge_assets a ON a.author_id = u.id AND a.deleted_at IS NULL
       WHERE ${filters.join(" AND ")}
       GROUP BY u.id
       ORDER BY u.full_name ASC, u.id ASC${paginationClause}`,
      values,
    );
    const totalItems = rows[0]?.total_count || 0;
    const data = rows.map(({ total_count: _totalCount, ...staff }) => staff);
    if (!usePagination) return res.json({ data });
    return res.json({
      data,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: totalItems > 0 ? Math.ceil(totalItems / limit) : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching staff:", error);
    return res.status(500).json({ error: "Gagal memuat daftar Pegawai" });
  }
};

const createStaff = async (req, res) => {
  const fullName = normalizeText(req.body.full_name ?? req.body.fullName, 150);
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const role = req.body.role === "pimpinan" ? "pimpinan" : "pegawai";
  const workUnitId = Number.parseInt(req.body.workUnitId, 10);
  if (fullName === null || !fullName || email === null || !email) return res.status(400).json({ error: "Nama lengkap dan email Pegawai wajib valid" });
  if (!Number.isInteger(workUnitId) || workUnitId < 1) return res.status(400).json({ error: "Pilih Unit Kerja yang valid" });
  if (password.length < 8) return res.status(400).json({ error: "Kata sandi akun kedinasan minimal 8 karakter" });

  try {
    const { rows: workUnitRows } = await pool.query(
      "SELECT name FROM work_units WHERE id = $1 AND deleted_at IS NULL",
      [workUnitId],
    );
    if (!workUnitRows[0]) return res.status(400).json({ error: "Unit Kerja yang dipilih tidak ditemukan" });
    const department = workUnitRows[0].name;
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password, department, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, email, department, role, created_at`,
      [fullName, email, await bcrypt.hash(password, 10), department || null, role],
    );
    await recordAudit({ actorLabel: req.user.full_name, actorRole: "admin", action: "staff.created", targetType: "account", targetId: rows[0].id, metadata: { email, role, workUnitId } });
    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Email tersebut sudah terdaftar" });
    console.error("Error creating staff:", error);
    return res.status(500).json({ error: "Gagal menambahkan akun Pegawai" });
  }
};

const deleteStaff = async (req, res) => {
  const staffId = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(staffId) || staffId < 1) return res.status(400).json({ error: "ID akun kedinasan tidak valid" });
  try {
    const { rows } = await pool.query(
      `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND role IN ('pegawai', 'pimpinan') AND deleted_at IS NULL
       RETURNING id, full_name, email, role`,
      [staffId],
    );
    if (!rows[0]) return res.status(404).json({ error: "Akun Pegawai/Pimpinan tidak ditemukan atau tidak dapat dinonaktifkan" });
    await recordAudit({ actorLabel: req.user.full_name, actorRole: "admin", action: "staff.deleted", targetType: "account", targetId: staffId, metadata: { email: rows[0].email, role: rows[0].role } });
    return res.status(204).send();
  } catch (error) {
    console.error("Error deleting staff:", error);
    return res.status(500).json({ error: "Gagal menonaktifkan akun kedinasan" });
  }
};

const getProfile = async (req, res) => {
  try {
    const profile = await getProfileById(req.user.id);
    if (!profile) return res.status(404).json({ error: "Profil pengguna tidak ditemukan" });
    res.json(profile);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ error: "Gagal memuat profil" });
  }
};

const updateProfile = async (req, res) => {
  const fullName = normalizeText(req.body.fullName, 150);
  const email = normalizeEmail(req.body.email);
  const department = normalizeText(req.body.department, 100);
  if (fullName === null || (fullName !== undefined && !fullName)) {
    return res.status(400).json({ error: "Nama lengkap wajib diisi dan maksimal 150 karakter" });
  }
  if (department === null) return res.status(400).json({ error: "Unit/departemen maksimal 100 karakter" });
  if (email === null) return res.status(400).json({ error: "Masukkan alamat email yang valid dan maksimal 150 karakter" });

  try {
    const currentProfile = await getProfileById(req.user.id);
    if (!currentProfile) return res.status(404).json({ error: "Profil pengguna tidak ditemukan" });

    const { rows } = await pool.query(
      `UPDATE users
       SET full_name = $1, email = $2, department = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id, full_name, email, department, avatar_url, role, created_at`,
      [
        fullName === undefined ? currentProfile.full_name : fullName,
        email === undefined ? currentProfile.email : email,
        department === undefined ? currentProfile.department : department || null,
        req.user.id,
      ],
    );
    await recordAudit({ actorId: req.user.id, action: "profile.updated", targetType: "profile", targetId: req.user.id });
    res.json(rows[0]);
  } catch (error) {
    console.error("Error updating profile:", error);
    if (error.code === "23505") return res.status(409).json({ error: "Email tersebut sudah digunakan oleh akun lain" });
    res.status(500).json({ error: "Gagal menyimpan profil" });
  }
};

const updateAvatar = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Pilih file avatar terlebih dahulu" });

  try {
    const { rows } = await pool.query(
      `UPDATE users
       SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, full_name, email, department, avatar_url, role, created_at`,
      [req.file.filename, req.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Profil pengguna tidak ditemukan" });
    await recordAudit({ actorId: req.user.id, action: "profile.avatar_updated", targetType: "profile", targetId: req.user.id });
    res.json(rows[0]);
  } catch (error) {
    console.error("Error updating avatar:", error);
    res.status(500).json({ error: "Gagal memperbarui avatar" });
  }
};

const updatePassword = async (req, res) => {
  const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
  const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Kata sandi saat ini dan kata sandi baru wajib diisi" });
  }
  if (newPassword.length < 8) return res.status(400).json({ error: "Kata sandi baru minimal 8 karakter" });

  try {
    const { rows } = await pool.query(
      "SELECT password FROM users WHERE id = $1 AND deleted_at IS NULL",
      [req.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Profil pengguna tidak ditemukan" });
    if (!(await bcrypt.compare(currentPassword, rows[0].password))) {
      return res.status(401).json({ error: "Kata sandi saat ini tidak sesuai" });
    }

    await pool.query(
      "UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [await bcrypt.hash(newPassword, 10), req.user.id],
    );
    await recordAudit({ actorId: req.user.id, action: "profile.password_updated", targetType: "profile", targetId: req.user.id });
    res.json({ message: "Kata sandi berhasil diperbarui" });
  } catch (error) {
    console.error("Error updating password:", error);
    res.status(500).json({ error: "Gagal memperbarui kata sandi" });
  }
};

const getAuditLogs = async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 50)
    : 10;

  try {
    const { rows } = await pool.query(
      `SELECT id, action, target_type, target_id, metadata, created_at
       FROM audit_logs
       WHERE actor_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [req.user.id, limit],
    );
    return res.json({ data: rows });
  } catch (error) {
    console.error("Error fetching personal audit logs:", error);
    return res.status(500).json({ error: "Gagal memuat riwayat tindakan" });
  }
};

const deleteAuditLogs = async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM audit_logs WHERE actor_id = $1",
      [req.user.id],
    );
    return res.json({
      message: "Riwayat tindakan berhasil dihapus",
      deletedCount: result.rowCount,
    });
  } catch (error) {
    console.error("Error deleting personal audit logs:", error);
    return res.status(500).json({ error: "Gagal menghapus riwayat tindakan" });
  }
};

module.exports = { registerUser, loginUser, loginAdmin, getProfile, updateProfile, updateAvatar, updatePassword, getStaff, createStaff, deleteStaff, getAuditLogs, deleteAuditLogs };
