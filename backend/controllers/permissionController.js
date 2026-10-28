const pool = require("../config/db");
const { recordAudit } = require("../services/auditService");
const { ACTIONS, RESOURCES, isBackofficeRole, listAccessRoles, loadRolePermissions, normalizePermissionMap, canAssignAccessRole } = require("../services/permissionService");

const normalizeRoleCode = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 20);

const normalizePermissionSubmission = (supplied = []) => normalizePermissionMap(Object.fromEntries(
  (Array.isArray(supplied) ? supplied : []).map((item) => [item?.resource, item || {}]),
));

const analyzePermissionRisks = (permissions) => {
  const normalized = normalizePermissionMap(permissions);
  const risks = [];
  const add = (severity, code, title, detail) => risks.push({ severity, code, title, detail });
  if (normalized.role_permissions?.edit) add("critical", "manage_permissions", "Dapat mengubah hak akses role", "Akun dengan role ini dapat memperluas akses role lain.");
  if (normalized.staff_management?.edit) add("critical", "staff_work_mode", "Dapat bekerja sebagai akun lain", "EDIT Daftar Staf memberikan mode kerja sesuai izin akun tujuan serta pembuatan/perubahan akun. Berikan hanya kepada pengelola tepercaya.");
  if (normalized.staff_all_units?.view) add("warning", "staff_global_scope", "Cakupan staf seluruh unit", "Akses Daftar Staf tidak lagi dibatasi pada pohon unit kerja akun ini.");
  if (normalized.staff_management?.delete) add("critical", "delete_accounts", "Dapat menonaktifkan akun", "Pastikan akses DELETE Manajemen Pegawai hanya diberikan kepada pengelola akun.");
  if (normalized.asset_recovery?.delete) add("critical", "permanent_asset_delete", "Dapat menghapus aset secara permanen", "Aksi ini tidak dapat dipulihkan melalui aplikasi.");
  if (normalized.internal_asset_recovery?.delete) add("critical", "permanent_internal_asset_delete", "Dapat menghapus berkas internal secara permanen", "Pemilik dapat menghapus seluruh lampiran aset internal dari server tanpa menunggu 30 hari. Aksi tidak dapat dipulihkan.");
  if (normalized.assets?.delete && normalized.asset_recovery?.delete) add("warning", "full_asset_delete", "Memiliki rangkaian penghapusan lengkap", "Role dapat menghapus aset lalu menghapusnya permanen dari pemulihan.");
  if (normalized.asset_verification?.edit && !normalized.asset_verification?.view) add("warning", "hidden_verifier", "Akses keputusan tanpa akses antrean", "Aktifkan VIEW agar verifikator dapat melihat pengajuan yang akan diproses.");
  return risks;
};

const permissionChanges = (before, after) => RESOURCES.flatMap((resource) => ACTIONS
  .filter((action) => resource.actions.includes(action) && Boolean(before?.[resource.key]?.[action]) !== Boolean(after?.[resource.key]?.[action]))
  .map((action) => ({
    resource: resource.key,
    resourceLabel: resource.label,
    action,
    enabled: Boolean(after?.[resource.key]?.[action]),
  })));

const getRoleGovernance = async (role, client = pool) => {
  const [impactResult, historyResult, reviewResult] = await Promise.all([
    client.query(
      `SELECT (SELECT COUNT(*)::INTEGER FROM users WHERE role = $1 AND deleted_at IS NULL) AS total,
              COALESCE(JSON_AGG(sample ORDER BY sample->>'full_name') FILTER (WHERE sample IS NOT NULL), '[]'::json) AS sample
       FROM (
         SELECT JSON_BUILD_OBJECT('public_id', public_id, 'full_name', full_name, 'email', email) AS sample
         FROM users WHERE role = $1 AND deleted_at IS NULL ORDER BY full_name, id LIMIT 8
       ) listed`,
      [role],
    ),
    client.query(
      `SELECT actor_label, actor_role, action, metadata, created_at
       FROM audit_logs
       WHERE target_type = 'role' AND metadata->>'role' = $1
       ORDER BY created_at DESC, id DESC LIMIT 12`,
      [role],
    ),
    client.query(
      `SELECT last_reviewed_at, next_review_due_at AS next_review_at, reviewed_by_label,
              (next_review_due_at IS NULL OR next_review_due_at <= CURRENT_TIMESTAMP) AS overdue
       FROM role_access_reviews WHERE role = $1`,
      [role],
    ),
  ]);
  const impactRow = impactResult.rows[0] || {};
  return {
    impact: { totalAccounts: Number(impactRow.total || impactRow.count || 0), sample: impactRow.sample || [] },
    history: historyResult.rows,
    review: reviewResult.rows[0] || { last_reviewed_at: null, next_review_at: null, reviewed_by_label: null, overdue: true },
  };
};

const getAccessRoles = async (req, res) => {
  try {
    const roles = await listAccessRoles();
    const data = await Promise.all(roles.map(async (role) => ({ ...role,
      assignable: canAssignAccessRole(req.accessContext || req.user, await loadRolePermissions(role.code)),
    })));
    return res.json({ data });
  } catch (error) {
    console.error("Error fetching access roles:", error);
    return res.status(500).json({ error: "Gagal memuat daftar role" });
  }
};

const getRolePermissions = async (req, res) => {
  try {
    const roles = await listAccessRoles();
    const requestedRole = String(req.query.role || "");
    const role = roles.some((item) => item.code === requestedRole) ? requestedRole : roles[0]?.code;
    if (!role) return res.status(404).json({ error: "Belum ada role backoffice" });
    const permissions = await loadRolePermissions(role);
    const governance = await getRoleGovernance(role);
    return res.json({
      role,
      roles,
      actions: ACTIONS,
      resources: RESOURCES,
      permissions,
      warnings: analyzePermissionRisks(permissions),
      ...governance,
    });
  } catch (error) {
    console.error("Error fetching role permissions:", error);
    return res.status(500).json({ error: "Gagal memuat hak akses role" });
  }
};

const updateRolePermissions = async (req, res) => {
  const role = req.params.role;
  if (!(await isBackofficeRole(role))) return res.status(400).json({ error: "Role tidak valid" });
  const normalized = normalizePermissionSubmission(req.body?.permissions);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const before = await loadRolePermissions(role, client);
    for (const resource of RESOURCES) {
      const permission = normalized[resource.key] || {};
      await client.query(
        `INSERT INTO role_permissions
           (role, resource, can_view, can_post, can_edit, can_delete, updated_at, updated_by_label)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
         ON CONFLICT (role, resource) DO UPDATE SET
           can_view = EXCLUDED.can_view,
           can_post = EXCLUDED.can_post,
           can_edit = EXCLUDED.can_edit,
           can_delete = EXCLUDED.can_delete,
           updated_at = CURRENT_TIMESTAMP,
           updated_by_label = EXCLUDED.updated_by_label`,
        [
          role,
          resource.key,
          resource.actions.includes("view") && permission.view === true,
          resource.actions.includes("post") && permission.post === true,
          resource.actions.includes("edit") && permission.edit === true,
          resource.actions.includes("delete") && permission.delete === true,
          req.user.full_name,
        ],
      );
    }
    await client.query("COMMIT");
    const changes = permissionChanges(before, normalized);
    await recordAudit({
      actorId: req.user.id || null,
      actorLabel: req.user.full_name,
      actorRole: req.user.role,
      action: "role_permissions.updated",
      targetType: "role",
      metadata: { role, changes, affectedAccounts: (await getRoleGovernance(role)).impact.totalAccounts },
    });
    const permissions = await loadRolePermissions(role);
    return res.json({ role, permissions, warnings: analyzePermissionRisks(permissions), ...(await getRoleGovernance(role)) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Error updating role permissions:", error);
    return res.status(500).json({ error: "Gagal menyimpan hak akses role" });
  } finally {
    client.release();
  }
};

const previewRolePermissions = async (req, res) => {
  const role = String(req.params.role || "").trim().toLowerCase();
  if (!(await isBackofficeRole(role))) return res.status(400).json({ error: "Role tidak valid" });
  try {
    const [current, governance] = await Promise.all([loadRolePermissions(role), getRoleGovernance(role)]);
    const proposed = normalizePermissionSubmission(req.body?.permissions);
    return res.json({
      role,
      changes: permissionChanges(current, proposed),
      warnings: analyzePermissionRisks(proposed),
      effective: proposed,
      ...governance,
    });
  } catch (error) {
    console.error("Error previewing role permissions:", error);
    return res.status(500).json({ error: "Gagal menyiapkan pratinjau perubahan akses" });
  }
};

const reviewRolePermissions = async (req, res) => {
  const role = String(req.params.role || "").trim().toLowerCase();
  if (!(await isBackofficeRole(role))) return res.status(400).json({ error: "Role tidak valid" });
  try {
    const { rows } = await pool.query(
      `INSERT INTO role_access_reviews (role, last_reviewed_at, next_review_due_at, reviewed_by_id, reviewed_by_label, updated_at)
       VALUES ($1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '6 months', $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (role) DO UPDATE SET last_reviewed_at = EXCLUDED.last_reviewed_at,
         next_review_due_at = EXCLUDED.next_review_due_at, reviewed_by_id = EXCLUDED.reviewed_by_id,
         reviewed_by_label = EXCLUDED.reviewed_by_label, updated_at = CURRENT_TIMESTAMP
       RETURNING last_reviewed_at, next_review_due_at AS next_review_at, reviewed_by_label, FALSE AS overdue`,
      [role, req.user?.id || null, req.user?.full_name || "Administrator KMS"],
    );
    await recordAudit({ actorId: req.user?.id || null, actorLabel: req.user?.full_name, actorRole: req.user?.role,
      action: "role_permissions.reviewed", targetType: "role", metadata: { role, nextReviewAt: rows[0]?.next_review_at } });
    return res.json({ role, review: rows[0] });
  } catch (error) {
    console.error("Error reviewing role permissions:", error);
    return res.status(500).json({ error: "Gagal mencatat peninjauan akses" });
  }
};

const createAccessRole = async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const code = normalizeRoleCode(req.body?.code || name);
  if (name.length < 3 || name.length > 80) return res.status(400).json({ error: "Nama role harus terdiri dari 3–80 karakter" });
  if (description.length > 255) return res.status(400).json({ error: "Deskripsi role maksimal 255 karakter" });
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(code)) return res.status(400).json({ error: "Nama role belum dapat dijadikan kode yang valid" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO access_roles (code, name, description, is_system, is_backoffice)
       VALUES ($1, $2, $3, FALSE, TRUE)
       RETURNING code, name, description, is_system, is_backoffice`,
      [code, name, description || null],
    );
    for (const resource of RESOURCES) {
      await client.query(
        `INSERT INTO role_permissions (role, resource)
         VALUES ($1, $2)
         ON CONFLICT (role, resource) DO NOTHING`,
        [code, resource.key],
      );
    }
    await client.query(
      `INSERT INTO role_access_reviews (role, next_review_due_at)
       VALUES ($1, CURRENT_TIMESTAMP)
       ON CONFLICT (role) DO NOTHING`,
      [code],
    );
    await client.query("COMMIT");
    await recordAudit({
      actorId: req.user.id || null,
      actorLabel: req.user.full_name,
      actorRole: req.user.role,
      action: "role.created",
      targetType: "role",
      metadata: { role: code, name },
    });
    return res.status(201).json({ role: rows[0], permissions: await loadRolePermissions(code) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    if (error.code === "23505") return res.status(409).json({ error: "Nama atau kode role sudah digunakan" });
    console.error("Error creating access role:", error);
    return res.status(500).json({ error: "Gagal menambahkan role" });
  } finally {
    client.release();
  }
};

const updateAccessRole = async (req, res) => {
  const code = String(req.params.role || "").trim().toLowerCase();
  const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!(await isBackofficeRole(code))) return res.status(404).json({ error: "Role tidak ditemukan" });
  if (name.length < 3 || name.length > 80) return res.status(400).json({ error: "Nama role harus terdiri dari 3–80 karakter" });
  if (description.length > 255) return res.status(400).json({ error: "Deskripsi role maksimal 255 karakter" });
  try {
    const { rows } = await pool.query(
      `UPDATE access_roles
       SET name = $1, description = $2, updated_at = CURRENT_TIMESTAMP
       WHERE code = $3 AND is_backoffice = TRUE
       RETURNING code, name, description, is_system, is_backoffice`,
      [name, description || null, code],
    );
    if (!rows[0]) return res.status(404).json({ error: "Role tidak ditemukan" });
    await recordAudit({
      actorId: req.user.id || null,
      actorLabel: req.user.full_name,
      actorRole: req.user.role,
      action: "role.updated",
      targetType: "role",
      metadata: { role: code, name },
    });
    return res.json({ role: rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Nama role sudah digunakan" });
    console.error("Error updating access role:", error);
    return res.status(500).json({ error: "Gagal mengubah role" });
  }
};

module.exports = {
  analyzePermissionRisks,
  createAccessRole,
  getAccessRoles,
  getRolePermissions,
  normalizePermissionSubmission,
  previewRolePermissions,
  reviewRolePermissions,
  updateAccessRole,
  updateRolePermissions,
};
