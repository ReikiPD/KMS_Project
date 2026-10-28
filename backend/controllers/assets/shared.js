const pool = require("../../config/db");
const { PUBLIC_ID_PATTERN } = require("../../utils");
const { hasOrganizationScope } = require("../../services/permissionService");

const PUBLIC_ASSET_JOINS = `
  FROM knowledge_assets a
  LEFT JOIN users u ON a.author_id = u.id AND u.deleted_at IS NULL
  LEFT JOIN categories c ON a.category_id = c.id
  LEFT JOIN work_units w ON a.work_unit_id = w.id
  LEFT JOIN work_units parent_w ON w.parent_id = parent_w.id
  LEFT JOIN work_units grandparent_w ON parent_w.parent_id = grandparent_w.id
`;

const PUBLIC_WORK_UNIT_FILTER = `(
  a.work_unit_id IS NULL
  OR (
    w.id IS NOT NULL
    AND NOT EXISTS (
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_id, is_public, deleted_at FROM work_units WHERE id = w.id
        UNION ALL
        SELECT parent.id, parent.parent_id, parent.is_public, parent.deleted_at
        FROM work_units parent INNER JOIN ancestors child ON child.parent_id = parent.id
      )
      SELECT 1 FROM ancestors WHERE deleted_at IS NOT NULL OR is_public = FALSE
    )
  )
)`;

const PUBLIC_ASSET_RELATIONS = `
  CASE WHEN u.id IS NULL
    THEN json_build_object('id', NULL, 'full_name', 'Pegawai tidak aktif', 'department', NULL)
    ELSE json_build_object('id', u.id, 'full_name', u.full_name, 'department', u.department)
  END AS author,
  CASE WHEN c.id IS NULL THEN NULL
    ELSE json_build_object('id', c.id, 'name', c.name, 'slug', c.slug)
  END AS category,
  CASE WHEN w.id IS NULL THEN NULL
    ELSE json_build_object(
      'id', w.id,
      'name', w.name,
      'alias', w.alias,
      'logo_url', w.logo_url,
      'echelon_level', w.echelon_level,
      'parent_id', w.parent_id,
      'parent_name', parent_w.name,
      'parent_alias', parent_w.alias,
      'parent_logo_url', parent_w.logo_url,
      'grandparent_name', grandparent_w.name,
      'grandparent_alias', grandparent_w.alias,
      'grandparent_logo_url', grandparent_w.logo_url
    )
  END AS work_unit
`;

const PUBLIC_ASSET_SELECT = `
  SELECT
    a.id,
    a.public_id,
    a.title,
    a.slug,
    a.asset_type,
    a.file_url,
    a.content,
    a.thumbnail_url,
    a.video_duration_seconds,
    a.video_chapters,
    a.is_featured,
    a.is_published,
    a.allow_download,
    a.deleted_at,
    a.view_count,
    a.created_at,
    a.updated_at,
    ${PUBLIC_ASSET_RELATIONS}
  ${PUBLIC_ASSET_JOINS}
`;

const PUBLIC_ASSET_CARD_SELECT = `
  SELECT
    a.id,
    a.public_id,
    a.title,
    a.slug,
    a.asset_type,
    a.file_url,
    a.thumbnail_url,
    a.allow_download,
    a.view_count,
    a.created_at,
    ${PUBLIC_ASSET_RELATIONS}
  ${PUBLIC_ASSET_JOINS}
`;

const addAssetIdentifierFilter = (values, value, alias = "a") => {
  const identifier = typeof value === "string" ? value.trim() : String(value || "");
  if (!identifier) return null;
  const prefix = alias ? `${alias}.` : "";
  if (PUBLIC_ID_PATTERN.test(identifier)) {
    return `${prefix}public_id = $${values.push(identifier)}::uuid`;
  }
  if (/^\d+$/.test(identifier)) {
    const numericId = Number.parseInt(identifier, 10);
    if (Number.isInteger(numericId) && numericId > 0) {
      return `${prefix}id = $${values.push(numericId)}`;
    }
  }
  return `${prefix}slug = $${values.push(identifier)}`;
};

const getSearchTerms = (value, maxTerms = 8) => {
  if (typeof value !== "string") return [];
  const candidates = value.match(/[\p{L}\p{N}]+/gu) || [];
  const seen = new Set();
  return candidates.filter((term) => {
    const normalized = term.toLocaleLowerCase("id-ID");
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  }).slice(0, maxTerms);
};

const slugify = (value) => {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "draft";
  return /^\d+$/.test(slug) ? `aset-${slug}` : slug;
};

const getAvailableSlug = async (value, excludedId = null, queryable = pool) => {
  const baseSlug = slugify(value).slice(0, 240);
  let sequence = 1;

  while (sequence <= 1000) {
    const suffix = sequence === 1 ? "" : `-${sequence}`;
    const candidate = `${baseSlug.slice(0, 255 - suffix.length)}${suffix}`;
    const { rows } = await queryable.query(
      `SELECT 1 FROM knowledge_assets
       WHERE slug = $1 AND deleted_at IS NULL
         AND ($2::integer IS NULL OR id <> $2)
       LIMIT 1`,
      [candidate, excludedId],
    );
    if (!rows[0]) return candidate;
    sequence += 1;
  }

  throw new Error("Tidak dapat membuat slug aset yang unik");
};

const getRequestedAuthorId = (req, source = req.query.authorId, write = false) => {
  const requested = Number.parseInt(source, 10);
  const hasRequestedAuthor = Number.isInteger(requested) && requested > 0;
  const subject = req.accessContext || req.user;
  if (write && subject?.read_only) return { error: "Akses akun ini baca-saja" };
  if (write ? subject?.environmentAdmin : hasOrganizationScope(subject)) return { authorId: hasRequestedAuthor ? requested : null };
  if (req.accessContext?.id) {
    if (hasRequestedAuthor && requested !== req.accessContext.id) return { error: "Konteks akun hanya dapat mengakses aset akun yang sedang dipilih" };
    return { authorId: req.accessContext.id };
  }
  if (hasRequestedAuthor && requested !== req.user.id) {
    return { error: "Gunakan akses akun melalui Daftar Staf untuk bekerja dengan aset akun lain" };
  }
  return { authorId: req.user.id };
};

const auditActor = (req) => ({
  actorId: req.user.id || null,
  actorLabel: req.user.role === "admin" ? req.user.full_name : null,
  actorRole: req.user.role,
});

module.exports = {
  PUBLIC_ASSET_JOINS,
  PUBLIC_WORK_UNIT_FILTER,
  PUBLIC_ASSET_RELATIONS,
  PUBLIC_ASSET_SELECT,
  PUBLIC_ASSET_CARD_SELECT,
  addAssetIdentifierFilter,
  getSearchTerms,
  slugify,
  getAvailableSlug,
  getRequestedAuthorId,
  auditActor,
};
