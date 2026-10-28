import ValidatedForm from "../../../../components/ValidatedForm";
import {useEffect,useRef,useState} from 'react';
import {useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {Alert,Button,CardPlain,SelectDropdown,Modal,TextField} from '@idds/react';
import {ArrowLeft,FileUp,Info,Paperclip,Plus,Save,Trash2,Undo2} from 'lucide-react';
import AdminPageHeader from '../../../../components/AdminPageHeader';
import {InternalFileBadge,useInternalAssets,fileKindFromName,fileSize,unitOptions} from '../../../../features/internal-assets';
import {apiFetch,apiUpload,inputValue} from '../../../../lib/api';
import useAdminView from '../../../../hooks/useAdminView';
import {useAuth} from '../../../../contexts/AuthContext';
import '../../../../features/internal-assets/styles/internal-assets.css';
import useFormDraftGuard from '../../../../hooks/useFormDraftGuard';
import FormDraftStatus from '../../../../components/FormDraftStatus';

export default function InternalAssetCreatePage(){
 const navigate=useNavigate(),{id}=useParams(),[params]=useSearchParams(),scope=useInternalAssets();
 const {accessUser,withEmployeeContext}=useAdminView(),{user}=useAuth();
 const [options,setOptions]=useState(null),[error,setError]=useState(''),[files,setFiles]=useState([]),[existing,setExisting]=useState([]),[removed,setRemoved]=useState([]);
 const [asset,setAsset]=useState(null),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[progress,setProgress]=useState(0),[dragging,setDragging]=useState(false);
 const [newNames,setNewNames]=useState([]),[existingNames,setExistingNames]=useState({});
 const splitName=name=>{const dot=name.lastIndexOf('.');return {stem:dot>0?name.slice(0,dot):name,ext:dot>0?name.slice(dot):''};};
 const requestRef=useRef(null),fileRef=useRef(null),[conflict,setConflict]=useState(false);
 const [form,setForm]=useState({title:'',year:String(new Date().getFullYear()),data_type_id:'',category_id:'',work_unit_id:params.get('unit')||String((accessUser||user)?.work_unit_id||'')});
 const guard=useFormDraftGuard({form,removed,newNames,existingNames,files:files.map(f=>[f.name,f.size,f.lastModified])},!loading);
 const change=(key,value)=>setForm(current=>({...current,[key]:value}));
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);setFiles([]);setRemoved([]);setError('');setAsset(null);
  (async()=>{
   const response=await apiFetch('/api/internal-assets/options',{signal:abort.signal}),body=await response.json();
   if(!response.ok)throw new Error(body.error||'Form belum dapat dimuat.');
   if(abort.signal.aborted)return;setOptions(body);
   if(id){const r=await apiFetch(`/api/internal-assets/${id}`,{signal:abort.signal}),a=await r.json();
    if(!r.ok)throw new Error(a.error||'Aset belum dapat dimuat.');
    if(!a.can_edit)throw new Error('Anda tidak memiliki izin untuk mengedit aset ini.');
    if(abort.signal.aborted)return;setAsset(a);setExisting(a.files||[]);setExistingNames(Object.fromEntries((a.files||[]).map(f=>[f.public_id,splitName(f.display_name||f.original_name).stem])));setForm(Object.fromEntries(['title','year','data_type_id','category_id','work_unit_id'].map(key=>[key,String(a[key]??'')])));
   }
  })().catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return ()=>{abort.abort();requestRef.current?.abort();};
 },[id]);
 const kept=existing.filter(f=>!removed.includes(f.public_id)),count=kept.length+files.length,total=kept.reduce((n,f)=>n+Number(f.file_size),0)+files.reduce((n,f)=>n+f.size,0);
 const ready=options&&!loading&&(!id||asset)&&!conflict;
 const maxFiles=options?.maxFiles??20,maxTotalBytes=options?.maxTotalBytes??20*1024**3;
 const chooseFiles=selected=>{
  if(!ready||saving)return;
  const accepted=[...files],names=[...newNames],issues=[];let size=total;
  for(const f of Array.from(selected||[])){
   const ext=f.name.split('.').pop().toLowerCase();
   if(!options.extensions.includes(ext)||!f.size||f.size>options.maxBytes){issues.push(`${f.name}: format tidak didukung, file kosong, atau melebihi ${fileSize(options.maxBytes)}.`);continue;}
   if(kept.length+accepted.length>=maxFiles||size+f.size>maxTotalBytes){issues.push(`${f.name}: batas ${maxFiles} file atau total ${fileSize(maxTotalBytes)} terlampaui.`);continue;}
   accepted.push(f);names.push(splitName(f.name).stem);size+=f.size;
  }
  setFiles(accepted);setNewNames(names);setError(issues.join(' '));
  if(fileRef.current)fileRef.current.value='';
 };
 const finalNames=[...kept.map(f=>(existingNames[f.public_id]||'').trim()+splitName(f.original_name).ext),...files.map((f,i)=>(newNames[i]||'').trim()+splitName(f.name).ext)];
 const nameGroups=new Map();
 for(const name of finalNames){
  const key=name.normalize('NFC').toLowerCase(),group=nameGroups.get(key);
  if(group)group.count+=1;else nameGroups.set(key,{name,count:1});
 }
 const duplicateNames=[...nameGroups.values()].filter(group=>group.count>1),duplicate=duplicateNames.length>0;
 const badName=[...kept.map(f=>existingNames[f.public_id]||''),...newNames].some(n=>!n.trim()||[...n].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127||'/\\<>:"|?*'.includes(c)));
 const submit=async event=>{
  event.preventDefault();if(requestRef.current||!ready)return;setError('');
  if(duplicate||badName){setError('Nama berkas harus valid dan berbeda dalam satu aset. Ganti nama yang sama sebelum menyimpan.');return;}
  if(!count||count>maxFiles||total>maxTotalBytes||!form.data_type_id||!form.category_id||!scope.units.some(u=>String(u.id)===form.work_unit_id)){setError(`Lengkapi informasi dan pilih 1–${maxFiles} file, total maksimal ${fileSize(maxTotalBytes)}.`);return;}
  const request=new AbortController();requestRef.current=request;setSaving(true);setProgress(0);
  try{
   const body=new FormData();Object.entries(form).forEach(([key,value])=>body.append(key,value));files.forEach(f=>body.append('files',f));
   body.append('file_names',JSON.stringify({added:files.map((f,i)=>newNames[i].trim()+splitName(f.name).ext),existing:Object.fromEntries(kept.map(f=>[f.public_id,existingNames[f.public_id].trim()+splitName(f.original_name).ext]))}));
   if(id){body.append('revision',String(asset.revision));body.append('remove_files',JSON.stringify(removed));}
   const result=await apiUpload(`/api/internal-assets${id?'/'+id:''}`,{method:id?'PUT':'POST',body,signal:request.signal,onProgress:setProgress});
   if(!result.ok){if(result.status===409)setConflict(true);throw new Error(result.data.error||'Data internal belum berhasil disimpan.');}
   guard.markSaved();navigate(withEmployeeContext('/admin/internal-assets'));
  }catch(e){if(e.name!=='AbortError')setError(e.message);}finally{requestRef.current=null;setSaving(false);}
 };
 const back=()=>guard.requestLeave(()=>navigate(withEmployeeContext('/admin/internal-assets')));
 return <div className="kms-internal-page mx-auto w-full max-w-5xl p-4 md:p-6 xl:p-8">
  <AdminPageHeader eyebrow="Aset Data Internal" title={id?'Edit Aset Internal':'Input Aset Internal'} description="Satu judul untuk seluruh berkas pendukung. Data tersedia hanya untuk pengguna internal yang memiliki akses." breadcrumbs={[{label:'Aset Data Internal',href:withEmployeeContext('/admin/internal-assets')},{label:id?'Edit aset':'Input aset'}]} actions={<Button hierarchy="secondary" prefixIcon={<ArrowLeft size={17}/>} disabled={saving} onClick={back}>Kembali ke list</Button>}/>
  <FormDraftStatus guard={guard}/>
  {error&&<Alert variant="critical" title="Periksa data unggahan" message={error}/>}
  {conflict&&<Button hierarchy="secondary" onClick={()=>window.location.reload()}>Muat ulang data terbaru</Button>}
  {loading?<div className="kms-internal-form-skeleton" role="status" aria-label="Memuat formulir"><div/><div/><div/><div/></div>:<ValidatedForm busy={saving} onSubmit={submit}>
   <fieldset disabled={saving||!ready} className="kms-internal-fieldset">
    <CardPlain className="kms-admin-surface kms-internal-form-card">
     <h2 className="kms-internal-section-title"><Info size={19}/>1. Informasi data</h2>
     <div className="kms-internal-form-grid">
      <div className="kms-internal-full"><TextField label="Judul *" aria-label="Judul" required minLength={3} maxLength={300} value={form.title} onChange={value=>change('title',inputValue(value))} placeholder="Contoh: Laporan kajian angkutan perkotaan"/><small className="kms-internal-helper">Gunakan nama yang deskriptif. Tahun tidak perlu ditulis di judul.</small></div>
      <TextField label="Tahun *" aria-label="Tahun" required type="number" min={1000} max={9999} step={1} inputMode="numeric" value={form.year} onChange={value=>change('year',inputValue(value))}/>
      <SelectDropdown label="Jenis data *" placeholder="Pilih jenis data" options={(options?.types||[]).map(t=>({value:String(t.id),label:t.name}))} selected={form.data_type_id} onSelect={v=>change('data_type_id',String(v||''))} width="100%"/>
      <SelectDropdown label="Kategori *" placeholder="Pilih kategori" options={(options?.categories||[]).map(c=>({value:String(c.id),label:c.name}))} selected={form.category_id} onSelect={v=>change('category_id',String(v||''))} width="100%"/>
      <SelectDropdown label="Unit kerja pemilik *" placeholder="Pilih unit kerja" options={unitOptions(scope.units)} selected={form.work_unit_id} onSelect={v=>change('work_unit_id',String(v||''))} width="100%"/>
     </div>
    </CardPlain>
    <CardPlain className="kms-admin-surface kms-internal-form-card kms-internal-files-section">
     <div className="kms-internal-section-heading"><h2 className="kms-internal-section-title"><Paperclip size={19}/>2. Berkas</h2><span>{count} berkas · {fileSize(total)} dari {fileSize(maxTotalBytes)}</span></div>
     <div className={`kms-internal-dropzone ${dragging?'is-dragging':''}`} onDragOver={e=>{e.preventDefault();if(ready&&!saving)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);chooseFiles(e.dataTransfer.files);}}>
      <FileUp size={32}/><strong>Tarik beberapa berkas ke sini</strong><p>PDF, Word, Excel, PowerPoint, video, audio, gambar, teks, atau arsip.</p><p>Maksimal {fileSize(options?.maxBytes||0)} per berkas · {maxFiles} berkas per aset</p>
      <Button type="button" hierarchy="secondary" prefixIcon={<Plus size={17}/>} onClick={()=>fileRef.current?.click()}>Pilih berkas</Button>
      <input ref={fileRef} className="sr-only" aria-label="Pilih berkas internal" type="file" multiple accept={options?.extensions.map(e=>'.'+e).join(',')} onChange={e=>chooseFiles(e.target.files)}/>
     </div>
     <ul className="kms-internal-upload-list">
      {existing.map(f=><li key={f.public_id} className={removed.includes(f.public_id)?'is-removed':''}><InternalFileBadge kind={f.file_kind}/><div><label className="kms-internal-rename"><span className="sr-only">Nama {f.original_name}</span><input required maxLength={230} disabled={removed.includes(f.public_id)} value={existingNames[f.public_id]||''} onChange={e=>setExistingNames(v=>({...v,[f.public_id]:e.target.value}))}/><span>{splitName(f.original_name).ext}</span></label><span>{fileSize(f.file_size)} · {removed.includes(f.public_id)?'Akan dilepas':'Tersimpan'}</span></div><Button type="button" hierarchy="tertiary" aria-label={`${removed.includes(f.public_id)?'Batalkan hapus':'Hapus'} ${f.original_name}`} onClick={()=>setRemoved(current=>current.includes(f.public_id)?current.filter(v=>v!==f.public_id):[...current,f.public_id])}>{removed.includes(f.public_id)?<Undo2 size={17}/>:<Trash2 size={17}/>}</Button></li>)}
      {files.map((f,index)=><li key={`${f.name}-${f.lastModified}-${index}`}><InternalFileBadge kind={fileKindFromName(f.name)}/><div><label className="kms-internal-rename"><span className="sr-only">Nama berkas {index+1}</span><input required aria-label={`Nama berkas ${index+1}`} maxLength={230} value={newNames[index]||''} onChange={e=>setNewNames(v=>v.map((n,i)=>i===index?e.target.value:n))}/><span>{splitName(f.name).ext}</span></label><span>{fileSize(f.size)} · {saving?'Mengunggah':'Siap'}</span></div><Button type="button" hierarchy="tertiary" aria-label={`Keluarkan ${f.name}`} onClick={()=>{setFiles(current=>current.filter((_,i)=>i!==index));setNewNames(current=>current.filter((_,i)=>i!==index));}}><Trash2 size={17}/></Button></li>)}
     </ul>
     {duplicate&&<Alert variant="caution" className="kms-internal-duplicate-warning" title="Nama berkas perlu dibedakan" message={<>
      <p>{id?'Perubahan belum bisa disimpan':'Unggahan belum bisa dilanjutkan'} karena nama berikut digunakan lebih dari sekali:</p>
      <ul>{duplicateNames.map(group=><li key={group.name}><strong>{group.name}</strong> <span>— {group.count} berkas</span></li>)}</ul>
      <p>Ubah nama berkas yang sama pada kolom di atas, atau keluarkan berkas yang tidak diperlukan. Setelah nama berbeda, pilih <strong>{id?'Simpan perubahan':'Unggah semua'}</strong>.</p>
      <p className="kms-internal-duplicate-note">Perubahan belum disimpan. Tidak ada berkas yang ditimpa.</p>
     </>}/>}
    </CardPlain>
   </fieldset>
   <Modal open={saving} title="Menyimpan aset internal" onClose={()=>{}} size="sm"><div className="kms-internal-upload-modal" role="status" aria-live="polite"><div className="kms-internal-upload-orbit"><FileUp size={32}/></div><h2>{progress<100?`Mengunggah ${progress}%`:"Memeriksa berkas dan menyimpan"}</h2><progress value={progress} max="100"/><p>{count} berkas · {fileSize(total)}</p><ol><li className={progress<100?"is-current":""}>Mengunggah</li><li className={progress>=100?"is-current":""}>Memeriksa berkas</li><li>Menyimpan</li></ol><p>Jangan tutup halaman sampai penyimpanan selesai.</p></div></Modal>
   <div className="kms-internal-submit-bar"><p>Berkas asli disimpan tanpa kompresi.</p><div className="kms-internal-form-actions"><Button type="button" hierarchy="secondary" disabled={saving} onClick={back}>Batal</Button><Button type="submit" hierarchy="primary" disabled={saving||!ready||!count||duplicate||badName} prefixIcon={<Save size={17}/>}>{saving?'Menyimpan…':id?'Simpan perubahan':'Unggah semua'}</Button></div></div>
  </ValidatedForm>}
 </div>;
}
