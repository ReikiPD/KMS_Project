const pool = require("../config/db");
const { clearSessionCookies, getRawSessionToken, loadSession } = require("../services/sessionService");
const { canAccessStaffAccount, delegatedPermissionMap, hasGlobalStaffScope, hasPermission, loadRolePermissions } = require("../services/permissionService");
const { canManageStaffUnit } = require("../services/staffScopeService");

const { PUBLIC_ID_PATTERN } = require("../utils");
const CONTEXT_MODES = new Set(["admin-work", "admin-view", "scoped-view", "leader-view", "account-view"]);

const loadContextAccount = async (publicId) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.public_id, u.full_name, u.email, u.department, u.role,
            u.work_unit_id, u.organization_scope, wu.public_id AS work_unit_public_id, wu.name AS work_unit_name, wu.alias AS work_unit_alias,
            wu.echelon_level AS work_unit_echelon_level
     FROM users u
     JOIN access_roles ar ON ar.code = u.role AND ar.is_backoffice = TRUE
     LEFT JOIN work_units wu ON wu.id = u.work_unit_id AND wu.deleted_at IS NULL
     WHERE u.public_id = $1 AND u.deleted_at IS NULL LIMIT 1`, [publicId]);
  return rows[0] || null;
};

const loadAccessContext = async (req) => {
  const publicId = String(req.get("X-KMS-Context-User") || "").trim().toLowerCase();
  const mode = String(req.get("X-KMS-Context-Mode") || "").trim().toLowerCase();
  const supervisorPublicId = String(req.get("X-KMS-Context-Supervisor") || "").trim().toLowerCase();
  if (!publicId && !mode && !supervisorPublicId) return null;
  if (!PUBLIC_ID_PATTERN.test(publicId) || !CONTEXT_MODES.has(mode)) return { error: "Referensi akun konteks tidak valid" };
  if (!canAccessStaffAccount(req.user)) return { error: "POST atau EDIT Daftar Staf diperlukan untuk mengakses akun. VIEW hanya membuka tabel." };

  const target = await loadContextAccount(publicId);
  if (!target || Number(target.id) === Number(req.user.id)) return { error: "Akun tujuan tidak aktif atau merupakan akun sendiri" };
  if (!await canManageStaffUnit(req.user, target.work_unit_id)) return { error: "Akun tujuan berada di luar cakupan organisasi Anda" };

  let source = req.user;
  let supervisor = null;
  const boundaries = hasGlobalStaffScope(req.user) ? [] : [req.user.work_unit_id];
  if (supervisorPublicId) {
    if (!PUBLIC_ID_PATTERN.test(supervisorPublicId)) return { error: "Referensi pemilik cakupan tidak valid" };
    supervisor = await loadContextAccount(supervisorPublicId);
    if (!supervisor || [Number(target.id), Number(req.user.id)].includes(Number(supervisor.id))
      || !await canManageStaffUnit(req.user, supervisor.work_unit_id)) return { error: "Pemilik cakupan tidak valid atau berada di luar unit Anda" };
    source = { ...supervisor, environmentAdmin: false,
      permissions: delegatedPermissionMap(req.user, await loadRolePermissions(supervisor.role), {
        readOnly: !hasPermission(req.user, "staff_management", "edit"),
      }) };
    if (!canAccessStaffAccount(source)) return { error: "Akun pemilik cakupan tidak memiliki POST atau EDIT Daftar Staf" };
    if (!await canManageStaffUnit(source, target.work_unit_id)) return { error: "Akun tujuan berada di luar cakupan pemilik akun" };
    if (!hasGlobalStaffScope(source)) boundaries.push(source.work_unit_id);
  }

  const readOnly = !hasPermission(source, "staff_management", "edit");
  const permissions = delegatedPermissionMap(source, await loadRolePermissions(target.role), { readOnly });
  return {
    ...target,
    public_id: String(target.public_id), environmentAdmin: false, mode,
    supervisor_public_id: supervisor ? String(supervisor.public_id) : null,
    supervisor: supervisor ? { id: supervisor.id, public_id: String(supervisor.public_id), full_name: supervisor.full_name, role: supervisor.role } : null,
    read_only: readOnly,
    staff_scope_boundaries: [...new Set(boundaries.filter(Boolean))],
    permissions,
  };
};

const getStaffAccessContext = (req, res) => {
  if (!req.accessContext) return res.status(400).json({ error: "Pilih akun yang ingin diakses terlebih dahulu" });
  return res.json({ account: req.accessContext });
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
    if (accessContext?.read_only && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return reject(res, "Akses akun ini baca-saja. EDIT Daftar Staf diperlukan untuk melakukan perubahan.");
    }
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

module.exports = { loadAccessContext, getStaffAccessContext, verifyToken, optionalToken, requireBackoffice, requireAssetWrite, requireAdmin, requireAdminWorkspace, requireCommenter, requirePegawai, requirePermission, requirePersistentUser };
