const pool = require('../config/db');
const { hasPermission, hasOrganizationScope } = require('./permissionService');

const treeSql = `WITH RECURSIVE units AS (
  SELECT w.*, w.id AS branch_id FROM work_units w
  JOIN internal_asset_settings s ON s.root_work_unit_id=w.id
  WHERE w.deleted_at IS NULL
  UNION ALL
  SELECT child.*, CASE WHEN child.echelon_level=2 THEN child.id ELSE parent.branch_id END
  FROM work_units child JOIN units parent ON child.parent_id=parent.id
  WHERE child.deleted_at IS NULL
) SELECT * FROM units ORDER BY echelon_level,sort_order,name,id`;

const loadInternalScope = async (request, client = pool) => {
  const { rows } = await client.query(treeSql);
  const ids = new Set(rows.map(row=>Number(row.id)));
  const subject = request.accessContext || request.user;
  const root = rows.find(row=>Number(row.echelon_level)===1);
  // Ministry-wide scope includes BKT. It is an account scope, not a role name
  // or the separate staff-directory permission to browse every unit.
  // In account mode both the issuer and effective account must qualify; the
  // target's permissions/read-only restrictions are still enforced by routes.
  const includesBkt = account => Boolean(account && (account.id || account.environmentAdmin)
    && (hasOrganizationScope(account) || ids.has(Number(account.work_unit_id))));
  if (!root || !includesBkt(request.user) || !includesBkt(subject)) return null;
  return { subject, units:rows, ids:[...ids], root };
};

const requireInternalScope = async (req,res,next) => {
  try {
    req.internalScope=await loadInternalScope(req);
    if (!req.internalScope) return res.status(403).json({error:'Aset Data Internal hanya tersedia untuk akun BKT dan turunannya atau akun bercakupan seluruh kementerian, sesuai izin akses.'});
    return next();
  } catch(error) { next(error); }
};

const positiveId = value => /^\d+$/.test(String(value||'')) && Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null;
const selection = (value, allowed) => {
  if (!value) return [];
  const items=[...new Set(String(value).split(','))];
  if(items.length>50 || items.some(item=>!allowed.includes(item))) throw Object.assign(new Error('Pilihan filter tidak valid'),{status:400});
  return items;
};
const KINDS=['pdf','spreadsheet','word','presentation','video','audio','image','other'];
const canReadInternal = user => hasPermission(user,'internal_assets','view')
  || hasPermission(user,'internal_asset_recovery','view') || hasPermission(user,'internal_data_types','view') || hasPermission(user,'internal_data_categories','view');

module.exports={loadInternalScope,requireInternalScope,positiveId,selection,KINDS,canReadInternal};
