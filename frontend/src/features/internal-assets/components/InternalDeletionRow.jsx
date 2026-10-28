import {Button} from '@idds/react';
import {RotateCcw,Trash2} from 'lucide-react';

export default function InternalDeletionRow({asset,onRestore,onPurge}){
 const status=asset.restored_at?'Dipulihkan':asset.cleanup_status==='pending'?'Pembersihan berkas tertunda':asset.purged_at?'Dihapus permanen':Date.now()-new Date(asset.deleted_at).getTime()>=30*86400000?'Menunggu penghapusan permanen':'Dalam masa pemulihan';
 return <article className="kms-internal-history-row">
  <div><h2>{asset.title}</h2><p>{asset.owner_name||'Data lama / contoh'} · {asset.work_unit_name}</p>
   <p>Dihapus oleh {asset.actor_name||'Tidak diketahui'} · {new Date(asset.deleted_at).toLocaleString('id-ID')}</p>
   <strong>{status}</strong>
   {asset.purge_actor_name&&<p>Hapus permanen oleh {asset.purge_actor_name} · {new Date(asset.purged_at).toLocaleString('id-ID')}</p>}
   {asset.cleanup_status==='pending'&&<p>Berkas tidak dapat diakses atau dipulihkan. Pembersihan akan dicoba kembali otomatis.</p>}
   {asset.cleanup_status==='legacy'&&<p>Catatan lama; status pembersihan fisik belum tercatat.</p>}
  </div>
  <div className="kms-internal-history-actions">
   {asset.can_restore&&<Button hierarchy="secondary" prefixIcon={<RotateCcw size={17}/>} onClick={()=>onRestore(asset)}>Pulihkan</Button>}
   {asset.can_purge&&<Button hierarchy="secondary" className="kms-internal-danger" prefixIcon={<Trash2 size={17}/>} onClick={()=>onPurge(asset)}>Hapus permanen</Button>}
  </div>
 </article>;
}
