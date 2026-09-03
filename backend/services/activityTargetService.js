const pool = require("../database/db");

const activityTargetError = (status, message) => Object.assign(new Error(message), { status });

const resolveActivityTarget = async (req) => {
  const staffReference = typeof req.query.staff === "string" ? req.query.staff.trim() : "";

  if (!staffReference) {
    if (req.user?.id) return { id: req.user.id, fullName: req.user.full_name, role: req.user.role, isSelf: true };
    throw activityTargetError(400, "Pilih Pegawai terlebih dahulu");
  }

  if (req.user?.role !== "admin" || req.accessContext) {
    throw activityTargetError(403, "Hanya Admin yang dapat melihat aktivitas Pegawai lain");
  }

  const { rows } = await pool.query(
    `SELECT id, public_id, full_name, email, department, role
     FROM users
     WHERE public_id::text = $1
       AND role = 'pegawai'
       AND deleted_at IS NULL`,
    [staffReference],
  );
  if (!rows[0]) throw activityTargetError(404, "Pegawai yang dipilih tidak ditemukan");
  return { ...rows[0], fullName: rows[0].full_name, isSelf: rows[0].id === req.user?.id };
};

module.exports = { resolveActivityTarget };
