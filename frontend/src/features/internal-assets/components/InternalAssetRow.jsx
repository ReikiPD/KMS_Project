import {useEffect,useState} from 'react';
import {Alert,Button,Tooltip,Spinner} from '@idds/react';
import {ChevronDown,Download,Eye,File,Files,Pencil,RotateCcw,Trash2} from 'lucide-react';
import {apiFetch} from '../../../lib/api';
import {dateLabel,fileSize,downloadInternalFile} from '../lib/internalAssets';
import InternalFileBadge from './InternalFileBadge';

export default function InternalAssetRow({asset,onPreview,onEdit,onDelete,onRestore}){
 const [open,setOpen]=useState(false),[data,setData]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[busy,setBusy]=useState('');
 useEffect(()=>{
  if(!open||asset.deleted_at)return;
  const abort=new AbortController();setLoading(true);setError('');
  apiFetch(`/api/internal-assets/${asset.public_id}`,{signal:abort.signal,cache:'no-store'}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'Lampiran belum dapat dimuat.');if(!abort.signal.aborted)setData(body);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return ()=>abort.abort();
 },[open,asset.public_id,asset.revision,asset.deleted_at,retry]);
 const download=async(file)=>{
  if(busy)return;setBusy(file?.public_id||'zip');setError('');
  try{await downloadInternalFile(file?`/api/internal-assets/${asset.public_id}/files/${file.public_id}/file?download=1`:`/api/internal-assets/${asset.public_id}/download`,file?.display_name||file?.original_name||asset.title+'.zip');}
  catch(e){setError(e.message);}finally{setBusy('');}
 };
 return <article className={`kms-internal-asset-row ${open?'is-open':''}`}>
  <div className="kms-internal-asset-summary">
   <button type="button" className="kms-internal-asset-toggle" disabled={Boolean(asset.deleted_at)} aria-label={asset.title} aria-expanded={open} aria-controls={`internal-files-${asset.public_id}`} onClick={()=>setOpen(v=>!v)}>
    {!asset.deleted_at&&<ChevronDown size={21} className={open?'rotate-180':''}/>}
    <span className="kms-internal-count-icon" title={`${asset.file_count} berkas`}>{Number(asset.file_count)>1?<Files size={26}/>:<File size={26}/>}</span><div><h2 title={asset.title}>{asset.title}</h2><p>{asset.year} · {asset.data_type_name} · {asset.category_name} · <span title={asset.work_unit_name}>{asset.work_unit_alias||asset.work_unit_name}</span></p><p className="kms-internal-asset-caption"><Files size={15}/>{asset.file_count} berkas · {fileSize(asset.total_size)} · {asset.uploader_name||'Data lama / contoh'} · {dateLabel(asset.uploaded_at)}</p></div>
   </button>
   <div className="kms-internal-asset-actions"><span className={`kms-internal-status ${asset.deleted_at?'is-deleted':''}`}>{asset.deleted_at?'Dihapus':'Tersedia'}</span><div>
    {!asset.deleted_at&&<Tooltip title="Unduh semua berkas (ZIP)" variant="basic"><Button hierarchy="secondary" size="sm" disabled={Boolean(busy)} aria-label={`Unduh semua ${asset.title}`} onClick={()=>download(null)}><Download size={17}/></Button></Tooltip>}
    {asset.can_edit&&<Button hierarchy="tertiary" size="sm" aria-label={`Edit ${asset.title}`} onClick={()=>onEdit(asset)}><Pencil size={17}/></Button>}
    {asset.can_delete&&<Button hierarchy="tertiary" size="sm" aria-label={`Hapus ${asset.title}`} onClick={()=>onDelete(asset)}><Trash2 size={17}/></Button>}
    {asset.can_restore&&<Button hierarchy="secondary" size="sm" prefixIcon={<RotateCcw size={17}/>} onClick={()=>onRestore(asset)}>Pulihkan</Button>}
   </div></div>
  </div>
  {asset.deleted_at&&<p className="kms-internal-helper">Dapat dipulihkan sampai {dateLabel(new Date(new Date(asset.deleted_at).getTime()+30*86400000).toISOString())}.</p>}
  {error&&<Alert variant="critical" title="Berkas belum tersedia" message={error}/>}
  {!asset.deleted_at&&<div id={`internal-files-${asset.public_id}`} className={`kms-internal-expanded ${open?'is-expanded':''}`} inert={!open} aria-hidden={!open}><div className="kms-internal-expanded-inner">
   {loading?<Spinner title="Memuat lampiran"/>:error&&!data?<Button hierarchy="secondary" onClick={()=>setRetry(v=>v+1)}>Coba lagi</Button>:<ul>{(data?.files||[]).map(file=><li key={file.public_id}>
    <InternalFileBadge kind={file.file_kind}/><button type="button" className="kms-internal-file-name" title={(file.display_name||file.original_name)} onClick={()=>onPreview({...asset,...file,asset_public_id:asset.public_id})}>{file.display_name||file.original_name}</button><span>{fileSize(file.file_size)}</span>
    <div><Button hierarchy="tertiary" size="sm" aria-label={`Preview ${file.display_name||file.original_name}`} onClick={()=>onPreview({...asset,...file,asset_public_id:asset.public_id})}><Eye size={17}/></Button><Button hierarchy="tertiary" size="sm" aria-label={`Unduh ${file.display_name||file.original_name}`} disabled={Boolean(busy)} onClick={()=>download(file)}><Download size={17}/></Button></div>
   </li>)}</ul>}
  </div></div>}
 </article>;
}
