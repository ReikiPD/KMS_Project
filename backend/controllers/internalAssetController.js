const path=require('node:path');
const fs=require('node:fs/promises');
const pool=require('../config/db');
const {maxBytes,maxFiles,maxTotalBytes,validateInternalFiles}=require('../config/internalAssetLimits');
const {loadInternalScope,positiveId,selection,KINDS,canReadInternal}=require('../services/internalAssetService');
const {hasPermission}=require('../services/permissionService');
const {privateFilePath,discardUpload,formats}=require('../middleware/internalUpload');
const {validateNames}=require('../services/internalFileNames');
const {recordAudit}=require('../services/auditService');
const {lockInternalAssetHierarchy}=require('../services/internalAssetUnitGuard');
const {queueFileCleanup,queueAssetPurge,processInternalCleanup}=require('../services/internalAssetRetentionService');
const { PUBLIC_ID_PATTERN: UUID, omitFields } = require('../utils');
const fields=`a.public_id,a.title,a.year,a.data_type_id,t.name AS data_type_name,a.category_id,c.name AS category_name,
a.work_unit_id,w.name AS work_unit_name,w.alias AS work_unit_alias,a.uploaded_by,a.owner_environment,a.revision,a.deleted_at,a.updated_at,a.uploaded_at,
CASE WHEN a.owner_environment THEN 'Admin server' ELSE u.full_name END AS uploader_name,
(SELECT count(*)::int FROM internal_asset_files f WHERE f.asset_id=a.id) AS file_count,
(SELECT COALESCE(sum(f.file_size),0)::bigint FROM internal_asset_files f WHERE f.asset_id=a.id) AS total_size`;
const joins=`FROM internal_assets a JOIN work_units w ON w.id=a.work_unit_id JOIN internal_data_types t ON t.id=a.data_type_id
JOIN internal_data_categories c ON c.id=a.category_id LEFT JOIN users u ON u.id=a.uploaded_by`;
const problem=(message,status=400)=>Object.assign(new Error(message),{status});
const invalid=message=>problem(message);
const fail=(res,error)=>{if(res.headersSent)return res.destroy(error);if([400,403,404,409].includes(error.status))return res.status(error.status).json({error:error.message});console.error('Internal asset operation failed:',error.code||error.message);res.status(500).json({error:'Data internal belum dapat diproses. Silakan coba kembali.'});};
const audit=(req,action,id)=>recordAudit({actorId:req.user.id,actorLabel:req.user.full_name,actorRole:req.user.role,action,targetType:'internal_asset',targetId:id,metadata:{context_user_id:req.accessContext?.id||null}});
const capabilities=(req,a)=>{
 const s=req.internalScope.subject,owner=s.environmentAdmin||Boolean(s.id&&a.uploaded_by&&Number(s.id)===Number(a.uploaded_by));
 const edit=owner&&!s.read_only&&hasPermission(s,'internal_assets','edit');
 return {can_edit:Boolean(edit&&!a.deleted_at),can_delete:Boolean(owner&&!s.read_only&&!a.deleted_at&&hasPermission(s,'internal_assets','delete')),can_restore:Boolean(owner&&!s.read_only&&hasPermission(s,'internal_asset_recovery','view')&&hasPermission(s,'internal_asset_recovery','edit')&&a.deleted_at&&Date.now()-new Date(a.deleted_at).getTime()<30*86400000)};
};
const present = (req, asset) => ({
  ...omitFields(asset, ['id', 'file_name']),
  ...capabilities(req, asset),
});
const requireAsset=async(req,client=pool,{lock=false,deleted=false}={})=>{
 if(!UUID.test(req.params.id||''))throw problem('Data internal tidak ditemukan.',404);
 const {rows}=await client.query(`SELECT a.id,${fields} ${joins} WHERE a.public_id=$1 AND a.work_unit_id=ANY($2::int[]) AND w.deleted_at IS NULL ${deleted?'':'AND a.deleted_at IS NULL'} ${lock?'FOR UPDATE OF a':''}`,[req.params.id,req.internalScope.ids]);
 if(!rows[0])throw problem('Data internal tidak ditemukan.',404);return rows[0];
};
const fileRows=async(client,id)=>(await client.query('SELECT public_id,original_name,display_name,file_kind,mime_type,file_size,uploaded_at FROM internal_asset_files WHERE asset_id=$1 ORDER BY id',[id])).rows;
exports.getContext=async(req,res)=>{try{const scope=await loadInternalScope(req);if(!scope||!canReadInternal(scope.subject))return res.json({allowed:false});res.json({allowed:true,root:scope.root,units:scope.units,canView:hasPermission(scope.subject,'internal_assets','view'),canManageTypes:hasPermission(scope.subject,'internal_data_types','view'),canManageCategories:hasPermission(scope.subject,'internal_data_categories','view')});}catch(e){fail(res,e);}};
exports.getOptions=async(req,res)=>{try{
 const [{rows:types},{rows:categories},{rows:years}]=await Promise.all([pool.query('SELECT id,name FROM internal_data_types ORDER BY name LIMIT 500'),pool.query('SELECT id,name FROM internal_data_categories ORDER BY name LIMIT 500'),pool.query('SELECT DISTINCT year FROM internal_assets WHERE work_unit_id=ANY($1::int[]) AND deleted_at IS NULL ORDER BY year DESC',[req.internalScope.ids])]);
 res.json({types,categories,years:years.map(r=>r.year),units:req.internalScope.units,root:req.internalScope.root,maxBytes,maxFiles,maxTotalBytes,extensions:Object.keys(formats)});
}catch(e){fail(res,e);}};
exports.listAssets=async(req,res)=>{try{
 const limit=Math.min(50,Math.max(1,positiveId(req.query.limit)||10)),page=Math.min(100000,Math.max(1,positiveId(req.query.page)||1));
 const values=[req.internalScope.ids],where=['a.work_unit_id=ANY($1::int[])','w.deleted_at IS NULL'],add=(sql,value)=>{values.push(value);where.push(sql.replace('?',`$${values.length}`));};
 if(req.query.status==='deleted')throw problem('Buka halaman Riwayat Penghapusan untuk data terhapus.',403);
 where.push('a.deleted_at IS NULL');
 const branchIds=req.query.branch?req.internalScope.units.filter(u=>Number(u.branch_id)===positiveId(req.query.branch)).map(u=>u.id):null;
 if(branchIds&&!branchIds.length)throw invalid('Unit yang dipilih bukan bagian dari BKT.');
 const units=selection(req.query.units,req.internalScope.ids.map(String));if(units.length)add('a.work_unit_id=ANY(?::int[])',units);
 const kinds=selection(req.query.kinds,KINDS);if(kinds.length)add('EXISTS(SELECT 1 FROM internal_asset_files f WHERE f.asset_id=a.id AND f.file_kind=ANY(?::text[]))',kinds);
 for(const [key,column]of [['types','data_type_id'],['categories','category_id'],['years','year']]){if(req.query[key]){const selected=String(req.query[key]).split(',');if(selected.length>50||selected.some(v=>!positiveId(v)))throw invalid('Filter angka tidak valid.');add(`a.${column}=ANY(?::int[])`,selected);}}
 for(const [key,op]of [['from','>='],['to','<']]){if(req.query[key]){const date=String(req.query[key]);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw invalid('Tanggal filter tidak valid.');add(`a.uploaded_at ${op} ?::date${key==='to'?" + INTERVAL '1 day'":''}`,date);}}
 if(String(req.query.q||'').length>200)throw invalid('Pencarian maksimal 200 karakter.');
 for(const term of String(req.query.q||'').trim().split(/\s+/).filter(Boolean).slice(0,12))add(`concat_ws(' ',a.title,t.name,c.name,w.name,w.alias,a.year::text) ILIKE ?`,`%${term.replace(/[\\%_]/g,'\\$&')}%`);
 const sort={newest:'a.uploaded_at DESC,a.id DESC',oldest:'a.uploaded_at ASC,a.id ASC',az:'lower(a.title) ASC,a.id ASC',za:'lower(a.title) DESC,a.id DESC'}[req.query.sort||'newest'];if(!sort)throw invalid('Urutan tidak valid.');
 // Count all matching units in one scoped query, before the selected branch
 // and pagination narrow the list. Never derive badge counts from one page.
 const {rows:unitRows}=await pool.query(`SELECT a.work_unit_id,count(*)::int AS total ${joins} WHERE ${where.join(' AND ')} GROUP BY a.work_unit_id`,values);
 const unitsById=new Map(req.internalScope.units.map(unit=>[Number(unit.id),unit]));
 const unitCounts={total:0,branches:{}};
 for(const row of unitRows){const unit=unitsById.get(Number(row.work_unit_id));if(!unit)continue;const count=Number(row.total)||0;unitCounts.total+=count;const branch=String(unit.branch_id);unitCounts.branches[branch]=(unitCounts.branches[branch]||0)+count;}
 if(branchIds)add('a.work_unit_id=ANY(?::int[])',branchIds);
 const totalItems=branchIds?(unitCounts.branches[String(positiveId(req.query.branch))]||0):unitCounts.total;
 const clause=where.join(' AND ');
 const {rows}=await pool.query(`SELECT ${fields} ${joins} WHERE ${clause} ORDER BY ${sort} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,(page-1)*limit]);
 res.json({data:rows.map(a=>present(req,a)),pagination:{page,limit,totalItems,totalPages:Math.ceil(totalItems/limit)},unitCounts});
}catch(e){fail(res,e);}};
exports.getAsset=async(req,res)=>{try{const a=await requireAsset(req);res.json({...present(req,a),files:await fileRows(pool,a.id)});}catch(e){fail(res,e);}};
const metadata=req=>{
 const title=String(req.body.title||'').trim(),year=positiveId(req.body.year),workUnit=positiveId(req.body.work_unit_id),dataType=positiveId(req.body.data_type_id),category=positiveId(req.body.category_id);
 if(!title||title.length>300)throw invalid('Judul wajib diisi, maksimal 300 karakter.');
 if(!year||year<1000||year>9999)throw invalid('Tahun harus berupa empat digit.');
 if(!req.internalScope.ids.includes(workUnit))throw invalid('Pilih unit BKT, Eselon II, atau tim Eselon III di bawahnya.');
 if(!category||!dataType)throw invalid('Kategori dan jenis data wajib dipilih.');
 return {title,year,workUnit,dataType,category};
};
const insertFiles=async(client,id,files)=>{for(const f of files)await client.query(`INSERT INTO internal_asset_files(asset_id,file_name,original_name,file_kind,mime_type,file_size,display_name,name_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[id,f.filename,path.basename(f.originalname.replace(/\\/g,'/')).replace(/[\x00-\x1f\x7f]/g,'').slice(0,255),f.kind,f.canonicalMime,f.size,f.display_name,f.name_key]);};
const writeAsset=async(req,res,editing)=>{
 let client,asset,committed=false;
 try{
 const d=metadata(req);let files=req.internalFiles||[],removed=[];
 if(editing){try{removed=JSON.parse(req.body.remove_files||'[]');}catch{throw invalid('Daftar file yang dihapus tidak valid.');}if(!Array.isArray(removed)||removed.length>maxFiles||removed.some(id=>!UUID.test(id)))throw invalid('Daftar file yang dihapus tidak valid.');removed=[...new Set(removed)];}
 client=await pool.connect();await client.query('BEGIN');await lockInternalAssetHierarchy(client);
 const scope=await loadInternalScope(req,client);if(!scope)throw problem('Akses unit BKT berubah. Muat ulang halaman sebelum mengunggah kembali.',403);
 if(!scope.ids.includes(d.workUnit))throw invalid('Unit tujuan sudah tidak tersedia di BKT. Pilih kembali.');req.internalScope=scope;
 if(!(await client.query('SELECT 1 FROM internal_data_types t,internal_data_categories c WHERE t.id=$1 AND c.id=$2',[d.dataType,d.category])).rowCount)throw invalid('Jenis data atau kategori sudah tidak tersedia. Pilih kembali.');
 if(editing){
 asset=await requireAsset(req,client,{lock:true});if(!capabilities(req,asset).can_edit)throw problem('Hanya pemilik dengan izin EDIT yang dapat mengubah aset ini.',403);
 if(Number(req.body.revision)!==asset.revision)throw problem('Aset telah berubah. Muat ulang sebelum menyimpan kembali.',409);
 const existing=(await client.query('SELECT id,public_id,file_size,file_name,original_name,display_name FROM internal_asset_files WHERE asset_id=$1',[asset.id])).rows;
 if(removed.some(id=>!existing.some(f=>f.public_id===id)))throw invalid('File yang dipilih bukan bagian dari aset ini.');
 const named=validateNames(req.body,existing,files,removed),kept=named.kept;files=named.added;
 validateInternalFiles([...kept,...files]);
 await queueFileCleanup(client,existing.filter(f=>removed.includes(f.public_id)).map(f=>f.file_name));
 await client.query('DELETE FROM internal_asset_files WHERE asset_id=$1 AND public_id=ANY($2::uuid[])',[asset.id,removed]);
 // Temporary unique keys allow two retained files to exchange names atomically.
 await client.query("UPDATE internal_asset_files SET name_key='@rename:'||id WHERE asset_id=$1",[asset.id]);
 for(const f of kept)await client.query('UPDATE internal_asset_files SET display_name=$2,name_key=$3 WHERE id=$1',[f.id,f.display_name,f.name_key]);
 await client.query('UPDATE internal_assets SET title=$2,year=$3,work_unit_id=$4,data_type_id=$5,category_id=$6,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[asset.id,d.title,d.year,d.workUnit,d.dataType,d.category]);
 }else{
 validateInternalFiles(files);
 files=validateNames(req.body,[],files,[]).added;
 asset=(await client.query('INSERT INTO internal_assets(title,year,work_unit_id,data_type_id,category_id,uploaded_by,owner_environment) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,public_id',[d.title,d.year,d.workUnit,d.dataType,d.category,scope.subject.id||null,Boolean(scope.subject.environmentAdmin)])).rows[0];
 }
 await insertFiles(client,asset.id,files);if(req.aborted)throw invalid('Unggahan dibatalkan.');
 await client.query('COMMIT');committed=true;
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});if(!committed)await discardUpload(req);return fail(res,e);}finally{client?.release();}
 await audit(req,editing?'internal_asset_updated':'internal_asset_created',asset.id);
 res.status(editing?200:201).json({message:editing?'Perubahan aset berhasil disimpan.':'Aset internal berhasil disimpan.',public_id:asset.public_id});
 if(editing)processInternalCleanup().catch(e=>console.error('Internal cleanup pending:',e.message));
};
exports.createAsset=(req,res)=>writeAsset(req,res,false);
exports.updateAsset=(req,res)=>writeAsset(req,res,true);
exports.checkEditAccess=async(req,res,next)=>{try{const a=await requireAsset(req);if(!capabilities(req,a).can_edit)throw problem('Hanya pemilik dengan izin EDIT yang dapat mengubah aset ini.',403);next();}catch(e){fail(res,e);}};
const changeDeletion=async(req,res,restore)=>{
 let client,asset;
 try{client=await pool.connect();await client.query('BEGIN');await lockInternalAssetHierarchy(client);asset=await requireAsset(req,client,{lock:true,deleted:true});
 if(!capabilities(req,asset)[restore?'can_restore':'can_delete'])throw problem(restore?'Pemulihan tidak diizinkan atau masa 30 hari telah berakhir.':'Hanya pemilik dengan izin DELETE yang dapat menghapus aset ini.',403);
 if(Number(req.body.revision)!==asset.revision)throw problem('Aset telah berubah. Muat ulang halaman.',409);
 if(restore)await client.query('UPDATE internal_asset_deletions SET restored_at=CURRENT_TIMESTAMP WHERE asset_id=$1 AND restored_at IS NULL AND purged_at IS NULL',[asset.id]);
 else await client.query(`INSERT INTO internal_asset_deletions(asset_id,asset_public_id,title,owner_id,owner_name,work_unit_id,work_unit_name,actor_id,actor_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[asset.id,asset.public_id,asset.title,asset.uploaded_by,asset.uploader_name,asset.work_unit_id,asset.work_unit_name,req.user.id||null,req.user.full_name||'Admin server']);
 await client.query(`UPDATE internal_assets SET deleted_at=${restore?'NULL':'CURRENT_TIMESTAMP'},revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[asset.id]);await client.query('COMMIT');
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});return fail(res,e);}finally{client?.release();}
 await audit(req,restore?'internal_asset_restored':'internal_asset_deleted',asset.id);res.json({message:restore?'Aset dipulihkan.':'Aset dipindahkan ke Dihapus selama 30 hari.'});
};
exports.deleteAsset=(req,res)=>changeDeletion(req,res,false);
exports.restoreAsset=(req,res)=>changeDeletion(req,res,true);
const findFile=async(req)=>{
 const a=await requireAsset(req);if(req.params.fileId&&!UUID.test(req.params.fileId))throw invalid('Referensi file tidak valid.');
 const {rows}=await pool.query(`SELECT * FROM internal_asset_files WHERE asset_id=$1 ${req.params.fileId?'AND public_id=$2':''} ORDER BY id LIMIT 1`,req.params.fileId?[a.id,req.params.fileId]:[a.id]);
 if(!rows[0])throw problem('File tidak ditemukan.',404);return rows[0];
};
exports.getFile=async(req,res,next)=>{try{
 const f=await findFile(req),filePath=privateFilePath(f.file_name),native=['pdf','video','audio','image'].includes(f.file_kind);
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
 const callback=e=>{if(e&&!res.headersSent)res.status(e.code==='ENOENT'?404:500).json({error:'File belum dapat dibuka.'});else if(e)next(e);};
 if(req.query.download==='1'||!native)return res.download(filePath,f.display_name,{cacheControl:false,dotfiles:'allow'},callback);
 res.type(f.mime_type);return res.sendFile(filePath,{cacheControl:false,dotfiles:'allow'},callback);
}catch(e){fail(res,e);}};
exports.getPreview=async(req,res)=>{try{
 const f=await findFile(req),filePath=privateFilePath(f.file_name),ext=path.extname(filePath);
 if(['.docx','.xls','.xlsx','.csv','.pptx'].includes(ext))return res.json({status:'browser',format:ext.slice(1),maxPreviewBytes:20*1024*1024,message:'Preview baca-saja ditampilkan di browser. File asli tidak diubah.'});
 if(['.txt','.csv'].includes(ext)){const handle=await fs.open(filePath,'r'),buffer=Buffer.alloc(100*1024);let bytesRead;try{({bytesRead}=await handle.read(buffer,0,buffer.length,0));}finally{await handle.close();}return res.json({format:'text',text:buffer.subarray(0,bytesRead).toString('utf8'),limited:Number(f.file_size)>buffer.length});}
 res.json({unsupported:true,message:'Format ini belum mendukung preview isi. Unduh file untuk membukanya dengan aplikasi yang sesuai.'});
}catch(e){fail(res,e);}};
exports.getPreviewPdf=async(req,res)=>{try{await findFile(req);res.status(410).json({code:'PREVIEW_CONVERSION_RETIRED',message:'Konversi PDF dihentikan. Muat ulang aplikasi untuk preview langsung di browser.'});}catch(e){fail(res,e);}};
exports.listDeletions=async(req,res)=>{try{
 const subject=req.internalScope.subject,limit=Math.min(50,positiveId(req.query.limit)||10),page=Math.min(100000,positiveId(req.query.page)||1),values=[];
 const where=subject.environmentAdmin?'TRUE':(values.push(subject.id||null),'d.owner_id=$1');
 const count=(await pool.query(`SELECT count(*)::int AS total FROM internal_asset_deletions d WHERE ${where}`,values)).rows[0].total;
 const rows=(await pool.query(`SELECT d.*,a.revision,a.uploaded_by AS current_owner_id,a.work_unit_id AS current_unit_id,
   (a.deleted_at=d.deleted_at) AS current_deletion
   FROM internal_asset_deletions d LEFT JOIN internal_assets a ON a.id=d.asset_id WHERE ${where} ORDER BY d.deleted_at DESC,d.id DESC LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,(page-1)*limit])).rows;
 res.json({data:rows.map(({current_owner_id,current_unit_id,current_deletion,...d})=>{
   const active=Boolean(!subject.read_only&&d.asset_id&&current_deletion&&!d.restored_at&&!d.purged_at
     &&req.internalScope.ids.includes(Number(current_unit_id))
     &&(subject.environmentAdmin||Boolean(subject.id&&Number(subject.id)===Number(current_owner_id))));
   return {...d,can_restore:active&&hasPermission(subject,'internal_asset_recovery','edit')&&Date.now()-new Date(d.deleted_at).getTime()<30*86400000,
     can_purge:active&&hasPermission(subject,'internal_asset_recovery','delete'),
     cleanup_status:!d.purged_at?null:d.cleanup_completed_at?'complete':d.purge_method?'pending':'legacy'};
 }),pagination:{totalItems:count}});
 }catch(e){fail(res,e);}};
exports.permanentlyDeleteAsset=async(req,res)=>{
 let client,event,asset;
 try{
  if(!UUID.test(req.params.deletionId||''))throw problem('Catatan penghapusan tidak ditemukan.',404);
  if(req.body.confirmation!=='HAPUS PERMANEN')throw invalid('Ketik HAPUS PERMANEN untuk mengonfirmasi.');
  client=await pool.connect();await client.query('BEGIN');await lockInternalAssetHierarchy(client);
  const scope=await loadInternalScope(req,client);
  if(!scope)throw problem('Aset di luar cakupan akses.',403);
  const subject=scope.subject;
  event=(await client.query('SELECT * FROM internal_asset_deletions WHERE public_id=$1',[req.params.deletionId])).rows[0];
  if(!event||(!subject.environmentAdmin&&(!subject.id||Number(subject.id)!==Number(event.owner_id))))throw problem('Catatan penghapusan tidak ditemukan.',404);
  if(subject.read_only)throw problem('Akun baca-saja tidak dapat menghapus permanen.',403);
  if(!event.asset_id||event.restored_at||event.purged_at)throw problem('Aset sudah dipulihkan atau dihapus permanen. Muat ulang riwayat.',409);
  asset=(await client.query('SELECT * FROM internal_assets WHERE id=$1 FOR UPDATE',[event.asset_id])).rows[0];
  event=(await client.query('SELECT * FROM internal_asset_deletions WHERE public_id=$1 FOR UPDATE',[req.params.deletionId])).rows[0];
  if(!asset||!asset.deleted_at||event.restored_at||event.purged_at||!event.asset_id
    ||!(await client.query('SELECT 1 FROM internal_assets a JOIN internal_asset_deletions d ON d.asset_id=a.id WHERE d.id=$1 AND a.deleted_at=d.deleted_at',[event.id])).rowCount
    ||Number(req.body.revision)!==asset.revision)throw problem('Status aset telah berubah. Muat ulang riwayat sebelum menghapus permanen.',409);
  if(!scope.ids.includes(Number(asset.work_unit_id)))throw problem('Aset di luar cakupan akses.',403);
  if(!subject.environmentAdmin&&(!subject.id||Number(subject.id)!==Number(asset.uploaded_by)))throw problem('Hanya pemilik dengan izin DELETE yang dapat menghapus permanen.',403);
  await queueAssetPurge(client,asset.id,event.id,{method:'manual',actorId:req.user.id||null,actorName:req.user.full_name||'Admin server',contextUserId:req.accessContext?.id||null});
  await client.query('COMMIT');
 }catch(e){if(client)await client.query('ROLLBACK').catch(()=>{});return fail(res,e);}finally{client?.release();}
 await audit(req,'internal_asset_permanently_deleted',asset.public_id);
 let complete=false;
 try{
  await processInternalCleanup(100,{deletionId:event.id});
  complete=Boolean((await pool.query('SELECT cleanup_completed_at FROM internal_asset_deletions WHERE id=$1',[event.id])).rows[0]?.cleanup_completed_at);
 }catch(e){console.error('Internal purge cleanup pending:',e.code||e.message);}
 res.status(complete?200:202).json({cleanup_status:complete?'complete':'pending',message:complete?'Aset dan seluruh berkas berhasil dihapus permanen. Catatan riwayat tetap tersimpan.':'Aset tidak dapat dipulihkan. Pembersihan berkas tertunda dan akan dicoba kembali otomatis.'});
};
exports.downloadZip=async(req,res)=>{try{
 const a=await requireAsset(req),files=(await pool.query('SELECT * FROM internal_asset_files WHERE asset_id=$1 ORDER BY id',[a.id])).rows;
 for(const f of files)await fs.access(privateFilePath(f.file_name));
 const {ZipArchive}=await import('archiver'),archive=new ZipArchive({store:true});
 res.attachment((a.title.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,100)||'aset-internal')+'.zip');
 archive.on('error',e=>res.destroy(e));archive.on('warning',e=>res.destroy(e));res.on('close',()=>archive.abort());archive.pipe(res);
 files.forEach(file => archive.file(privateFilePath(file.file_name), { name: file.display_name }));
 await archive.finalize();
}catch(e){fail(res,e);}};
// Table and column identifiers come only from these local configurations.
const createReferenceHandlers = ({ table, alias, assetColumn, label, nameLabel, auditPrefix }) => ({
  list: async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${alias}.id,${alias}.name,${alias}.created_at,count(a.id)::int AS asset_count FROM ${table} ${alias} LEFT JOIN internal_assets a ON a.${assetColumn}=${alias}.id GROUP BY ${alias}.id ORDER BY ${alias}.name LIMIT 500`,
      );
      res.json({ data: rows });
    } catch (error) {
      fail(res, error);
    }
  },
  save: async (req, res) => {
    try {
      const name = String(req.body.name || '').trim();
      if (!name || name.length > 100) throw invalid(`Nama ${nameLabel} wajib diisi, maksimal 100 karakter.`);
      const result = req.params.id
        ? await pool.query(`UPDATE ${table} SET name=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2 RETURNING id,name`, [name, positiveId(req.params.id)])
        : await pool.query(`INSERT INTO ${table}(name) VALUES($1) RETURNING id,name`, [name]);
      if (!result.rowCount) return res.status(404).json({ error: `${label} tidak ditemukan.` });
      await audit(req, `${auditPrefix}_${req.params.id ? 'updated' : 'created'}`, result.rows[0].id);
      res.status(req.params.id ? 200 : 201).json(result.rows[0]);
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: `Nama ${nameLabel} sudah digunakan.` });
      fail(res, error);
    }
  },
  remove: async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id=$1`, [positiveId(req.params.id)]);
      if (!rowCount) return res.status(404).json({ error: `${label} tidak ditemukan.` });
      await audit(req, `${auditPrefix}_deleted`, positiveId(req.params.id));
      res.json({ message: `${label} dihapus.` });
    } catch (error) {
      if (error.code === '23503') return res.status(409).json({ error: `${label} masih dipakai oleh aset internal dan tidak dapat dihapus.` });
      fail(res, error);
    }
  },
});

const types = createReferenceHandlers({
  table: 'internal_data_types', alias: 't', assetColumn: 'data_type_id',
  label: 'Jenis data', nameLabel: 'jenis data', auditPrefix: 'internal_type',
});
const categories = createReferenceHandlers({
  table: 'internal_data_categories', alias: 'c', assetColumn: 'category_id',
  label: 'Kategori', nameLabel: 'kategori', auditPrefix: 'internal_category',
});

exports.listTypes = types.list;
exports.saveType = types.save;
exports.deleteType = types.remove;
exports.listCategories = categories.list;
exports.saveCategory = categories.save;
exports.deleteCategory = categories.remove;
