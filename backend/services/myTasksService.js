// Counts and rows share one SQL snapshot; pagination never loads entire catalogs.
const TASK_TABS = new Set(["actionable", "drafts", "pending", "reviews", "decisions", "notifications"]);
const { hasOrganizationScope } = require('./permissionService');

const getTaskAccess = (req, hasPermission) => {
  const subject = req.accessContext || req.user;
  const global = hasOrganizationScope(subject);
  return {
    subject,
    global,
    assets: hasPermission(subject, "assets", "view"),
    editAssets: hasPermission(subject, "assets", "view") && hasPermission(subject, "assets", "edit"),
    reviews: hasPermission(subject, "asset_verification", "view"),
    decide: hasPermission(subject, "asset_verification", "view") && hasPermission(subject, "asset_verification", "edit"),
    notifications: !req.accessContext && Boolean(req.user?.id),
    context: Boolean(req.accessContext),
  };
};

const positiveInteger = (value, fallback, max) => /^\d+$/.test(String(value || ""))
  ? Math.min(max, Math.max(1, Number(value))) : fallback;

const loadMyTasks = async (req, database, hasPermission) => {
  const access = getTaskAccess(req, hasPermission);
  const { subject } = access;
  const tab = TASK_TABS.has(req.query?.tab) ? req.query.tab : "actionable";
  const limit = positiveInteger(req.query?.limit, 8, 25);
  const requestedPage = positiveInteger(req.query?.page, 1, 100000);
  const search = typeof req.query?.q === "string" ? req.query.q.trim().slice(0, 120) : "";
  const values = [
    subject?.id || null, subject?.work_unit_id || null, access.global,
    access.assets, access.reviews, access.notifications, req.user?.id || null,
    access.editAssets, access.decide, tab, search, limit, requestedPage,
  ];
  const { rows } = await database.query(`
    WITH RECURSIVE scoped_units AS (
      SELECT id FROM work_units WHERE id = $2::integer AND deleted_at IS NULL
      UNION
      SELECT child.id FROM work_units child JOIN scoped_units parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    ), tasks AS (
      SELECT 'asset:' || a.id AS task_key, a.publication_status::text AS kind,
             a.public_id, a.slug, a.title, a.asset_type, a.author_id,
             COALESCE(u.full_name, 'Akun tidak aktif') AS author_name,
             COALESCE(w.alias, w.name, 'Unit kerja belum diisi') AS work_unit_name,
             a.review_note, COALESCE(reviewer.full_name, 'Verifikator KMS') AS reviewer_name,
             a.reviewed_at, a.updated_at AS event_at,
             CASE a.publication_status WHEN 'revision_required' THEN 1 WHEN 'draft' THEN 3 ELSE 4 END AS priority,
             NULL::integer AS notification_id, NULL::text AS notification_type,
             NULL::text AS actor_name,
             (a.publication_status IN ('draft', 'revision_required') AND $8::boolean) AS actionable
      FROM knowledge_assets a
      LEFT JOIN users u ON u.id = a.author_id
      LEFT JOIN work_units w ON w.id = a.work_unit_id
      LEFT JOIN users reviewer ON reviewer.id = a.reviewed_by
      WHERE $4::boolean AND a.deleted_at IS NULL
        AND ($3::boolean OR a.author_id = $1::integer)
        AND (a.publication_status IN ('draft', 'revision_required', 'pending_review', 'rejected')
          OR (a.publication_status = 'approved' AND a.reviewed_at IS NOT NULL))
      UNION ALL
      SELECT 'review:' || a.id, 'review_queue', a.public_id, a.slug, a.title, a.asset_type, a.author_id,
             COALESCE(u.full_name, 'Akun tidak aktif'), COALESCE(w.alias, w.name, 'Unit kerja belum diisi'),
             NULL::text, NULL::text, NULL::timestamp, a.submitted_at, 2,
             NULL::integer, NULL::text, NULL::text, $9::boolean
      FROM knowledge_assets a
      LEFT JOIN users u ON u.id = a.author_id
      LEFT JOIN work_units w ON w.id = a.work_unit_id
      WHERE $5::boolean AND a.deleted_at IS NULL AND a.publication_status = 'pending_review'
        AND ($3::boolean OR a.work_unit_id IN (SELECT id FROM scoped_units))
        AND a.author_id IS DISTINCT FROM $1::integer
        AND a.author_id IS DISTINCT FROM $7::integer
      UNION ALL
      SELECT 'notification:' || n.id, 'notification', a.public_id, a.slug, a.title, a.asset_type, a.author_id,
             NULL::text, NULL::text, NULL::text, NULL::text, NULL::timestamp, n.created_at, 5,
             n.id, n.type::text, COALESCE(actor.full_name, 'KMS'), FALSE
      FROM notifications n
      JOIN knowledge_assets a ON a.id = n.asset_id AND a.deleted_at IS NULL
      LEFT JOIN users actor ON actor.id = n.actor_id AND actor.deleted_at IS NULL
      WHERE $6::boolean AND n.recipient_id = $7::integer AND n.is_read = FALSE
    ), counts AS (
      SELECT COUNT(*) FILTER (WHERE actionable)::integer AS actionable,
             COUNT(*) FILTER (WHERE kind = 'draft')::integer AS drafts,
             COUNT(*) FILTER (WHERE kind = 'revision_required')::integer AS revisions,
             COUNT(*) FILTER (WHERE kind = 'pending_review')::integer AS pending,
             COUNT(*) FILTER (WHERE kind = 'review_queue')::integer AS reviews,
             COUNT(*) FILTER (WHERE kind IN ('approved', 'revision_required', 'rejected'))::integer AS decisions,
             COUNT(*) FILTER (WHERE kind = 'notification')::integer AS notifications
      FROM tasks
    ), filtered AS (
      SELECT * FROM tasks WHERE CASE $10::text
        WHEN 'drafts' THEN kind = 'draft'
        WHEN 'pending' THEN kind = 'pending_review'
        WHEN 'reviews' THEN kind = 'review_queue'
        WHEN 'decisions' THEN kind IN ('approved', 'revision_required', 'rejected')
        WHEN 'notifications' THEN kind = 'notification'
        ELSE actionable END
        AND ($11::text = '' OR STRPOS(LOWER(CONCAT_WS(' ', title, author_name, work_unit_name, actor_name)), LOWER($11::text)) > 0)
    ), paging AS (
      SELECT COUNT(*)::integer AS total,
             LEAST($13::integer, GREATEST(1, CEIL(COUNT(*)::numeric / $12::integer)::integer)) AS page
      FROM filtered
    ), page_rows AS (
      SELECT * FROM filtered
      ORDER BY CASE WHEN $10::text = 'actionable' THEN priority ELSE 0 END,
        CASE WHEN $10::text IN ('actionable', 'reviews') THEN event_at END ASC NULLS LAST,
        event_at DESC NULLS LAST, task_key
      LIMIT $12::integer OFFSET (SELECT (page - 1) * $12::integer FROM paging)
    )
    SELECT ROW_TO_JSON(counts) AS counts, paging.total, paging.page,
           COALESCE((SELECT JSON_AGG(page_rows) FROM page_rows), '[]'::json) AS data
    FROM counts CROSS JOIN paging`, values);
  const result = rows[0];
  return {
    data: result.data,
    counts: result.counts,
    tab,
    pagination: { currentPage: result.page, limit, totalItems: result.total, totalPages: Math.ceil(result.total / limit) },
    scope: {
      type: access.global ? "all" : access.context ? "account" : "self",
      name: subject?.full_name || "Administrator KMS",
      workUnitName: subject?.work_unit_name || null,
    },
    capabilities: {
      assets: access.assets, editAssets: access.editAssets, reviews: access.reviews,
      decide: access.decide, notifications: access.notifications,
      create: hasPermission(subject, "assets", "post"),
      reviewScopeMissing: access.reviews && !access.global && !subject?.work_unit_id,
    },
  };
};

module.exports = { getTaskAccess, loadMyTasks };
