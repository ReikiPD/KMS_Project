const pool = require("../database/db");
const bcrypt = require("bcrypt");
const { admin } = require("../config/env");
const { recordAudit } = require("../services/auditService");
const { isBackofficeRole, loadRolePermissions } = require("../services/permissionService");
const { resolveActivityTarget } = require("../services/activityTargetService");
const {
  clearSessionCookies,
  issueSession,
  revokeRequestSession,
  revokeUserSessions,
} = require("../services/sessionService");

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

const publicIdentifierFilter = (value, column = "public_id") => {
  const identifier = typeof value === "string" ? value.trim() : String(value || "");
  if (!identifier) return null;
  const numericId = /^\d+$/.test(identifier) ? Number.parseInt(identifier, 10) : null;
  return {
    identifier,
    numericId: Number.isInteger(numericId) && numericId > 0 ? numericId : null,
    sql: numericId ? `(${column}::text = $1 OR id = $2)` : `${column}::text = $1`,
  };
};

const getProfileById = async (userId) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.department, u.avatar_url, u.role, u.created_at,
            u.work_unit_id, w.public_id AS work_unit_public_id, w.name AS work_unit_name, w.alias AS work_unit_alias,
            w.echelon_level AS work_unit_echelon_level
     FROM users u
     LEFT JOIN work_units w ON w.id = u.work_unit_id AND w.deleted_at IS NULL
     WHERE u.id = $1 AND u.deleted_at IS NULL`,
    [userId],
  );
  return rows[0] || null;
};

const publicUser = (user) => user ? ({
  ...(user.id ? { id: user.id } : {}),
  full_name: user.full_name,
  email: user.email,
  department: user.department || null,
  work_unit_id: user.work_unit_id || null,
  work_unit_name: user.work_unit_name || null,
  work_unit_alias: user.work_unit_alias || null,
  work_unit_public_id: user.work_unit_public_id || null,
  work_unit_echelon_level: user.work_unit_echelon_level ? Number(user.work_unit_echelon_level) : null,
  avatar_url: user.avatar_url || null,
  role: user.role,
  permissions: user.permissions || {},
  ...(user.environmentAdmin ? { environmentAdmin: true } : {}),
}) : null;

const hasUnrestrictedStaffScope = (req) => req.user?.role === "admin" && !req.accessContext;
const getStaffAccessSubject = (req) => req.accessContext || req.user;
const canManageScopedStaffUnit = async (req, workUnitId, client = pool) => {
  if (hasUnrestrictedStaffScope(req)) return true;
  const rootWorkUnitId = Number(getStaffAccessSubject(req)?.work_unit_id);
  const targetWorkUnitId = Number(workUnitId);
  if (!Number.isInteger(rootWorkUnitId) || !Number.isInteger(targetWorkUnitId)) return false;
  const { rowCount } = await client.query(
    `WITH RECURSIVE scoped_units AS (
       SELECT id FROM work_units WHERE id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT child.id FROM work_units child
       INNER JOIN scoped_units parent_scope ON child.parent_id = parent_scope.id
       WHERE child.deleted_at IS NULL
     )
     SELECT 1 FROM scoped_units WHERE id = $2 LIMIT 1`,
    [rootWorkUnitId, targetWorkUnitId],
  );
  return rowCount > 0;
};

const createAdminSession = async (req, res) => {
  const adminUser = {
    full_name: admin.fullName,
    email: admin.email,
    role: "admin",
    avatar_url: null,
  };

  await revokeRequestSession(req);
  const sessionResult = await issueSession({ user: adminUser, environmentAdmin: true }, req, res);
  await recordAudit({
    actorLabel: admin.fullName,
    actorRole: "admin",
    action: "admin.logged_in",
    targetType: "account",
    metadata: { email: admin.email },
  });

  return res.json({ message: "Login berhasil", user: publicUser(sessionResult.user) });
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
    if (audience === "backoffice" && email === admin.email) {
      if (!admin.passwordHash) {
        return res.status(503).json({ error: "Akses akun kedinasan belum dikonfigurasi pada server" });
      }
      if (!(await bcrypt.compare(password, admin.passwordHash))) {
        return res.status(401).json({ error: "Email atau kata sandi tidak sesuai" });
      }
      await createAdminSession(req, res);
      return;
    }

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
    if ((isPublicLogin && user.role !== "user") || (!isPublicLogin && !(await isBackofficeRole(user.role)))) {
      return res.status(403).json({ error: isPublicLogin ? "Gunakan akses Pegawai untuk akun kedinasan." : "Akun ini tidak memiliki akses ruang Pegawai." });
    }

    await recordAudit({ actorId: user.id, action: "account.logged_in", targetType: "account", targetId: user.id });
    await revokeRequestSession(req);
    const sessionResult = await issueSession({ user }, req, res);
    res.json({ message: "Login berhasil", user: publicUser(sessionResult.user) });
  } catch (error) {
    console.error("Error login:", error);
    res.status(500).json({ error: "Terjadi kesalahan saat login" });
  }
};

const getCurrentSession = async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  const user = publicUser(req.user);
  res.json({ authenticated: Boolean(user), user });
};

const logout = async (req, res) => {
  try {
    await revokeRequestSession(req);
  } finally {
    clearSessionCookies(res);
  }
  return res.json({ message: "Sesi berhasil diakhiri" });
};

const getStaff = async (req, res) => {
  try {
    const q = normalizeText(req.query.q, 100) || "";
    const usePagination = req.query.page !== undefined || req.query.limit !== undefined;
    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedLimit = Number.parseInt(req.query.limit, 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 10;
    const accessSubject = req.accessContext || req.user;
    const unrestricted = hasUnrestrictedStaffScope(req);
    const filters = [unrestricted ? "u.role <> 'user'" : "u.role NOT IN ('user', 'admin')", "u.deleted_at IS NULL"];
    const values = [];
    const shouldScopeOrganization = !unrestricted;
    if (shouldScopeOrganization && accessSubject?.work_unit_id) {
      values.push(Number(accessSubject.work_unit_id));
      filters.push(`u.work_unit_id IN (
        WITH RECURSIVE scoped_units AS (
          SELECT id FROM work_units WHERE id = $${values.length} AND deleted_at IS NULL
          UNION ALL
          SELECT child.id FROM work_units child
          INNER JOIN scoped_units parent ON child.parent_id = parent.id
          WHERE child.deleted_at IS NULL
        ) SELECT id FROM scoped_units
      )`);
    } else if (shouldScopeOrganization) filters.push("FALSE");
    if (shouldScopeOrganization && accessSubject?.id) {
      values.push(Number(accessSubject.id));
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
      `SELECT u.id, u.public_id, u.full_name, u.email, u.department, u.role, u.created_at,
              u.work_unit_id, wu.public_id AS work_unit_public_id, wu.name AS work_unit_name, wu.alias AS work_unit_alias,
              wu.echelon_level AS work_unit_echelon_level,
              COUNT(a.id)::integer AS asset_count,
              COUNT(a.id) FILTER (WHERE a.is_published = TRUE)::integer AS published_asset_count,
              COUNT(a.id) FILTER (WHERE a.is_published = FALSE)::integer AS draft_count,
              COALESCE(SUM(a.view_count), 0)::integer AS total_view_count,
              COUNT(*) OVER()::integer AS total_count
       FROM users u
       LEFT JOIN work_units wu ON wu.id = u.work_unit_id AND wu.deleted_at IS NULL
       LEFT JOIN knowledge_assets a ON a.author_id = u.id AND a.deleted_at IS NULL
       WHERE ${filters.join(" AND ")}
       GROUP BY u.id, wu.id
       ORDER BY u.full_name ASC, u.id ASC${paginationClause}`,
      values,
    );
    const totalItems = rows[0]?.total_count || 0;
    const permissionEntries = await Promise.all(
      [...new Set(rows.map((row) => row.role))].map(async (role) => [role, await loadRolePermissions(role)]),
    );
    const permissionsByRole = Object.fromEntries(permissionEntries);
    const data = rows.map(({ total_count: _totalCount, ...staff }) => ({
      ...staff,
      permissions: permissionsByRole[staff.role] || {},
    }));
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

const getStaffWorkUnits = async (req, res) => {
  try {
    const unrestricted = hasUnrestrictedStaffScope(req);
    const accessSubject = getStaffAccessSubject(req);
    if (!unrestricted && !accessSubject?.work_unit_id) {
      return res.status(403).json({ error: "Akun belum memiliki Unit Kerja untuk membatasi cakupan pegawai" });
    }
    const { rows } = await pool.query(
      `WITH RECURSIVE unit_tree AS (
         SELECT w.id, w.public_id, w.name, w.alias, w.echelon_level, w.parent_id,
                w.sort_order, 0::INTEGER AS depth,
                LPAD(w.sort_order::text, 10, '0') || '-' || LPAD(w.id::text, 10, '0') AS sort_path
         FROM work_units w
         WHERE w.deleted_at IS NULL
           AND (($1::boolean = TRUE AND w.parent_id IS NULL) OR ($1::boolean = FALSE AND w.id = $2))
         UNION ALL
         SELECT child.id, child.public_id, child.name, child.alias, child.echelon_level, child.parent_id,
                child.sort_order, parent_scope.depth + 1,
                parent_scope.sort_path || '.' || LPAD(child.sort_order::text, 10, '0') || '-' || LPAD(child.id::text, 10, '0')
         FROM work_units child
         INNER JOIN unit_tree parent_scope ON child.parent_id = parent_scope.id
         WHERE child.deleted_at IS NULL
       )
       SELECT id, public_id, name, alias, echelon_level, parent_id, sort_order, depth
       FROM unit_tree
       ORDER BY sort_path`,
      [unrestricted, unrestricted ? null : Number(accessSubject.work_unit_id)],
    );
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching scoped staff work units:", error);
    return res.status(500).json({ error: "Gagal memuat Unit Kerja untuk manajemen pegawai" });
  }
};

const createStaff = async (req, res) => {
  const fullName = normalizeText(req.body.full_name ?? req.body.fullName, 150);
  const email = normalizeEmail(req.body.email);
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const role = typeof req.body.role === "string" ? req.body.role.trim() : "pegawai";
  const workUnitId = Number.parseInt(req.body.workUnitId, 10);
  if (fullName === null || !fullName || email === null || !email) return res.status(400).json({ error: "Nama lengkap dan email Pegawai wajib valid" });
  if (!Number.isInteger(workUnitId) || workUnitId < 1) return res.status(400).json({ error: "Pilih Unit Kerja yang valid" });
  if (password.length < 8) return res.status(400).json({ error: "Kata sandi akun kedinasan minimal 8 karakter" });

  try {
    if (!(await isBackofficeRole(role))) return res.status(400).json({ error: "Role akun kedinasan tidak valid" });
    if (!hasUnrestrictedStaffScope(req) && role !== "pegawai") {
      return res.status(403).json({ error: "Role non-Admin hanya dapat mengelola akun Pegawai di bawah cakupan unitnya" });
    }
    if (!(await canManageScopedStaffUnit(req, workUnitId))) {
      return res.status(403).json({ error: "Unit Kerja akun berada di luar cakupan organisasi Anda" });
    }
    const { rows: workUnitRows } = await pool.query(
      "SELECT name FROM work_units WHERE id = $1 AND deleted_at IS NULL",
      [workUnitId],
    );
    if (!workUnitRows[0]) return res.status(400).json({ error: "Unit Kerja yang dipilih tidak ditemukan" });
    const department = workUnitRows[0].name;
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password, department, work_unit_id, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, public_id, full_name, email, department, work_unit_id, role, created_at`,
      [fullName, email, await bcrypt.hash(password, 10), department || null, workUnitId, role],
    );
    await recordAudit({ actorId: req.user.id || null, actorLabel: req.user.full_name, actorRole: req.user.role, action: "staff.created", targetType: "account", targetId: rows[0].id, metadata: { email, role, workUnitId } });
    return res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Email tersebut sudah terdaftar" });
    console.error("Error creating staff:", error);
    return res.status(500).json({ error: "Gagal menambahkan akun Pegawai" });
  }
};

const deleteStaff = async (req, res) => {
  const locator = publicIdentifierFilter(req.params.id);
  if (!locator) return res.status(400).json({ error: "Referensi akun kedinasan tidak valid" });
  try {
    const targetResult = await pool.query(
      `SELECT id, work_unit_id, role
       FROM users
       WHERE ${locator.sql} AND role <> 'user' AND deleted_at IS NULL
       LIMIT 1`,
      locator.numericId ? [locator.identifier, locator.numericId] : [locator.identifier],
    );
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ error: "Akun kedinasan tidak ditemukan atau sudah tidak aktif" });
    if (!hasUnrestrictedStaffScope(req) && (target.role !== "pegawai" || !(await canManageScopedStaffUnit(req, target.work_unit_id)))) {
      return res.status(403).json({ error: "Akun berada di luar cakupan pengelolaan Anda" });
    }
    const { rows } = await pool.query(
      `UPDATE users SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE ${locator.sql} AND role <> 'user' AND deleted_at IS NULL
         AND ($${locator.numericId ? 3 : 2}::integer IS NULL OR id <> $${locator.numericId ? 3 : 2})
       RETURNING id, public_id, full_name, email, role`,
      locator.numericId ? [locator.identifier, locator.numericId, req.user.id || null] : [locator.identifier, req.user.id || null],
    );
    if (!rows[0]) return res.status(404).json({ error: "Akun kedinasan tidak ditemukan, merupakan akun Anda sendiri, atau tidak dapat dinonaktifkan" });
    const staffId = rows[0].id;
    await revokeUserSessions(staffId);
    await recordAudit({ actorId: req.user.id || null, actorLabel: req.user.full_name, actorRole: req.user.role, action: "staff.deleted", targetType: "account", targetId: staffId, metadata: { email: rows[0].email, role: rows[0].role } });
    return res.status(204).send();
  } catch (error) {
    console.error("Error deleting staff:", error);
    return res.status(500).json({ error: "Gagal menonaktifkan akun kedinasan" });
  }
};

const updateStaffRole = async (req, res) => {
  const locator = publicIdentifierFilter(req.params.id);
  const role = typeof req.body?.role === "string" ? req.body.role.trim() : null;
  const workUnitId = Number.parseInt(req.body?.workUnitId, 10);
  if (!locator || !role) return res.status(400).json({ error: "Referensi akun atau role tidak valid" });
  if (!Number.isInteger(workUnitId) || workUnitId <= 0) {
    return res.status(400).json({ error: "Unit Kerja akun wajib dipilih" });
  }
  try {
    if (!(await isBackofficeRole(role))) return res.status(400).json({ error: "Role akun kedinasan tidak valid" });
    if (!hasUnrestrictedStaffScope(req) && role !== "pegawai") {
      return res.status(403).json({ error: "Role non-Admin hanya dapat mengelola akun Pegawai di bawah cakupan unitnya" });
    }
    if (!(await canManageScopedStaffUnit(req, workUnitId))) {
      return res.status(403).json({ error: "Unit Kerja akun berada di luar cakupan organisasi Anda" });
    }
    const targetResult = await pool.query(
      `SELECT id, work_unit_id, role
       FROM users
       WHERE ${locator.sql} AND role <> 'user' AND deleted_at IS NULL
       LIMIT 1`,
      locator.numericId ? [locator.identifier, locator.numericId] : [locator.identifier],
    );
    const target = targetResult.rows[0];
    if (!target) return res.status(404).json({ error: "Akun kedinasan tidak ditemukan atau sudah tidak aktif" });
    if (!hasUnrestrictedStaffScope(req) && (target.role !== "pegawai" || !(await canManageScopedStaffUnit(req, target.work_unit_id)))) {
      return res.status(403).json({ error: "Akun berada di luar cakupan pengelolaan Anda" });
    }
    const unitResult = await pool.query(
      `SELECT id, name
       FROM work_units
       WHERE id = $1 AND deleted_at IS NULL`,
      [workUnitId],
    );
    if (!unitResult.rows[0]) return res.status(400).json({ error: "Unit Kerja tidak valid atau sudah dihapus" });

    const values = locator.numericId
      ? [locator.identifier, locator.numericId, role, workUnitId, unitResult.rows[0].name, req.user.id || null]
      : [locator.identifier, role, workUnitId, unitResult.rows[0].name, req.user.id || null];
    const roleParameter = locator.numericId ? 3 : 2;
    const workUnitParameter = roleParameter + 1;
    const departmentParameter = roleParameter + 2;
    const actorParameter = roleParameter + 3;
    const { rows } = await pool.query(
      `UPDATE users
       SET role = $${roleParameter},
           work_unit_id = $${workUnitParameter},
           department = $${departmentParameter},
           session_version = session_version + 1,
           updated_at = CURRENT_TIMESTAMP
       WHERE ${locator.sql}
         AND role <> 'user'
         AND deleted_at IS NULL
         AND ($${actorParameter}::integer IS NULL OR id <> $${actorParameter})
       RETURNING id, public_id, full_name, email, department, work_unit_id, role, created_at`,
      values,
    );
    if (!rows[0]) return res.status(404).json({ error: "Akun tidak ditemukan atau role akun sendiri tidak dapat diubah" });
    await revokeUserSessions(rows[0].id);
    await recordAudit({
      actorId: req.user.id || null,
      actorLabel: req.user.full_name,
      actorRole: req.user.role,
      action: "staff.role_updated",
      targetType: "account",
      targetId: rows[0].id,
      metadata: { email: rows[0].email, role, workUnitId },
    });
    return res.json(rows[0]);
  } catch (error) {
    console.error("Error updating staff role:", error);
    return res.status(500).json({ error: "Gagal memperbarui role akun" });
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
      "UPDATE users SET password = $1, session_version = session_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [await bcrypt.hash(newPassword, 10), req.user.id],
    );
    await revokeUserSessions(req.user.id);
    clearSessionCookies(res);
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
    const target = await resolveActivityTarget(req);
    const { rows } = await pool.query(
      `SELECT id, action, target_type, target_id, metadata, created_at
       FROM audit_logs
       WHERE actor_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT $2`,
      [target.id, limit],
    );
    return res.json({
      data: rows,
      target: { public_id: target.public_id, full_name: target.fullName, role: target.role },
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error("Error fetching personal audit logs:", error);
    return res.status(500).json({ error: "Gagal memuat riwayat tindakan" });
  }
};

const getActivityTargets = async (req, res) => {
  if (req.user?.role !== "admin" || req.accessContext) {
    return res.status(403).json({ error: "Hanya Admin yang dapat memilih aktivitas Pegawai" });
  }
  try {
    const { rows } = await pool.query(
      `SELECT public_id, full_name, email, department
       FROM users
       WHERE role = 'pegawai' AND deleted_at IS NULL
       ORDER BY full_name ASC, id ASC`,
    );
    return res.json({ data: rows });
  } catch (error) {
    console.error("Error fetching activity targets:", error);
    return res.status(500).json({ error: "Gagal memuat daftar Pegawai" });
  }
};

module.exports = { registerUser, loginUser, getCurrentSession, logout, getProfile, updateProfile, updateAvatar, updatePassword, getStaff, getStaffWorkUnits, createStaff, updateStaffRole, deleteStaff, getAuditLogs, getActivityTargets };
