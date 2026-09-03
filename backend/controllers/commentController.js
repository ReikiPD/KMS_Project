const pool = require("../database/db");
const { createNotification } = require("../services/notificationService");
const { recordAudit } = require("../services/auditService");

const MAX_COMMENT_LENGTH = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getId = (value) => {
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const getPublicAsset = async (assetReference) => {
  const normalized = String(assetReference || "").trim();
  if (!normalized) return null;
  const [filter, value] = UUID_PATTERN.test(normalized)
    ? ["a.public_id = $1::uuid", normalized]
    : /^\d+$/.test(normalized)
      ? ["a.id = $1", Number.parseInt(normalized, 10)]
      : ["a.slug = $1", normalized];
  const { rows } = await pool.query(
    `SELECT a.id, a.author_id
     FROM knowledge_assets a
     LEFT JOIN work_units w ON w.id = a.work_unit_id
     WHERE ${filter}
       AND a.is_published = TRUE
       AND a.deleted_at IS NULL
       AND (a.work_unit_id IS NULL OR (
         w.id IS NOT NULL AND NOT EXISTS (
           WITH RECURSIVE ancestors AS (
             SELECT id, parent_id, is_public, deleted_at FROM work_units WHERE id = w.id
             UNION ALL
             SELECT parent.id, parent.parent_id, parent.is_public, parent.deleted_at
             FROM work_units parent INNER JOIN ancestors child ON child.parent_id = parent.id
           )
           SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL OR is_public = FALSE
         )
       ))`,
    [value],
  );
  return rows[0] || null;
};

const getManagedAsset = async (assetReference, user, accessContext = null) => {
  const normalized = String(assetReference || "").trim();
  if (!normalized) return null;
  const values = [];
  const filter = UUID_PATTERN.test(normalized)
    ? `public_id = $${values.push(normalized)}::uuid`
    : /^\d+$/.test(normalized)
      ? `id = $${values.push(Number.parseInt(normalized, 10))}`
      : `slug = $${values.push(normalized)}`;
  const scopedAuthorId = accessContext?.id || (user.role === "admin" ? null : user.id);
  const ownerFilter = scopedAuthorId
    ? ` AND author_id = $${values.push(scopedAuthorId)}`
    : "";
  const { rows } = await pool.query(
    `SELECT id FROM knowledge_assets
     WHERE ${filter} AND deleted_at IS NULL${ownerFilter}`,
    values,
  );
  return rows[0] || null;
};

const ensureActiveUser = async (userId) => {
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL",
    [userId],
  );
  return rows[0] || null;
};

const formatComment = (row) => ({
  id: row.id,
  asset_id: row.asset_id,
  parent_id: row.parent_id,
  content: row.content,
  is_deleted: Boolean(row.deleted_at),
  created_at: row.created_at,
  updated_at: row.updated_at,
  author: row.user_id
    ? {
        id: row.user_id,
        full_name: row.full_name,
        avatar_url: row.avatar_url,
        role: row.role,
      }
    : null,
});

const toCommentTree = (rows) => {
  const byId = new Map();
  const roots = [];

  rows.forEach((row) => {
    byId.set(row.id, { ...formatComment(row), replies: [] });
  });

  byId.forEach((comment) => {
    if (comment.parent_id && byId.has(comment.parent_id)) {
      byId.get(comment.parent_id).replies.push(comment);
    } else {
      roots.push(comment);
    }
  });

  const keepVisibleBranches = (comment) => {
    const replies = comment.replies.map(keepVisibleBranches).filter(Boolean);
    if (comment.is_deleted && replies.length === 0) return null;
    return { ...comment, replies };
  };

  return roots.map(keepVisibleBranches).filter(Boolean);
};

const commentSelect = `
  SELECT
    c.id,
    c.asset_id,
    c.user_id,
    c.parent_id,
    CASE WHEN c.deleted_at IS NULL THEN c.content ELSE NULL END AS content,
    c.created_at,
    c.updated_at,
    c.deleted_at,
    CASE WHEN u.id IS NULL THEN 'Pengguna tidak aktif' ELSE u.full_name END AS full_name,
    CASE WHEN u.id IS NULL THEN NULL ELSE u.avatar_url END AS avatar_url,
    CASE WHEN u.id IS NULL THEN NULL ELSE u.role END AS role
  FROM comments c
  LEFT JOIN users u ON u.id = c.user_id AND u.deleted_at IS NULL
`;

const getAssetComments = async (req, res) => {
  try {
    const asset = await getPublicAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan" });
    const assetId = asset.id;

    const { rows } = await pool.query(
      `${commentSelect}
       WHERE c.asset_id = $1
       ORDER BY c.created_at ASC, c.id ASC`,
      [assetId],
    );
    const totalResult = await pool.query(
      "SELECT COUNT(*)::INTEGER AS count FROM comments WHERE asset_id = $1 AND deleted_at IS NULL",
      [assetId],
    );

    res.json({
      data: toCommentTree(rows),
      totalItems: totalResult.rows[0].count,
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Gagal memuat komentar" });
  }
};

const createComment = async (req, res) => {
  const parentId = req.body.parentId ? getId(req.body.parentId) : null;
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

  if (!content) return res.status(400).json({ error: "Komentar tidak boleh kosong" });
  if (content.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `Komentar maksimal ${MAX_COMMENT_LENGTH} karakter` });
  }
  if (req.body.parentId && !parentId) {
    return res.status(400).json({ error: "ID komentar induk tidak valid" });
  }

  try {
    const [asset, user] = await Promise.all([
      getPublicAsset(req.params.id),
      ensureActiveUser(req.user.id),
    ]);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan" });
    if (!user) return res.status(401).json({ error: "Sesi pengguna tidak valid" });
    const assetId = asset.id;

    let parentAuthorId = null;
    if (parentId) {
      const { rows } = await pool.query(
        `SELECT id, user_id FROM comments
         WHERE id = $1 AND asset_id = $2 AND deleted_at IS NULL`,
        [parentId, assetId],
      );
      if (!rows[0]) {
        return res.status(400).json({ error: "Komentar induk tidak tersedia untuk dibalas" });
      }
      parentAuthorId = rows[0].user_id;
    }

    const { rows } = await pool.query(
      `INSERT INTO comments (asset_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, asset_id, user_id, parent_id, content, created_at, updated_at, deleted_at`,
      [assetId, req.user.id, content, parentId],
    );
    const authorResult = await pool.query(
      "SELECT full_name, avatar_url, role FROM users WHERE id = $1",
      [req.user.id],
    );

    const notifications = new Map();
    if (asset.author_id && asset.author_id !== req.user.id) {
      notifications.set(asset.author_id, { type: "comment" });
    }
    if (parentAuthorId && parentAuthorId !== req.user.id) {
      notifications.set(parentAuthorId, { type: "reply" });
    }
    await Promise.all(
      [...notifications.entries()].map(([recipientId, notification]) => createNotification({
        recipientId,
        actorId: req.user.id,
        assetId,
        commentId: rows[0].id,
        type: notification.type,
      })),
    );
    await recordAudit({ actorId: req.user.id, action: "comment.created", targetType: "comment", targetId: rows[0].id, metadata: { assetId } });

    res.status(201).json({
      ...formatComment({ ...rows[0], ...authorResult.rows[0] }),
      replies: [],
    });
  } catch (error) {
    console.error("Error creating comment:", error);
    res.status(500).json({ error: "Gagal mengirim komentar" });
  }
};

const updateComment = async (req, res) => {
  const commentId = getId(req.params.commentId);
  const content = typeof req.body.content === "string" ? req.body.content.trim() : "";

  if (!commentId) return res.status(400).json({ error: "ID komentar tidak valid" });
  if (!content) return res.status(400).json({ error: "Komentar tidak boleh kosong" });
  if (content.length > MAX_COMMENT_LENGTH) {
    return res.status(400).json({ error: `Komentar maksimal ${MAX_COMMENT_LENGTH} karakter` });
  }

  try {
    const asset = await getPublicAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan" });
    const assetId = asset.id;
    const { rows: comments } = await pool.query(
      "SELECT id, user_id FROM comments WHERE id = $1 AND asset_id = $2 AND deleted_at IS NULL",
      [commentId, assetId],
    );
    if (!comments[0]) return res.status(404).json({ error: "Komentar tidak ditemukan" });
    if (comments[0].user_id !== req.user.id) {
      return res.status(403).json({ error: "Anda hanya dapat mengubah komentar sendiri" });
    }

    const { rows } = await pool.query(
      `UPDATE comments
       SET content = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, asset_id, user_id, parent_id, content, created_at, updated_at, deleted_at`,
      [content, commentId],
    );
    const authorResult = await pool.query(
      "SELECT full_name, avatar_url, role FROM users WHERE id = $1",
      [req.user.id],
    );
    await recordAudit({ actorId: req.user.id, action: "comment.updated", targetType: "comment", targetId: commentId, metadata: { assetId } });
    res.json({ ...formatComment({ ...rows[0], ...authorResult.rows[0] }), replies: [] });
  } catch (error) {
    console.error("Error updating comment:", error);
    res.status(500).json({ error: "Gagal mengubah komentar" });
  }
};

const deleteComment = async (req, res) => {
  const commentId = getId(req.params.commentId);
  if (!commentId) return res.status(400).json({ error: "ID komentar tidak valid" });

  try {
    const asset = await getPublicAsset(req.params.id);
    if (!asset) return res.status(404).json({ error: "Aset tidak ditemukan" });
    const assetId = asset.id;
    const { rows: comments } = await pool.query(
      "SELECT id, user_id FROM comments WHERE id = $1 AND asset_id = $2 AND deleted_at IS NULL",
      [commentId, assetId],
    );
    if (!comments[0]) return res.status(404).json({ error: "Komentar tidak ditemukan" });
    if (comments[0].user_id !== req.user.id) {
      return res.status(403).json({ error: "Anda hanya dapat menghapus komentar sendiri" });
    }

    await pool.query(
      "UPDATE comments SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [commentId],
    );
    await recordAudit({ actorId: req.user.id, action: "comment.deleted", targetType: "comment", targetId: commentId, metadata: { assetId } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ error: "Gagal menghapus komentar" });
  }
};

const getOwnedAssetComments = async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 15));
  const offset = (page - 1) * limit;
  const state = req.query.state === "deleted" ? "deleted" : req.query.state === "active" ? "active" : "all";
  const search = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const values = [req.user.id];
  const filters = ["a.author_id = $1", "a.deleted_at IS NULL"];
  if (state === "active") filters.push("c.deleted_at IS NULL");
  if (state === "deleted") filters.push("c.deleted_at IS NOT NULL");
  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;
    filters.push(`(a.title ILIKE ${parameter} OR COALESCE(c.content, '') ILIKE ${parameter} OR COALESCE(u.full_name, '') ILIKE ${parameter})`);
  }
  const whereClause = filters.join(" AND ");

  try {
    const countResult = await pool.query(
      `SELECT COUNT(*)::INTEGER AS count
       FROM comments c
       INNER JOIN knowledge_assets a ON a.id = c.asset_id
       LEFT JOIN users u ON u.id = c.user_id
       WHERE ${whereClause}`,
      values,
    );
    const { rows } = await pool.query(
      `SELECT c.id, c.asset_id, c.content, c.parent_id, c.created_at, c.updated_at, c.deleted_at,
              a.title AS asset_title, a.is_published,
              u.full_name AS author_name, u.avatar_url AS author_avatar_url
       FROM comments c
       INNER JOIN knowledge_assets a ON a.id = c.asset_id
       LEFT JOIN users u ON u.id = c.user_id AND u.deleted_at IS NULL
       WHERE ${whereClause}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );
    const totalItems = countResult.rows[0].count;
    res.json({ data: rows, pagination: { currentPage: page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) } });
  } catch (error) {
    console.error("Error fetching owned asset comments:", error);
    res.status(500).json({ error: "Gagal memuat komentar aset Anda" });
  }
};

const moderateOwnedAssetComment = async (req, res) => {
  const commentId = getId(req.params.commentId);
  if (!commentId) return res.status(400).json({ error: "Referensi komentar tidak valid" });

  try {
    const asset = await getManagedAsset(req.params.id, req.user, req.accessContext);
    if (!asset) return res.status(403).json({ error: "Anda hanya dapat memoderasi komentar pada aset sendiri" });
    const assetId = asset.id;
    const result = await pool.query(
      `UPDATE comments SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND asset_id = $2 AND deleted_at IS NULL
       RETURNING id`,
      [commentId, assetId],
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Komentar tidak ditemukan atau sudah disembunyikan" });
    await recordAudit({
      actorId: req.user.id || null,
      actorLabel: req.user.role === "admin" ? req.user.full_name : null,
      actorRole: req.user.role,
      action: "comment.moderated", targetType: "comment", targetId: commentId, metadata: { assetId },
    });
    res.status(204).send();
  } catch (error) {
    console.error("Error moderating comment:", error);
    res.status(500).json({ error: "Gagal menyembunyikan komentar" });
  }
};

module.exports = {
  getAssetComments,
  createComment,
  updateComment,
  deleteComment,
  getOwnedAssetComments,
  moderateOwnedAssetComment,
};
