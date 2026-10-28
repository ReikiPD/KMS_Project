import {Alert,Spinner} from '@idds/react';
import useInternalAssets from '../hooks/useInternalAssets';
export default function InternalAssetsBoundary({children}) {
  const scope=useInternalAssets();
  if(scope.loading)return <div className="p-8"><Spinner title="Memeriksa akses BKT" /></div>;
  if(!scope.allowed)return <div className="p-6"><Alert variant="caution" title="Aset Data Internal" message={scope.error||'Halaman ini hanya tersedia untuk akun Badan Kebijakan Transportasi dan turunannya atau akun bercakupan seluruh kementerian, dengan izin akses yang sesuai.'} /></div>;
  return children;
}
