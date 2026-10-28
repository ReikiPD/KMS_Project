// Uploads share this transaction-scoped lock; hierarchy mutations take it
// exclusively. Always acquire it before locking work-unit rows so a concurrent
// upload cannot commit under a unit that has just been archived or moved away.
const lockInternalAssetHierarchy = (client, exclusive = false) => client.query(
  exclusive
    ? 'SELECT pg_advisory_xact_lock($1::int, $2::int)'
    : 'SELECT pg_advisory_xact_lock_shared($1::int, $2::int)',
  [0x4b4d5301, 33],
);

// Must be called inside the hierarchy mutation's locked transaction.
const getInternalUnitMutationError = async (client, current, payload = null) => {
  const removing = payload === null;
  const { rows: settings } = await client.query('SELECT root_work_unit_id FROM internal_asset_settings');
  const rootId = settings[0]?.root_work_unit_id;
  if (Number(current.id) === Number(rootId)
    && (removing || payload.echelonLevel !== 1 || payload.parentId !== null)) {
    return 'Unit BKT merupakan acuan Aset Data Internal dan tidak dapat dihapus, dipindahkan, atau diubah tingkat organisasinya.';
  }
  if (!removing && payload.echelonLevel === Number(current.echelon_level)
    && payload.parentId === (current.parent_id === null ? null : Number(current.parent_id))) return null;

  // Include archived descendants too: historical references must not disappear
  // merely because a branch was previously archived outside this workflow.
  const { rows: assets } = await client.query(`
    WITH RECURSIVE descendants AS (
      SELECT id FROM work_units WHERE id = $1
      UNION
      SELECT child.id FROM work_units child JOIN descendants parent ON child.parent_id = parent.id
    )
    SELECT EXISTS(SELECT 1 FROM internal_assets WHERE work_unit_id IN (SELECT id FROM descendants)) AS present`,
  [current.id]);
  if (!assets[0].present) return null;
  if (removing) return 'Unit Kerja atau turunannya masih memiliki aset internal dan tidak dapat dihapus.';

  const { rows: parents } = await client.query(`
    WITH RECURSIVE ancestors AS (
      SELECT id, parent_id FROM work_units WHERE id = $1 AND deleted_at IS NULL
      UNION
      SELECT parent.id, parent.parent_id FROM work_units parent
      JOIN ancestors child ON child.parent_id = parent.id WHERE parent.deleted_at IS NULL
    )
    SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = $2) AS inside_bkt`,
  [payload.parentId, rootId ?? null]);
  return parents[0].inside_bkt ? null
    : 'Unit Kerja atau turunannya masih memiliki aset internal dan tidak dapat dipindahkan keluar BKT.';
};

module.exports = { lockInternalAssetHierarchy, getInternalUnitMutationError };
