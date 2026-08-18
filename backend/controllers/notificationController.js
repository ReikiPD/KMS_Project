const pool = require("../database/db");

const getNotificationId = (value) => {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const getNotifications = async (req, res) => {
  const limitValue = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 50) : 12;
  const pageValue = Number.parseInt(req.query.page, 10);
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const offset = (page - 1) * limit;
  const state = req.query.state === "unread" ? "unread" : "all";
  const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const values = [req.user.id];
  const filters = ["n.recipient_id = $1"];
  if (state === "unread") filters.push("n.is_read = FALSE");
  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;
    filters.push(`(COALESCE(a.title, '') ILIKE ${parameter} OR COALESCE(u.full_name, '') ILIKE ${parameter})`);
  }
  const whereClause = filters.join(" AND ");

  try {
    const [notificationsResult, unreadResult, totalResult] = await Promise.all([
      pool.query(
        `SELECT
           n.id,
           n.type,
           n.asset_id,
           n.comment_id,
           n.is_read,
           n.created_at,
           a.title AS asset_title,
           u.full_name AS actor_name,
           u.avatar_url AS actor_avatar_url
         FROM notifications n
         LEFT JOIN knowledge_assets a ON a.id = n.asset_id
         LEFT JOIN users u ON u.id = n.actor_id AND u.deleted_at IS NULL
         WHERE ${whereClause}
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset],
      ),
      pool.query(
        "SELECT COUNT(*)::INTEGER AS count FROM notifications WHERE recipient_id = $1 AND is_read = FALSE",
        [req.user.id],
      ),
      pool.query(
        `SELECT COUNT(*)::INTEGER AS count
         FROM notifications n
         LEFT JOIN knowledge_assets a ON a.id = n.asset_id
         LEFT JOIN users u ON u.id = n.actor_id AND u.deleted_at IS NULL
         WHERE ${whereClause}`,
        values,
      ),
    ]);
    const totalItems = totalResult.rows[0].count;

    res.json({
      data: notificationsResult.rows,
      unreadCount: unreadResult.rows[0].count,
      pagination: { currentPage: page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Gagal memuat notifikasi" });
  }
};

const markNotificationRead = async (req, res) => {
  const notificationId = getNotificationId(req.params.id);
  if (!notificationId) return res.status(400).json({ error: "ID notifikasi tidak valid" });

  try {
    const { rows } = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND recipient_id = $2
       RETURNING id, is_read`,
      [notificationId, req.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: "Notifikasi tidak ditemukan" });
    res.json(rows[0]);
  } catch (error) {
    console.error("Error marking notification as read:", error);
    res.status(500).json({ error: "Gagal memperbarui notifikasi" });
  }
};

const markAllNotificationsRead = async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      "UPDATE notifications SET is_read = TRUE WHERE recipient_id = $1 AND is_read = FALSE",
      [req.user.id],
    );
    res.json({ updatedCount: rowCount });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    res.status(500).json({ error: "Gagal memperbarui notifikasi" });
  }
};

module.exports = { getNotifications, markNotificationRead, markAllNotificationsRead };
