import {lazy,Suspense,useEffect,useState} from 'react';
import {Alert,Button,Modal,Spinner} from '@idds/react';
import {RotateCw,Download,FileLock2,Building2,CalendarDays} from 'lucide-react';
import {apiFetch} from '../../../lib/api';
import {dateLabel,fileSize} from '../lib/internalAssets';
import useAdminView from '../../../hooks/useAdminView';
import PdfDocumentViewer from '../../../components/PdfDocumentViewer';
import InternalFileBadge from './InternalFileBadge';

const OfficeDocumentViewer=lazy(()=>import('./OfficeDocumentViewer'));

export default function InternalAssetPreview({asset,onClose}){
  const {accessUser}=useAdminView();
  const [state,setState]=useState({loading:true});const [attempt,setAttempt]=useState(0);
  const [downloading,setDownloading]=useState(false);const [downloadError,setDownloadError]=useState('');
  const fileBase=asset?.asset_public_id ? `/api/internal-assets/${asset.asset_public_id}/files/${asset.public_id}` : `/api/internal-assets/${asset?.public_id}`;
  const extension=(asset?.original_name||'').split('.').pop().toLowerCase();
  const office=['docx','xlsx','xls','csv','pptx'].includes(extension);
  useEffect(()=>{
    if(!asset||office)return undefined;
    const controller=new AbortController();let objectUrl;
    setState({loading:true});setDownloadError('');
    const native=['pdf','video','audio','image'].includes(asset.file_kind);
    (async()=>{
      if(['doc','ppt'].includes(extension))throw new Error('Format DOC/PPT lama belum mendukung preview browser. Silakan unduh file asli.');
      const response=await apiFetch(`${fileBase}/${native?'file':'preview'}`,{signal:controller.signal,cache:'no-store'});
      if(!response.ok){const data=await response.json();throw new Error(data.error||'File belum dapat dipreview.');}
      if(asset.file_kind==='pdf'){const bytes=new Uint8Array(await response.arrayBuffer());if(!controller.signal.aborted)setState({loading:false,bytes});}
      else if(native){const blob=await response.blob();if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(blob);setState({loading:false,url:objectUrl});}
      else{const data=await response.json();if(!controller.signal.aborted)setState(data.unsupported?{loading:false,error:data.message}:{loading:false,preview:data});}
    })().catch(error=>{if(!controller.signal.aborted)setState({loading:false,error:error.message});});
    return ()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[asset,accessUser?.id,fileBase,extension,office,attempt]);
  if(!asset)return null;
  const download=async()=>{
    setDownloading(true);setDownloadError('');
    try{
      const response=await apiFetch(`${fileBase}/file?download=1`,{cache:'no-store'});
      if(!response.ok)throw new Error('File belum dapat diunduh. Periksa akses atau coba kembali.');
      const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');
      link.href=url;link.download=asset.display_name||asset.original_name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(error){setDownloadError(error.message);}finally{setDownloading(false);}
  };
  return <Modal open onClose={onClose} title="Preview aset internal" size="xl">
    <div className="kms-internal-preview">
      <header className="kms-internal-preview-heading"><div><InternalFileBadge kind={asset.file_kind}/><h2>{asset.display_name||asset.original_name}</h2><p>{asset.title}</p><p><Building2 size={15}/>{asset.work_unit_name}</p></div><span className="kms-internal-private"><FileLock2 size={15}/>Internal BKT</span></header>
      <dl className="kms-internal-preview-meta"><div><dt>Tahun data</dt><dd>{asset.year}</dd></div><div><dt>Jenis data</dt><dd>{asset.data_type_name}</dd></div><div><dt>Kategori</dt><dd>{asset.category_name}</dd></div><div><dt>Diunggah</dt><dd><CalendarDays size={14}/>{dateLabel(asset.uploaded_at)}</dd></div></dl>
      <div className="kms-internal-preview-body">
        {office?<Suspense fallback={<div className="kms-internal-preview-empty"><Spinner title="Menyiapkan penampil…"/></div>}><OfficeDocumentViewer key={`${fileBase}:${accessUser?.id||''}`} fileBase={fileBase} extension={extension} fileSize={asset.file_size} title={asset.display_name||asset.original_name}/></Suspense>:state.loading?<div className="kms-internal-preview-empty"><Spinner title={state.message||"Menyiapkan preview file"}/></div>:state.error?<div className="kms-internal-preview-empty"><FileLock2 size={40}/><p>{state.error}</p><Button prefixIcon={<RotateCw size={16}/>} onClick={()=>setAttempt(n=>n+1)}>Coba lagi</Button></div>:state.bytes?<PdfDocumentViewer fileData={state.bytes} title={asset.title} compact/>:state.url?(
          asset.file_kind==='video'?<video controls playsInline src={state.url}/>:asset.file_kind==='audio'?<div className="kms-internal-preview-empty"><InternalFileBadge kind="audio"/><audio controls src={state.url}/></div>:<img src={state.url} alt={asset.title}/>
        ):state.preview?.format==='text'?<pre>{state.preview.text}</pre>:<p>Preview tidak tersedia. Silakan unduh file asli.</p>}
      </div>
      {!office&&state.preview?.limited&&<p className="text-xs text-content-secondary">Preview dibatasi agar tetap ringan di perangkat Anda. File asli tidak diubah.</p>}
      {downloadError&&<Alert variant="critical" title="Unduhan belum berhasil" message={downloadError}/>}
      <footer className="kms-internal-preview-footer"><div><strong>{asset.display_name||asset.original_name}</strong><span>{fileSize(asset.file_size)} · {asset.uploader_name||'Akun BKT'}</span></div><Button hierarchy="primary" prefixIcon={<Download size={17}/>} disabled={downloading} onClick={download}>{downloading?'Mengunduh…':'Unduh file'}</Button></footer>
    </div>
  </Modal>;
}
