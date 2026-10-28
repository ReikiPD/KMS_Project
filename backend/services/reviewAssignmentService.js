// Listing and saving an assignment must use the same permission and unit rules.
const findEligibleReviewers = async (database, { asset = null, scopeUnitId = null, verifierPublicId = null } = {}) => {
  const values = [];
  const filters = ["u.deleted_at IS NULL", "permission.can_view = TRUE", "permission.can_edit = TRUE", "(u.organization_scope = 'all' OR w.id IS NOT NULL)"];
  let cte = "";
  if (asset) {
    cte = `WITH RECURSIVE eligible_units AS (
      SELECT id, parent_id FROM work_units WHERE id = $${values.push(asset.work_unit_id)} AND deleted_at IS NULL
      UNION
      SELECT parent.id, parent.parent_id FROM work_units parent
      JOIN eligible_units child ON child.parent_id = parent.id WHERE parent.deleted_at IS NULL
    )`;
    filters.push("(u.organization_scope = 'all' OR u.work_unit_id IN (SELECT id FROM eligible_units))");
    filters.push(`u.id IS DISTINCT FROM $${values.push(asset.author_id)}::integer`);
  } else if (scopeUnitId) {
    cte = `WITH RECURSIVE eligible_units AS (
      SELECT id FROM work_units WHERE id = $${values.push(scopeUnitId)} AND deleted_at IS NULL
      UNION
      SELECT child.id FROM work_units child JOIN eligible_units parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )`;
    filters.push("u.work_unit_id IN (SELECT id FROM eligible_units)");
  }
  if (verifierPublicId) filters.push(`u.public_id = $${values.push(verifierPublicId)}::uuid`);
  const { rows } = await database.query(
    `${cte}
     SELECT u.id, u.public_id, u.full_name, u.role, u.work_unit_id,
            CASE WHEN u.organization_scope = 'all' THEN 'Admin — seluruh unit' ELSE COALESCE(NULLIF(w.alias, ''), w.name) END AS work_unit_name
     FROM users u
     JOIN role_permissions permission ON permission.role = u.role AND permission.resource = 'asset_verification'
     JOIN access_roles role ON role.code = u.role AND role.is_backoffice = TRUE
     LEFT JOIN work_units w ON w.id = u.work_unit_id AND w.deleted_at IS NULL
     WHERE ${filters.join(" AND ")}
     ORDER BY u.full_name, u.id`,
    values,
  );
  return rows;
};

module.exports = { findEligibleReviewers };
