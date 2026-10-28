const pool = require('../config/db');
const { hasGlobalStaffScope } = require('./permissionService');

const isWorkUnitInScope = async (parentId, targetId, client = pool) => {
  if (!parentId || !targetId) return false;
  const { rowCount } = await client.query(`WITH RECURSIVE scoped_units AS (
    SELECT id FROM work_units WHERE id = $1 AND deleted_at IS NULL
    UNION
    SELECT child.id FROM work_units child JOIN scoped_units parent ON child.parent_id = parent.id
    WHERE child.deleted_at IS NULL
  ) SELECT 1 FROM scoped_units WHERE id = $2 LIMIT 1`, [parentId, targetId]);
  return rowCount > 0;
};

const canManageStaffUnit = async (subject, targetUnitId, client = pool) => {
  if (!subject || subject.read_only) return false;
  if (!hasGlobalStaffScope(subject) && !await isWorkUnitInScope(subject.work_unit_id, targetUnitId, client)) return false;
  // A delegated account cannot use its own wider tree to escape the issuer's.
  for (const boundary of subject.staff_scope_boundaries || []) {
    if (!await isWorkUnitInScope(boundary, targetUnitId, client)) return false;
  }
  return true;
};

// SQL identifiers are internal constants supplied by controllers, never request input.
const unitScopePredicate = (subject, values, column, global = hasGlobalStaffScope(subject)) => {
  const roots = [...(!global ? [subject?.work_unit_id || null] : []), ...(subject?.staff_scope_boundaries || [])];
  return roots.map(root => `${column} IN (WITH RECURSIVE scoped_units AS (
    SELECT id FROM work_units WHERE id = $${values.push(root)} AND deleted_at IS NULL
    UNION SELECT child.id FROM work_units child JOIN scoped_units parent ON child.parent_id = parent.id
    WHERE child.deleted_at IS NULL
  ) SELECT id FROM scoped_units)`).join(' AND ') || 'TRUE';
};

const staffScopePredicate = (subject, values, alias = 'u', { excludeSelf = true } = {}) => {
  const filters = [
    `${alias}.deleted_at IS NULL`,
    `EXISTS (SELECT 1 FROM access_roles ar WHERE ar.code = ${alias}.role AND ar.is_backoffice = TRUE)`,
    unitScopePredicate(subject, values, `${alias}.work_unit_id`),
  ];
  if (excludeSelf && !hasGlobalStaffScope(subject) && subject?.id) filters.push(`${alias}.id <> $${values.push(subject.id)}`);
  return filters.join(' AND ');
};

module.exports = { isWorkUnitInScope, canManageStaffUnit, staffScopePredicate, unitScopePredicate };
