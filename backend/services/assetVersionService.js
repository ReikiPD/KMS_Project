// Actor metadata is transaction-local, never shared with the next pool request.
const setAssetVersionActor = (client, req, source = 'edit') => client.query(
  "SELECT set_config('kms.version_actor', $1, true)",
  [JSON.stringify({
    name: req.user?.full_name || 'Administrator KMS',
    role: req.user?.role || 'system',
    id: req.user?.id || null,
    context_name: req.accessContext?.full_name || null,
    context_role: req.accessContext?.role || null,
    source,
  })],
);

const queryWithAssetVersion = async (pool, req, sql, values, source = 'edit', beforeCommit = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setAssetVersionActor(client, req, source);
    const result = await client.query(sql, values);
    if (beforeCommit) await beforeCommit(result, client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const getVersionFiles = async (client, assetIds) => {
  const { rows } = await client.query(
    `SELECT snapshot->>'file_url' AS file_url, snapshot->>'thumbnail_url' AS thumbnail_url
     FROM asset_versions WHERE asset_id = ANY($1::integer[])`, [assetIds],
  );
  return rows.flatMap((row) => [row.file_url, row.thumbnail_url]);
};

module.exports = { setAssetVersionActor, queryWithAssetVersion, getVersionFiles };
