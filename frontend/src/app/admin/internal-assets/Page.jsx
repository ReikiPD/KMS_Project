import {useEffect,useMemo,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {Alert,Button,CardPlain,SelectDropdown,Modal,Pagination} from '@idds/react';
import {Filter,Plus,RotateCcw,Minimize2,Maximize2} from 'lucide-react';
import AdminPageHeader from '../../../components/AdminPageHeader';
import MultipleSearchSelect from '../../../components/MultipleSearchSelect';
import EmptyState from '../../../components/EmptyState';
import {InternalAssetRow,InternalDeletionRow,InternalAssetPreview,useInternalAssets,INTERNAL_KINDS,unitOptions} from '../../../features/internal-assets';
import {apiFetch} from '../../../lib/api';
import {searchSelectionsToQuery} from '../../../lib/search';
import {hasPermission} from '../../../lib/permissions';
import {useAuth} from '../../../contexts/AuthContext';
import useAdminView from '../../../hooks/useAdminView';
import '../../../features/internal-assets/styles/internal-assets.css';

const initialFilters={types:[],kinds:[],years:[],categories:[],units:[],from:'',to:''};
const densityKey='kms.internal-assets.density';
const initialDensity=()=>{try{return localStorage.getItem(densityKey)==='compact'?'compact':'comfortable';}catch{return 'comfortable';}};
export default function InternalAssetsPage({recovery=false}){
  const {branch}=useParams();const navigate=useNavigate();const {user}=useAuth();
  const {accessUser,withEmployeeContext}=useAdminView();const scope=useInternalAssets();
  const [options,setOptions]=useState({types:[],categories:[],years:[]});const [data,setData]=useState([]);const [total,setTotal]=useState(0);
  const [unitCounts,setUnitCounts]=useState(null);
  const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
  const [search,setSearch]=useState([]);const [query,setQuery]=useState('');const [filters,setFilters]=useState(initialFilters);
  const [draftFilters,setDraftFilters]=useState(initialFilters);const [showFilters,setShowFilters]=useState(false);
  const [sort,setSort]=useState('newest');const [confirm,setConfirm]=useState(null);const [saving,setSaving]=useState(false);const [actionError,setActionError]=useState('');
  const [density,setDensity]=useState(initialDensity),[confirmation,setConfirmation]=useState(''),[actionNotice,setActionNotice]=useState('');
  useEffect(()=>{try{localStorage.setItem(densityKey,density);}catch{/* Storage restrictions must not block the toggle. */}},[density]);
  const ask=(value)=>{setActionError('');setConfirmation('');setConfirm(value);};
  const [page,setPage]=useState(1);const [limit,setLimit]=useState(10);const [preview,setPreview]=useState(null);
  const unit=scope.units.find(item=>String(item.id)===branch);
  const selectedUnits=branch?scope.units.filter(item=>String(item.branch_id)===branch):scope.units;
  const unitTabs=[{id:'',label:'Semua'},...scope.units.filter(item=>Number(item.echelon_level)===2).map(item=>({id:String(item.id),label:item.alias||item.name}))];
  useEffect(()=>setPage(1),[branch]);
  const selectUnit=(event,nextBranch)=>{
    if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||nextBranch===(branch||''))return;
    setPage(1);setFilters(current=>({...current,units:[]}));setDraftFilters(current=>({...current,units:[]}));
  };
  useEffect(()=>{
    if(recovery)return;
    const abort=new AbortController();
    apiFetch('/api/internal-assets/options',{signal:abort.signal}).then(async response=>{if(!response.ok)throw new Error('Filter belum dapat dimuat.');setOptions(await response.json());}).catch(error=>{if(!abort.signal.aborted)setError(error.message);});
    return ()=>abort.abort();
  },[revision,recovery]);
  useEffect(()=>{
    const abort=new AbortController();setLoading(true);setError('');
    const params=new URLSearchParams({page:String(page),limit:String(limit),q:query,sort});if(branch)params.set('branch',branch);
    Object.entries(filters).forEach(([key,value])=>{if(value.length)params.set(key,Array.isArray(value)?value.join(','):value);});
    apiFetch(`/api/internal-assets${recovery?'/recovery':''}?${params}`,{signal:abort.signal,cache:'no-store'}).then(async response=>{
      const body=await response.json();if(!response.ok)throw new Error(body.error||'Data belum dapat dimuat.');
      if(!abort.signal.aborted){setData(body.data||[]);setTotal(body.pagination?.totalItems||0);setUnitCounts(body.unitCounts||null);if(page>1&&!body.data?.length)setPage(Math.max(1,Math.ceil((body.pagination?.totalItems||0)/limit)));}
    }).catch(error=>{if(!abort.signal.aborted){setData([]);setUnitCounts(null);setError(error.message);}}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return ()=>abort.abort();
  },[branch,page,limit,query,filters,revision,sort,recovery]);
  const searchOptions=useMemo(()=>data.slice(0,50).map(item=>({label:item.title,value:item.title,group:'Judul'})),[data]);
  const filterCount=Object.values(filters).reduce((count,value)=>count+(Array.isArray(value)?value.length:Number(Boolean(value))),0);
  const filterSelect=(label,key,items)=><SelectDropdown label={label} multiple options={items} selected={draftFilters[key]} onSelect={values=>setDraftFilters(current=>({...current,[key]:values}))} width="100%"/>;
  const act=async()=>{
    if(saving||!confirm||(confirm.purge&&confirmation!=='HAPUS PERMANEN'))return;setSaving(true);setActionError('');
    const endpoint=confirm.purge?`recovery/${confirm.asset.public_id}`:`${confirm.asset.public_id}${confirm.restore?'/restore':''}`;
    try{const r=await apiFetch(`/api/internal-assets/${endpoint}`,{method:confirm.restore?'POST':'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:confirm.asset.revision,...(confirm.purge?{confirmation}:{})})}),body=await r.json();
      if(!r.ok)throw new Error(body.error||'Perubahan belum tersimpan.');setConfirm(null);setActionNotice(body.message||'Perubahan berhasil disimpan.');setRevision(v=>v+1);
    }catch(e){setActionError(e.message);}finally{setSaving(false);}
  };
  return <div className="kms-internal-page mx-auto w-full max-w-7xl p-4 md:p-6 xl:p-8">
    <AdminPageHeader eyebrow="Ruang data BKT" title={recovery?'Riwayat Penghapusan Aset Internal':unit?.name||'Aset Data Internal'} description={recovery?'Pantau penghapusan, pulihkan aset, atau hapus permanen sesuai kepemilikan dan izin Anda.':'Dokumen dan data kerja internal Badan Kebijakan Transportasi. Klik judul untuk melihat daftar berkas.'} breadcrumbs={[{label:'Aset Data Internal',href:withEmployeeContext('/admin/internal-assets')},{label:recovery?'Riwayat Penghapusan':unit?.alias||'List aset'}]} actions={!recovery&&hasPermission(accessUser||user,'internal_assets','post')?<Button hierarchy="primary" prefixIcon={<Plus size={18}/>} onClick={()=>navigate(withEmployeeContext(`/admin/internal-assets/create${branch?`?unit=${branch}`:''}`))}>Input aset</Button>:null}/>
    {!recovery&&<nav className="kms-internal-unit-tabs" aria-label="Unit kerja data internal" aria-busy={loading}>
      {unitTabs.map(tab=>{
        const count=unitCounts?(tab.id?Number(unitCounts.branches?.[tab.id]||0):Number(unitCounts.total||0)):null;
        return <Link key={tab.id} to={withEmployeeContext(`/admin/internal-assets${tab.id?`/unit/${tab.id}`:''}`)} onClick={event=>selectUnit(event,tab.id)} aria-current={(branch||'')===tab.id?'page':undefined} aria-label={`${tab.label}, ${count===null?'jumlah sedang dimuat':`${count} aset`}`}>
          <span>{tab.label}</span><span className="kms-internal-unit-count" aria-hidden="true">{count===null?'—':count.toLocaleString('id-ID')}</span>
        </Link>;
      })}
    </nav>}
    {error&&<Alert variant="critical" title="Data belum dapat ditampilkan" message={error}/>}
    {actionNotice&&<p className="kms-internal-notice" role="status">{actionNotice}</p>}
    {recovery&&<p className="kms-internal-helper">Catatan penghapusan tetap tersimpan. Pemulihan hanya tersedia selama 30 hari, sesuai kepemilikan dan izin role.</p>}
    <CardPlain className="kms-admin-surface kms-internal-table-card">
      {!recovery&&<div className="kms-internal-toolbar"><div className="kms-internal-search-field"><MultipleSearchSelect label="Cari data internal" selected={search} onSelect={setSearch} options={searchOptions} placeholder="Judul, jenis data, unit kerja, atau tahun"/></div><Button hierarchy="primary" onClick={()=>{setPage(1);setQuery(searchSelectionsToQuery(search));}}>Cari</Button><Button hierarchy="secondary" prefixIcon={<Filter size={17}/>} aria-expanded={showFilters} onClick={()=>setShowFilters(value=>!value)}>Filter{filterCount?` (${filterCount})`:''}</Button><div className="kms-internal-sort"><SelectDropdown label="Urutkan" options={[{value:"newest",label:"Paling baru"},{value:"oldest",label:"Paling lama"},{value:"az",label:"A–Z"},{value:"za",label:"Z–A"}]} selected={sort} onSelect={v=>{setSort(v);setPage(1);}} width="100%"/></div><Button hierarchy="tertiary" aria-label="Muat ulang data internal" onClick={()=>setRevision(value=>value+1)}><RotateCcw size={17}/></Button><Button hierarchy="secondary" aria-label="Mode ringkas" aria-pressed={density==='compact'} prefixIcon={density==='compact'?<Maximize2 size={17}/>:<Minimize2 size={17}/>} onClick={()=>setDensity(value=>value==='compact'?'comfortable':'compact')}>{density==='compact'?'Nyaman':'Ringkas'}</Button></div>}
      {recovery&&<div className="kms-internal-history-toolbar"><Button hierarchy="secondary" prefixIcon={<RotateCcw size={17}/>} onClick={()=>{setActionNotice('');setRevision(value=>value+1);}}>Muat ulang riwayat</Button></div>}
      {!recovery&&showFilters&&<section className="kms-internal-filters" aria-label="Filter data internal"><div className="kms-internal-filter-grid">
        {filterSelect('Jenis data','types',options.types.map(item=>({label:item.name,value:String(item.id)})))}
        {filterSelect('Tipe dokumen','kinds',INTERNAL_KINDS)}{filterSelect('Tahun','years',options.years.map(year=>({label:String(year),value:String(year)})))}
        {filterSelect('Kategori','categories',options.categories.map(item=>({label:item.name,value:String(item.id)})))}{filterSelect('Unit kerja','units',unitOptions(selectedUnits))}
        <div className="kms-internal-date-range"><label>Dari tanggal<input type="date" value={draftFilters.from} onChange={event=>setDraftFilters(value=>({...value,from:event.target.value}))}/></label><label>Sampai tanggal<input type="date" min={draftFilters.from} value={draftFilters.to} onChange={event=>setDraftFilters(value=>({...value,to:event.target.value}))}/></label></div>
      </div><div className="kms-internal-filter-actions"><Button hierarchy="tertiary" onClick={()=>{setDraftFilters(initialFilters);setFilters(initialFilters);setPage(1);}}>Reset filter</Button><Button hierarchy="primary" onClick={()=>{setFilters(draftFilters);setPage(1);}}>Terapkan filter</Button></div></section>}
      {!loading&&!data.length?<EmptyState title="Belum ada data yang sesuai" description={recovery?'Belum ada catatan penghapusan aset internal.':'Ubah pencarian/filter atau tambahkan aset internal baru.'}/>:<div className={`kms-internal-asset-list ${!recovery&&density==='compact'?'is-compact':''}`} aria-busy={loading}>
        {loading?<p role="status">Memuat aset internal…</p>:data.map(asset=>recovery?
          <InternalDeletionRow key={asset.public_id} asset={asset} onRestore={a=>ask({asset:{...a,public_id:a.asset_public_id},restore:true})} onPurge={a=>ask({asset:a,purge:true})}/>:
          <InternalAssetRow key={asset.public_id} asset={asset} onPreview={setPreview} onEdit={a=>navigate(withEmployeeContext(`/admin/internal-assets/${a.public_id}/edit`))} onDelete={a=>ask({asset:a})} onRestore={a=>ask({asset:a,restore:true})}/>)}
      </div>}
      {total>0&&<div className="kms-internal-pagination"><Pagination currentPage={page} totalPages={Math.max(1,Math.ceil(total/limit))} pageSize={limit} pageSizeOptions={[10,20,50]} onPageChange={setPage} onPageSizeChange={value=>{setLimit(value);setPage(1);}}/></div>}
    </CardPlain>
    <Modal open={Boolean(confirm)} title={confirm?.purge?'Hapus permanen aset internal?':confirm?.restore?'Pulihkan aset?':'Hapus aset internal?'} onClose={()=>{if(!saving)setConfirm(null);}} size="sm">
      <div className="kms-internal-confirm">
        <p><strong>{confirm?.asset.title}</strong></p>
        <p>{confirm?.purge?'Seluruh lampiran akan dihapus dari server dan tidak dapat dipulihkan. Catatan riwayat tetap disimpan. Tindakan ini tidak menghapus salinan backup atau file yang sudah diunduh.':confirm?.restore?'Aset dan seluruh lampirannya akan tersedia kembali.':'Aset dan seluruh lampirannya dipindahkan ke Riwayat Penghapusan. Anda memiliki 30 hari untuk memulihkannya.'}</p>
        {confirm?.purge&&<label htmlFor="internal-purge-confirmation">Ketik HAPUS PERMANEN untuk melanjutkan<input id="internal-purge-confirmation" autoComplete="off" value={confirmation} disabled={saving} onChange={e=>setConfirmation(e.target.value)}/></label>}
        {actionError&&<Alert variant="critical" title="Belum tersimpan" message={actionError}/>}
        <div className="kms-internal-form-actions"><Button hierarchy="secondary" disabled={saving} onClick={()=>setConfirm(null)}>Batal</Button><Button hierarchy="primary" className={confirm?.purge?'kms-internal-danger-confirm':undefined} disabled={saving||(confirm?.purge&&confirmation!=='HAPUS PERMANEN')} onClick={act}>{saving?'Memproses…':confirm?.purge?'Hapus permanen':confirm?.restore?'Pulihkan':'Hapus aset'}</Button></div>
      </div>
    </Modal>
    {preview&&<InternalAssetPreview asset={preview} onClose={()=>setPreview(null)}/>}
  </div>;
}
