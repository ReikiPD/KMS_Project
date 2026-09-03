const pool = require("../database/db");
const { recordAudit } = require("../services/auditService");
const { ACTIONS, RESOURCES, isBackofficeRole, listAccessRoles, loadRolePermissions } = require("../services/permissionService");

const normalizeRoleCode = (value) => String(value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 20);

const getAccessRoles = async (_req, res) => {
  try {
    return res.json({ data: await listAccessRoles() });
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
    return res.json({
      role,
      roles,
      actions: ACTIONS,
      resources: RESOURCES,
      permissions: await loadRolePermissions(role),
    });
  } catch (error) {
    console.error("Error fetching role permissions:", error);
    return res.status(500).json({ error: "Gagal memuat hak akses role" });
  }
};

const updateRolePermissions = async (req, res) => {
  const role = req.params.role;
  if (!(await isBackofficeRole(role))) return res.status(400).json({ error: "Role tidak valid" });
  const supplied = Array.isArray(req.body?.permissions) ? req.body.permissions : [];
  const byResource = new Map(supplied.map((item) => [item?.resource, item]));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const resource of RESOURCES) {
      const permission = byResource.get(resource.key) || {};
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
    await recordAudit({
      actorId: req.user.id || null,
      actorLabel: req.user.full_name,
      actorRole: req.user.role,
      action: "role_permissions.updated",
      targetType: "role",
      metadata: { role },
    });
    return res.json({ role, permissions: await loadRolePermissions(role) });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Error updating role permissions:", error);
    return res.status(500).json({ error: "Gagal menyimpan hak akses role" });
  } finally {
    client.release();
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

module.exports = { createAccessRole, getAccessRoles, getRolePermissions, updateAccessRole, updateRolePermissions };
