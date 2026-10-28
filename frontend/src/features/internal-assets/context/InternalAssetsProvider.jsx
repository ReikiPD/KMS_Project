import {useEffect,useState} from 'react';
import {InternalAssetsContext} from './InternalAssetsContext';
import {useAuth} from '../../../contexts/AuthContext';
import useAdminView from '../../../hooks/useAdminView';
import {apiFetch} from '../../../lib/api';
import {hasPermission} from '../../../lib/permissions';

export default function InternalAssetsProvider({children}) {
  const {user}=useAuth();const {accessUser,staffLoading}=useAdminView();
  const subject=accessUser||user;
  const eligible=hasPermission(subject,'internal_assets','view')||hasPermission(subject,'internal_data_types','view')||hasPermission(subject,'internal_data_categories','view');
  const key=JSON.stringify([
    user?.id,user?.work_unit_id,user?.organization_scope,user?.environmentAdmin,
    subject?.id,subject?.work_unit_id,subject?.organization_scope,subject?.environmentAdmin,subject?.staff_scope_boundaries,
    subject?.permissions?.internal_assets,subject?.permissions?.internal_data_types,subject?.permissions?.internal_data_categories,eligible,staffLoading,
  ]);
  const [result,setResult]=useState(null);
  useEffect(()=>{
    if(!eligible||staffLoading)return undefined;
    const controller=new AbortController();
    apiFetch('/api/internal-assets/context',{signal:controller.signal,cache:'no-store'}).then(async response=>{
      if(!response.ok)throw new Error('Akses data internal belum dapat diperiksa.');
      const data=await response.json();setResult({key,data});
    }).catch(error=>{if(error.name!=='AbortError')setResult({key,data:{allowed:false,error:error.message}});});
    return ()=>controller.abort();
  },[key,eligible,staffLoading]);
  const value=!eligible?{allowed:false,loading:false,units:[]}:result?.key===key?{units:[],loading:false,...result.data}:{allowed:false,loading:true,units:[]};
  return <InternalAssetsContext.Provider value={value}>{children}</InternalAssetsContext.Provider>;
}
