const pool = require("../config/db");

const ACTIONS = ["view", "post", "edit", "delete"];
const CONTEXT_PRIVATE_RESOURCES = new Set(["activity", "profile"]);
const RESOURCES = [
  { key: "my_tasks", label: "Tugas Saya", description: "Pekerjaan, pengajuan, dan notifikasi sesuai akses akun", actions: ["view"] },
  { key: "dashboard", label: "Dashboard", description: "Ringkasan dan analitik KMS", actions: ["view"] },
  { key: "assets", label: "Aset Pengetahuan", description: "Daftar, detail, pembuatan, perubahan, dan penghapusan aset", actions: ACTIONS },
  { key: "internal_assets", label: "Aset Data Internal", description: "VIEW: baca/unduh · POST: input · EDIT: edit milik sendiri · DELETE: hapus milik sendiri. Cakupan BKT atau seluruh kementerian.", actions: ACTIONS },
  { key: "internal_asset_recovery", label: "Riwayat Penghapusan Aset Internal", description: "VIEW: riwayat milik sendiri · EDIT: pulihkan dalam 30 hari · DELETE: hapus permanen milik sendiri. Admin environment dapat mengelola seluruhnya.", actions: ["view", "edit", "delete"] },
  { key: "internal_data_types", label: "Jenis Data Internal", description: "Kelola jenis data internal sesuai izin; untuk akun BKT/turunannya atau cakupan seluruh kementerian", actions: ACTIONS },
  { key: "internal_data_categories", label: "Kategori Data Internal", description: "Kelola kategori data internal sesuai izin; untuk akun BKT/turunannya atau cakupan seluruh kementerian", actions: ACTIONS },
  { key: "asset_recovery", label: "Pemulihan Aset", description: "Pemulihan dan penghapusan permanen aset", actions: ["view", "edit", "delete"] },
  { key: "asset_verification", label: "Verifikasi Aset", description: "VIEW membuka antrean; EDIT menyetujui, menolak, atau meminta perbaikan sesuai cakupan Unit Kerja", actions: ["view", "edit"] },
  { key: "staff_management", label: "Daftar Staf", description: "VIEW: tabel saja · POST: akses akun baca-saja · EDIT: mode kerja dan tambah/edit akun · DELETE: nonaktifkan akun", actions: ACTIONS },
  { key: "staff_all_units", label: "Daftar Staf — seluruh unit", description: "Perluasan cakupan staf ke seluruh unit; tanpa izin ini hanya unit akun dan turunannya. Tetap membutuhkan izin Daftar Staf.", actions: ["view"] },
  { key: "role_permissions", label: "Hak Akses Role", description: "Role dan matriks akses pada halaman backoffice", actions: ["view", "post", "edit"] },
  { key: "categories", label: "Kategori Topik", description: "Data master kategori pengetahuan", actions: ACTIONS },
  { key: "work_units", label: "Unit Kerja", description: "Data master struktur Unit Kerja", actions: ACTIONS },
  { key: "analytics_echelon_1", label: "Analitik Eselon I", description: "Dashboard organisasi Eselon I dan seluruh unit turunannya", actions: ["view"] },
  { key: "analytics_echelon_2", label: "Analitik Eselon II", description: "Dashboard organisasi Eselon II dan tim Eselon III", actions: ["view"] },
  { key: "analytics_echelon_3", label: "Analitik Eselon III", description: "Dashboard statistik tim Eselon III", actions: ["view"] },
  { key: "announcements", label: "Pengumuman", description: "Pengumuman yang tampil di beranda", actions: ACTIONS },
  { key: "activity", label: "Pusat Aktivitas", description: "Notifikasi dan riwayat aktivitas akun", actions: ["view", "edit"] },
  { key: "profile", label: "Profil", description: "Identitas, avatar, dan keamanan akun", actions: ["view", "edit"] },
];

const fullPermissions = () => Object.fromEntries(RESOURCES.map(({ key, actions }) => [key,
  Object.fromEntries(ACTIONS.map((action) => [action, actions.includes(action)])),
]));

const normalizePermissionMap = (value) => {
  const source = value && typeof value === "object" ? value : {};
  return Object.fromEntries(RESOURCES.map(({ key, actions }) => {
    const permission = source[key] || {};
    return [key, Object.fromEntries(ACTIONS.map((action) => [action, actions.includes(action) && permission[action] === true]))];
  }));
};

const loadRolePermissions = async (role, client = pool) => {
  if (!role) return {};
  const { rows } = await client.query(
    `SELECT resource, can_view, can_post, can_edit, can_delete
     FROM role_permissions
     WHERE role = $1`,
    [role],
  );
  return normalizePermissionMap(Object.fromEntries(rows.map((row) => [row.resource, {
    view: row.can_view,
    post: row.can_post,
    edit: row.can_edit,
    delete: row.can_delete,
  }])));
};

const listAccessRoles = async ({ backofficeOnly = true } = {}, client = pool) => {
  const { rows } = await client.query(
    `SELECT code, name, description, is_system, is_backoffice
     FROM access_roles
     WHERE ($1::boolean = FALSE OR is_backoffice = TRUE)
     ORDER BY is_system DESC,
       CASE code WHEN 'pegawai' THEN 1 WHEN 'pimpinan' THEN 2 WHEN 'admin' THEN 3 ELSE 4 END,
       name ASC`,
    [backofficeOnly],
  );
  return rows;
};

const isBackofficeRole = async (role, client = pool) => {
  if (!role || role === "user") return false;
  const { rowCount } = await client.query(
    "SELECT 1 FROM access_roles WHERE code = $1 AND is_backoffice = TRUE",
    [role],
  );
  return rowCount > 0;
};

const hasPermission = (user, resource, action) => {
  if (user?.environmentAdmin) return true;
  return Boolean(user?.permissions?.[resource]?.[action]);
};

const intersectPermissionMaps = (actorPermissions, targetPermissions, { hidePrivate = true } = {}) => {
  const actor = normalizePermissionMap(actorPermissions);
  const target = normalizePermissionMap(targetPermissions);
  return Object.fromEntries(RESOURCES.map(({ key, actions }) => [
    key,
    Object.fromEntries(ACTIONS.map((action) => [
      action,
      actions.includes(action)
        && actor[key]?.[action] === true
        && target[key]?.[action] === true,
    ])),
  ]).map(([key, permissions]) => [
    key,
    hidePrivate && CONTEXT_PRIVATE_RESOURCES.has(key)
      ? Object.fromEntries(ACTIONS.map((action) => [action, false]))
      : permissions,
  ]));
};

const canAccessStaffAccount = (user) => !user?.read_only && hasPermission(user, "staff_management", "view")
  && (hasPermission(user, "staff_management", "post") || hasPermission(user, "staff_management", "edit"));
const hasOrganizationScope = (user) => Boolean(user?.environmentAdmin
  || (user?.organization_scope === "all" && !user?.staff_scope_boundaries?.length));
const hasGlobalStaffScope = (user) => hasOrganizationScope(user) || hasPermission(user, "staff_all_units", "view");
const canAssignAccessRole = (subject, permissions) => ["staff_all_units", "role_permissions"].every((resource) =>
  ACTIONS.every((action) => !permissions?.[resource]?.[action] || hasPermission(subject, resource, action)));

// POST on the staff directory is a strictly read-only account session.
const restrictPermissionMapForAccountView = (permissions) => {
  const normalized = normalizePermissionMap(permissions);
  return Object.fromEntries(RESOURCES.map(({ key, actions }) => [
    key,
    Object.fromEntries(ACTIONS.map((action) => [
      action,
      actions.includes(action)
        && normalized[key]?.[action] === true
        && action === "view",
    ])),
  ]));
};

const delegatedPermissionMap = (source, targetPermissions, { readOnly = false } = {}) => {
  const target = normalizePermissionMap(targetPermissions);
  const result = Object.fromEntries(RESOURCES.map(({ key }) => [key, Object.fromEntries(ACTIONS.map((action) => [action,
    target[key][action]
      && !CONTEXT_PRIVATE_RESOURCES.has(key)
      // Taking over an account must not expand the issuer's global authority.
      && (!["staff_all_units", "role_permissions"].includes(key) || hasPermission(source, key, action)),
  ]))]));
  return readOnly ? restrictPermissionMapForAccountView(result) : result;
};

module.exports = {
  ACTIONS,
  canAssignAccessRole,
  canAccessStaffAccount,
  delegatedPermissionMap,
  hasGlobalStaffScope,
  hasOrganizationScope,
  RESOURCES,
  fullPermissions,
  hasPermission,
  intersectPermissionMaps,
  isBackofficeRole,
  listAccessRoles,
  loadRolePermissions,
  normalizePermissionMap,
  restrictPermissionMapForAccountView,
};
