const pool = require("../database/db");

const createNotification = async ({ recipientId, actorId = null, assetId, commentId = null, type }, database = pool) => {
  if (!recipientId || !assetId || !type) return null;
  if (actorId && Number(recipientId) === Number(actorId)) return null;

  const { rows } = await database.query(
    `INSERT INTO notifications (recipient_id, actor_id, asset_id, comment_id, type)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [recipientId, actorId, assetId, commentId, type],
  );

  return rows[0] || null;
};

const notifyPublicationReviewers = async ({ actorId, assetId, workUnitId }, database = pool) => {
  if (!actorId || !assetId || !workUnitId) return [];

  const { rows } = await database.query(
    `WITH RECURSIVE unit_ancestors AS (
       SELECT id, parent_id
       FROM work_units
       WHERE id = $3 AND deleted_at IS NULL
       UNION ALL
       SELECT parent.id, parent.parent_id
       FROM work_units parent
       INNER JOIN unit_ancestors child ON child.parent_id = parent.id
       WHERE parent.deleted_at IS NULL
     )
     INSERT INTO notifications (recipient_id, actor_id, asset_id, type)
     SELECT DISTINCT account.id, $1, $2, 'asset_submitted'
     FROM users account
     INNER JOIN role_permissions permission
       ON permission.role = account.role
      AND permission.resource = 'asset_verification'
      AND permission.can_view = TRUE
      AND permission.can_edit = TRUE
     WHERE account.deleted_at IS NULL
       AND account.id <> $1
       AND account.work_unit_id IN (SELECT id FROM unit_ancestors)
     RETURNING id, recipient_id`,
    [actorId, assetId, workUnitId],
  );

  return rows;
};

module.exports = { createNotification, notifyPublicationReviewers };
