const pool = require("../database/db");

const createNotification = async ({ recipientId, actorId, assetId, commentId = null, type }) => {
  if (!recipientId || !actorId || recipientId === actorId) return null;

  const { rows } = await pool.query(
    `INSERT INTO notifications (recipient_id, actor_id, asset_id, comment_id, type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [recipientId, actorId, assetId, commentId, type],
  );

  return rows[0] || null;
};

module.exports = { createNotification };
