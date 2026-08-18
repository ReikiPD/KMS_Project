const pool = require("../database/db");

const recordAudit = async ({ actorId = null, actorLabel = null, actorRole = null, action, targetType, targetId = null, metadata = {} }) => {
  if ((!actorId && !actorLabel) || !action || !targetType) return;
  try {
    await pool.query(
      `INSERT INTO audit_logs (actor_id, actor_label, actor_role, action, target_type, target_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [actorId, actorLabel, actorRole, action, targetType, targetId, JSON.stringify(metadata)],
    );
  } catch (error) {
    // An audit failure must never make a successful user action fail.
    console.error("Error recording audit event:", error.message);
  }
};

module.exports = { recordAudit };
