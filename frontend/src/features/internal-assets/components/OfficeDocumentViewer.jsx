import {useEffect,useRef,useState} from 'react';
import {Button,Spinner} from '@idds/react';
import {ChevronLeft,ChevronRight,Minus,Plus,RotateCw} from 'lucide-react';
import {apiFetch} from '../../../lib/api';
import {OFFICE_MAX_BYTES} from '../../../preview/officeSafety';

export default function OfficeDocumentViewer({fileBase,extension,fileSize,title}){
  const [attempt,setAttempt]=useState(0),[status,setStatus]=useState('loading'),[error,setError]=useState('');
  const [names,setNames]=useState([]),[sheet,setSheet]=useState(0),[page,setPage]=useState(0),[columnPage,setColumnPage]=useState(0),[table,setTable]=useState(null);
  const [slide,setSlide]=useState(0),[count,setCount]=useState(0),[zoom,setZoom]=useState(1);
  const iframe=useRef(null),worker=useRef(null),token=useRef(''),request=useRef(0),pageTimer=useRef(null);
  const spreadsheet=['xlsx','xls','csv'].includes(extension),frameKind=extension==='docx'?'docx':'pptx';
  const [frameSrc,setFrameSrc]=useState('');
  const [loadingMessage,setLoadingMessage]=useState('Mengambil file…');
  useEffect(()=>{
    const controller=new AbortController();let disposed=false,failed=false,timer,bytes,frameReady=false,sent=false;
    const nonce=crypto.randomUUID();token.current=nonce;
    setStatus('loading');setError('');setNames([]);setTable(null);setSheet(0);setPage(0);setColumnPage(0);setSlide(0);setCount(0);setZoom(1);setFrameSrc('');
    const fail=message=>{if(disposed||failed)return;failed=true;controller.abort();clearTimeout(timer);clearTimeout(pageTimer.current);setError(message);setStatus('error');worker.current?.terminate();worker.current=null;setFrameSrc('');};
    const deadline=(message,ms)=>{clearTimeout(timer);timer=setTimeout(()=>fail(message),ms);};
    const processing=()=>{setLoadingMessage('Menyusun tampilan dokumen…');deadline('Preview terlalu lama diproses. Coba lagi atau unduh file asli.',30000);};
    const send=()=>{if(!disposed&&!failed&&!sent&&frameReady&&bytes){sent=true;processing();iframe.current?.contentWindow?.postMessage({type:'render',token:nonce,bytes},'*',[bytes]);bytes=null;}};
    const receive=e=>{
      if(disposed||failed||e.source!==iframe.current?.contentWindow||e.origin!=='null'||e.data?.token!==nonce)return;
      if(e.data.type==='ready'){frameReady=true;send();}
      if(e.data.type==='rendered'){clearTimeout(timer);setStatus('ready');}
      if(e.data.type==='slides')setCount(Math.max(0,Math.min(200,Number(e.data.count)||0)));
      if(e.data.type==='failure')fail(e.data.message);
    };
    window.addEventListener('message',receive);
    setLoadingMessage('Mengambil file…');
    deadline('Pengambilan file terlalu lama. Periksa koneksi, lalu coba lagi.',60000);
    (async()=>{
      if(Number(fileSize)>OFFICE_MAX_BYTES)throw new Error('Batas preview Office adalah 20 MB. Silakan unduh file asli.');
      const response=await apiFetch(`${fileBase}/file`,{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error('File belum dapat dibuka. Periksa sesi dan hak akses Anda.');
      if(Number(response.headers.get('content-length'))>OFFICE_MAX_BYTES)throw new Error('Batas preview Office adalah 20 MB. Silakan unduh file asli.');
      const reader=response.body.getReader(),chunks=[];let size=0;
      for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>OFFICE_MAX_BYTES){await reader.cancel();throw new Error('Batas preview Office adalah 20 MB. Silakan unduh file asli.');}chunks.push(value);}
      if(disposed||failed)return;
      const joined=new Uint8Array(size);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}bytes=joined.buffer;
      if(spreadsheet){
        processing();
        const w=new Worker(new URL('../../../preview/sheet.worker.js',import.meta.url),{type:'module'});worker.current=w;
        w.onerror=()=>fail('Penampil spreadsheet gagal dimuat. Coba lagi atau unduh file asli.');
        w.onmessage=({data})=>{
          if(disposed||failed)return;
          if(data.type==='failure')return fail(data.message);
          if(data.type==='sheets'){clearTimeout(timer);setNames(data.names);setStatus('ready');}
          if(data.type==='page'&&data.request===request.current){clearTimeout(pageTimer.current);setTable(data);setStatus('ready');}
        };
        w.postMessage({type:'load',bytes,extension},[bytes]);bytes=null;
      }else{
        setLoadingMessage('Menyiapkan penampil dokumen…');
        deadline('Penampil Word/PowerPoint belum dapat dimuat. Minta pengelola memeriksa file office-preview dan konfigurasi keamanan Nginx, lalu coba lagi.',15000);
        setFrameSrc(`/office-preview/${frameKind}.html#${nonce}`);
      }
    })().catch(e=>{if(!disposed)fail(e.message);});
    return ()=>{disposed=true;controller.abort();clearTimeout(timer);clearTimeout(pageTimer.current);window.removeEventListener('message',receive);worker.current?.terminate();worker.current=null;};
  },[fileBase,extension,fileSize,attempt,spreadsheet,frameKind]);
  useEffect(()=>{
    if(!names.length||!worker.current)return;
    setTable(null);const current=++request.current;
    worker.current.postMessage({type:'page',sheet,page,columnPage,request:current});
    pageTimer.current=setTimeout(()=>{worker.current?.terminate();worker.current=null;setError('Sheet terlalu kompleks untuk ditampilkan. Unduh file asli.');setStatus('error');},30000);
    return ()=>clearTimeout(pageTimer.current);
  },[names,sheet,page,columnPage]);
  useEffect(()=>{iframe.current?.contentWindow?.postMessage({type:'control',token:token.current,slide,zoom},'*');},[slide,zoom,status]);
  const control=(label,onClick,disabled,icon)=><Button hierarchy="tertiary" size="small" aria-label={label} onClick={onClick} disabled={disabled}>{icon}</Button>;
  if(status==='error')return <div className="kms-internal-preview-empty" role="alert"><p>{error}</p><Button prefixIcon={<RotateCw size={16}/>} onClick={()=>setAttempt(a=>a+1)}>Coba lagi</Button></div>;
  return <div className="kms-office-viewer" aria-busy={status==='loading'}>
    <div className="kms-office-controls">
      {spreadsheet?<>
        <label>Sheet <select aria-label="Pilih sheet" value={sheet} onChange={e=>{setSheet(Number(e.target.value));setPage(0);setColumnPage(0);}}>{names.map((name,i)=><option key={i} value={i}>{name}</option>)}</select></label>
        <div>{control('Baris sebelumnya',()=>setPage(p=>p-1),page===0||!table,<ChevronLeft size={18}/>)}<span>Baris {table?`${table.start+1}–${Math.min(table.total,table.start+100)} dari ${table.total}`:'…'}</span>{control('Baris berikutnya',()=>setPage(p=>p+1),!table||(page+1)*100>=table.total,<ChevronRight size={18}/>)}</div>
        {table?.totalColumns>50&&<div>{control('Kolom sebelumnya',()=>setColumnPage(p=>p-1),columnPage===0,<ChevronLeft size={18}/>)}<span>Kolom {table.columns[0]}–{table.columns.at(-1)}</span>{control('Kolom berikutnya',()=>setColumnPage(p=>p+1),(columnPage+1)*50>=table.totalColumns,<ChevronRight size={18}/>)}</div>}
      </>:extension==='docx'?<div>{control('Perkecil dokumen',()=>setZoom(z=>Math.max(.25,z-.25)),zoom<=.25,<Minus size={18}/>)}<span>{Math.round(zoom*100)}%</span>{control('Perbesar dokumen',()=>setZoom(z=>Math.min(2,z+.25)),zoom>=2,<Plus size={18}/>)}</div>:<div>{control('Slide sebelumnya',()=>setSlide(s=>s-1),slide===0,<ChevronLeft size={18}/>)}<span>Slide {count?slide+1:0} dari {count}</span>{control('Slide berikutnya',()=>setSlide(s=>s+1),!count||slide>=count-1,<ChevronRight size={18}/>)}</div>}
      <span>Baca-saja</span>
    </div>
    {status==='loading'&&<div className="kms-internal-preview-empty" role="status"><Spinner title={loadingMessage}/></div>}
    {spreadsheet?table?<div className="kms-office-sheet" tabIndex={0} aria-label="Isi spreadsheet"><table><thead><tr><th scope="col">Baris</th>{table.columns.map(c=><th scope="col" key={c}>{c}</th>)}</tr></thead><tbody>{table.rows.map(r=><tr key={r.number}><th scope="row">{r.number}</th>{r.cells.map(c=><td key={c.column} rowSpan={c.rowSpan} colSpan={c.colSpan}>{c.text}</td>)}</tr>)}</tbody></table></div>:status!=='loading'&&<p role="status">Membaca sheet…</p>:frameSrc&&<iframe ref={iframe} src={frameSrc} sandbox="allow-scripts" title={`Isi ${title}`} className="kms-office-frame" style={status==='loading'?{height:1,visibility:'hidden'}:undefined}/>}
    <p className="kms-office-note">Preview baca-saja; tata letak dapat berbeda dari aplikasi Office. File asli tidak diubah.{spreadsheet?' Formula menggunakan hasil terakhir yang tersimpan.':''}</p>
  </div>;
}
