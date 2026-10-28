import {renderAsync} from 'docx-preview';
import {safeArchive,start} from './frameShared';
const container=document.getElementById('document');
start(async bytes=>{
  const zip=await safeArchive(bytes);
  await renderAsync(await zip.generateAsync({type:'arraybuffer'}),container,undefined,{renderAltChunks:false,renderComments:false,renderChanges:false,renderHeaders:true,renderFooters:true,renderFootnotes:true,renderEndnotes:true,useBase64URL:true,ignoreLastRenderedPageBreak:false});
  for(const el of container.querySelectorAll('a')){el.removeAttribute('href');el.removeAttribute('target');}
  for(const el of container.querySelectorAll('[contenteditable]'))el.removeAttribute('contenteditable');
},({zoom})=>{if(Number.isFinite(zoom))container.style.zoom=String(Math.min(2,Math.max(.25,zoom)));});
