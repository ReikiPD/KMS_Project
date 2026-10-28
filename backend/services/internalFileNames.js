const path=require('node:path');
const error=message=>Object.assign(new Error(message),{status:400});
function validateNames(body,existing,files,removed){
 let names;
 try{names=body.file_names?JSON.parse(body.file_names):null;}catch{throw error('Nama lampiran tidak valid.');}
 if(names!==null&&(!names||!Array.isArray(names.added)||typeof names.existing!=='object'||names.existing===null||Array.isArray(names.existing)||names.added.length!==files.length))throw error('Nama lampiran tidak sesuai dengan berkas.');
 const kept=existing.filter(f=>!removed.includes(f.public_id));const seen=new Set();
 const clean=(value,original)=>{
  if(typeof value!=='string')throw error('Nama lampiran wajib diisi.');
  const name=value.normalize('NFC').trim(),ext=path.extname(original).toLowerCase();
  if(!name||name.length>255||/[\x00-\x1f\x7f/\\<>:"|?*]/.test(name)||name.endsWith('.')||path.extname(name).toLowerCase()!==ext||!name.slice(0,-ext.length).trim())throw error('Nama lampiran tidak valid. Isi nama tanpa mengubah ekstensi atau memakai karakter folder.');
  const key=name.toLowerCase();if(seen.has(key))throw error(`Nama lampiran "${name}" sama. Ganti nama sebelum menyimpan.`);seen.add(key);return {display_name:name,name_key:key};
 };
 return {kept:kept.map(f=>({...f,...clean(names?.existing[f.public_id]??f.display_name??f.original_name,f.original_name)})),added:files.map((f,i)=>({...f,...clean(names?.added[i]??path.basename(f.originalname.replace(/\\/g,'/')),f.originalname)}))};
}
module.exports={validateNames};
