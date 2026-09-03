const pool = require("../database/db");
const { clearSessionCookies, getRawSessionToken, loadSession } = require("../services/sessionService");
const {
  hasPermission,
  intersectPermissionMaps,
  loadRolePermissions,
  restrictPermissionMapToReadOnly,
} = require("../services/permissionService");

const PUBLIC_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isScopedBackofficeRole = (role) => Boolean(role) && !["user", "admin"].includes(role);

const loadContextAccount = async (publicId) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.public_id, u.full_name, u.email, u.department, u.role,
            u.work_unit_id, wu.public_id AS work_unit_public_id, wu.name AS work_unit_name, wu.alias AS work_unit_alias,
            wu.echelon_level AS work_unit_echelon_level
     FROM users u
     LEFT JOIN work_units wu ON wu.id = u.work_unit_id AND wu.deleted_at IS NULL
     WHERE u.public_id = $1 AND u.deleted_at IS NULL
       AND u.role <> 'user'
     LIMIT 1`,
    [publicId],
  );
  return rows[0] || null;
};

const isWorkUnitInScope = async (parentWorkUnitId, targetWorkUnitId) => {
  if (!parentWorkUnitId || !targetWorkUnitId) return false;
  const { rowCount } = await pool.query(
    `WITH RECURSIVE scoped_units AS (
       SELECT id FROM work_units WHERE id = $1 AND deleted_at IS NULL
       UNION ALL
       SELECT child.id FROM work_units child
       INNER JOIN scoped_units parent_scope ON child.parent_id = parent_scope.id
       WHERE child.deleted_at IS NULL
     )
     SELECT 1 FROM scoped_units WHERE id = $2 LIMIT 1`,
    [parentWorkUnitId, targetWorkUnitId],
  );
  return rowCount > 0;
};

const loadAccessContext = async (req) => {
  const publicId = String(req.get("X-KMS-Context-User") || "").trim().toLowerCase();
  const mode = String(req.get("X-KMS-Context-Mode") || "").trim().toLowerCase();
  const supervisorPublicId = String(req.get("X-KMS-Context-Supervisor") || "").trim().toLowerCase();
  if (!publicId && !mode && !supervisorPublicId) return null;
  if (!PUBLIC_ID_PATTERN.test(publicId) || !mode) return { error: "Referensi akun konteks tidak valid" };

  const target = await loadContextAccount(publicId);
  if (!target) return { error: "Akun konteks tidak ditemukan atau tidak aktif" };

  const actorRole = req.user?.role;
  const adminModeAllowed = actorRole === "admin"
    && ((target.role === "pegawai" && mode === "admin-work")
      || (isScopedBackofficeRole(target.role) && mode === "admin-view"));
  const scopedModeAllowed = isScopedBackofficeRole(actorRole)
    && isScopedBackofficeRole(target.role)
    && ["scoped-view", "leader-view"].includes(mode)
    && Number(target.id) !== Number(req.user?.id)
    && hasPermission(req.user, "staff_management", "view");
  if (!adminModeAllowed && !scopedModeAllowed) {
    return { error: "Anda tidak diizinkan menggunakan konteks akun tersebut" };
  }

  let scopeOwner = scopedModeAllowed ? req.user : null;
  let sourcePermissions = req.user.permissions;
  let workModeEnabled = !scopedModeAllowed;
  let supervisor = null;

  if (supervisorPublicId) {
    if (!PUBLIC_ID_PATTERN.test(supervisorPublicId)
      || actorRole !== "admin"
      || mode !== "admin-view"
      || !isScopedBackofficeRole(target.role)) {
      return { error: "Referensi pemilik cakupan akun tidak valid" };
    }
    supervisor = await loadContextAccount(supervisorPublicId);
    if (!supervisor || !isScopedBackofficeRole(supervisor.role) || Number(supervisor.id) === Number(target.id)) {
      return { error: "Akun pemilik cakupan tidak ditemukan atau tidak aktif" };
    }
    const supervisorPermissions = await loadRolePermissions(supervisor.role);
    if (!hasPermission({ permissions: supervisorPermissions }, "staff_management", "view")) {
      return { error: "Role pemilik cakupan tidak memiliki akses VIEW Manajemen Pegawai" };
    }
    sourcePermissions = intersectPermissionMaps(req.user.permissions, supervisorPermissions);
    scopeOwner = supervisor;
    workModeEnabled = hasPermission({ permissions: supervisorPermissions }, "staff_management", "post");
  } else if (scopedModeAllowed) {
    workModeEnabled = hasPermission(req.user, "staff_management", "post");
  }

  if (scopeOwner) {
    if (!scopeOwner.work_unit_id || !target.work_unit_id) {
      return { error: "Akun pemilik cakupan atau akun tujuan belum memiliki Unit Kerja yang valid" };
    }
    if (!await isWorkUnitInScope(scopeOwner.work_unit_id, target.work_unit_id)) {
      return { error: "Akun tujuan berada di luar cakupan organisasi akun Anda" };
    }
  }

  const targetPermissions = await loadRolePermissions(target.role);
  const directAdminScopedContext = adminModeAllowed
    && mode === "admin-view"
    && !supervisor
    && isScopedBackofficeRole(target.role);
  if (directAdminScopedContext) {
    workModeEnabled = hasPermission({ permissions: targetPermissions }, "staff_management", "post");
  }
  const requiresWorkModeGate = Boolean(scopeOwner) || directAdminScopedContext;
  const effectivePermissions = intersectPermissionMaps(sourcePermissions, targetPermissions);
  return {
    ...target,
    public_id: String(target.public_id),
    mode,
    supervisor_public_id: supervisor ? String(supervisor.public_id) : null,
    read_only: Boolean(requiresWorkModeGate && !workModeEnabled),
    permissions: requiresWorkModeGate && !workModeEnabled
      ? restrictPermissionMapToReadOnly(effectivePermissions)
      : effectivePermissions,
  };
};

const verifyToken = async (req, res, next) => {
  try {
    const loaded = await loadSession(req);
    if (loaded?.error) {
      clearSessionCookies(res);
      return res.status(loaded.status).json({ error: `${loaded.error}. Silakan login kembali.` });
    }
    req.session = loaded;
    req.user = loaded.user;
    const accessContext = await loadAccessContext(req);
    if (accessContext?.error) return reject(res, accessContext.error);
    req.accessContext = accessContext;
    return next();
  } catch {
    clearSessionCookies(res);
    return res.status(401).json({
      error: "Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.",
    });
  }
};

const optionalToken = async (req, res, next) => {
  try {
    const hadSessionCookie = Boolean(getRawSessionToken(req));
    const loaded = await loadSession(req, { optional: true });
    if (loaded) {
      req.session = loaded;
      req.user = loaded.user;
    } else if (hadSessionCookie) {
      clearSessionCookies(res);
    }
  } catch {
    // Endpoint publik tetap tersedia saat cookie lama/rusak dikirim browser.
    clearSessionCookies(res);
  }
  next();
};

const reject = (res, detail) => res.status(403).json({ error: "Akses ditolak", detail });

const requireBackoffice = (req, res, next) => {
  if (!req.user || req.user.role === "user") return reject(res, "Halaman ini hanya tersedia untuk akun backoffice.");
  return next();
};

const requireAssetWrite = (req, res, next) => {
  if (!req.user || !hasPermission(req.user, "assets", "edit")) return reject(res, "Anda tidak memiliki akses untuk mengubah aset.");
  return next();
};

const requirePermission = (resource, action = "view") => (req, res, next) => {
  const accessSubject = req.accessContext || req.user;
  if (!req.user || !hasPermission(accessSubject, resource, action)) {
    return reject(res, `Role Anda tidak memiliki akses ${action.toUpperCase()} pada fitur ini.`);
  }
  return next();
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return reject(res, "Hanya Admin yang dapat mengubah data master atau akun Pegawai.");
  return next();
};

const requireAdminWorkspace = (req, res, next) => {
  if (req.user?.role !== "admin" || req.accessContext) {
    return reject(res, "Pemantauan sistem hanya tersedia di Ruang Admin utama.");
  }
  return next();
};

const requireCommenter = (req, res, next) => {
  if (!req.user || !["user", "pegawai"].includes(req.user.role)) return reject(res, "Hanya akun publik atau Pegawai yang dapat menulis komentar.");
  return next();
};

const requirePegawai = (req, res, next) => {
  if (req.user?.role !== "pegawai") return reject(res, "Fitur ini hanya tersedia untuk Pegawai.");
  return next();
};

const requirePersistentUser = (req, res, next) => {
  if (!req.user?.id) return reject(res, "Akun Admin environment tidak memiliki profil tersimpan.");
  return next();
};

module.exports = { verifyToken, optionalToken, requireBackoffice, requireAssetWrite, requireAdmin, requireAdminWorkspace, requireCommenter, requirePegawai, requirePermission, requirePersistentUser };
