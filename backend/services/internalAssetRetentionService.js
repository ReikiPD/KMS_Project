const fs=require('node:fs/promises');
const pool=require('../config/db');
const {privateFilePath}=require('../middleware/internalUpload');
const {lockInternalAssetHierarchy}=require('./internalAssetUnitGuard');
const {recordAudit}=require('./auditService');
const queueFileCleanup=async(client,names,deletionId=null)=>{
  if(names.length)await client.query(`INSERT INTO internal_file_cleanup(file_name,deletion_id)
    SELECT unnest($1::text[]),$2::bigint ON CONFLICT(file_name) DO UPDATE
    SET deletion_id=COALESCE(internal_file_cleanup.deletion_id,EXCLUDED.deletion_id)`,[names,deletionId]);
};
const processInternalCleanup=async(limit=100,{deletionId=null}={})=>{
  const {rows}=await pool.query('SELECT file_name FROM internal_file_cleanup WHERE ($2::bigint IS NULL OR deletion_id=$2::bigint) ORDER BY queued_at LIMIT $1',[limit,deletionId]);
  const failed=[];let deleted=0;
  for(const row of rows){
    try{
      if((await pool.query('SELECT 1 FROM internal_asset_files WHERE file_name=$1',[row.file_name])).rowCount)continue;
      await fs.unlink(privateFilePath(row.file_name)).catch(error=>{if(error.code!=='ENOENT')throw error;});
      await pool.query('DELETE FROM internal_file_cleanup WHERE file_name=$1',[row.file_name]);deleted++;
    }catch(error){failed.push(row.file_name);await pool.query('UPDATE internal_file_cleanup SET attempts=attempts+1,last_error=$2,queued_at=CURRENT_TIMESTAMP WHERE file_name=$1',[row.file_name,error.code||error.message]);}
  }
  await pool.query(`UPDATE internal_asset_deletions d SET cleanup_completed_at=CURRENT_TIMESTAMP
    WHERE d.purged_at IS NOT NULL AND d.purge_method IS NOT NULL AND d.cleanup_completed_at IS NULL
    AND ($1::bigint IS NULL OR d.id=$1::bigint)
    AND NOT EXISTS(SELECT 1 FROM internal_file_cleanup q WHERE q.deletion_id=d.id)`,[deletionId]);
  return {deleted,failed};
};
// Caller holds the asset/hierarchy locks. Queue files and record the irreversible
// decision in the same transaction; physical I/O happens only after COMMIT.
const queueAssetPurge=async(client,assetId,deletionId,{method='retention',actorId=null,actorName='Sistem Retensi KMS',contextUserId=null}={})=>{
  const files=(await client.query('SELECT file_name FROM internal_asset_files WHERE asset_id=$1',[assetId])).rows;
  await queueFileCleanup(client,files.map(f=>f.file_name),deletionId);
  await client.query(`UPDATE internal_asset_deletions SET purged_at=CURRENT_TIMESTAMP,purge_method=$2,
    purge_actor_id=$3,purge_actor_name=$4,purge_context_user_id=$5 WHERE id=$1`,[deletionId,method,actorId,actorName,contextUserId]);
  await client.query('DELETE FROM internal_assets WHERE id=$1',[assetId]);
};
const purgeExpiredInternalAssets=async({batchSize=100}={})=>{
  const client=await pool.connect();let ids=[];
  try{
    await client.query('BEGIN');await lockInternalAssetHierarchy(client);
    ids=(await client.query("SELECT id FROM internal_assets WHERE deleted_at <= CURRENT_TIMESTAMP - INTERVAL '30 days' ORDER BY deleted_at,id LIMIT $1 FOR UPDATE SKIP LOCKED",[Math.min(500,Math.max(1,batchSize))])).rows.map(row=>row.id);
    for(const id of ids){
      let deletion=(await client.query('SELECT id FROM internal_asset_deletions WHERE asset_id=$1 AND restored_at IS NULL AND purged_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE',[id])).rows[0];
      // Also handle legacy/maintenance deletions that predate an event record.
      if(!deletion)deletion=(await client.query(`INSERT INTO internal_asset_deletions(asset_id,asset_public_id,title,owner_id,owner_name,work_unit_id,work_unit_name,actor_name,deleted_at)
        SELECT a.id,a.public_id,a.title,a.uploaded_by,u.full_name,a.work_unit_id,w.name,'Sistem Retensi KMS',a.deleted_at
        FROM internal_assets a JOIN work_units w ON w.id=a.work_unit_id LEFT JOIN users u ON u.id=a.uploaded_by WHERE a.id=$1 RETURNING id`,[id])).rows[0];
      await queueAssetPurge(client,id,deletion.id);
    }
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  if(ids.length)await recordAudit({actorLabel:'Sistem Retensi KMS',actorRole:'system',action:'internal_asset.retention_purged',targetType:'internal_asset_batch',metadata:{ids,retention:'30 days'}});
  return {count:ids.length,fileCleanup:await processInternalCleanup(500)};
};
module.exports={queueFileCleanup,queueAssetPurge,processInternalCleanup,purgeExpiredInternalAssets};
