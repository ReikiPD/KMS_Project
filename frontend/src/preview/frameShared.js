import DOMPurify from 'dompurify';
import {loadBoundedArchive} from './officeSafety';
const token=location.hash.slice(1);
export const send=(type,data={})=>parent.postMessage({type,token,...data},'*');
// Keep embedded raster fills in SVG shapes, but never document links or remote URLs.
DOMPurify.addHook('uponSanitizeAttribute',(node,data)=>{
 if(node.namespaceURI==='http://www.w3.org/2000/svg'&&node.localName==='image'&&
  ['href','xlink:href'].includes(data.attrName)&&/^data:image\/(?:png|jpeg|gif|webp|bmp);base64,[a-z0-9+/\s]+=*$/i.test(data.attrValue))data.forceKeepAttr=true;
});
// PPTXjs emits a misspelled <sapn> element for text runs; normalize it before
// sanitizing so the font styling survives without allowing arbitrary custom tags.
export const sanitize=html=>DOMPurify.sanitize(html.replace(/<(\/?)[sS][aA][pP][nN](?=[\s>])/g,'<$1span'),{USE_PROFILES:{html:true,svg:true,svgFilters:true},FORBID_TAGS:['script','iframe','object','embed','form','input','button','audio','video','foreignObject','style','link','base'],FORBID_ATTR:['href','xlink:href','srcset','formaction','contenteditable','autofocus'],ALLOW_DATA_ATTR:false});
// Remove external relationships and active XML before handing OOXML to either renderer.
export async function safeArchive(bytes){
  const zip=await loadBoundedArchive(bytes);let total=0;
  for(const [name,file]of Object.entries(zip.files)){
    if(file.dir)continue;
    if(/vbaProject|activeX|embeddings|altChunk/i.test(name)){zip.remove(name);continue;}
    const data=await file.async('uint8array');total+=data.length;
    if(data.length>32*1024*1024||total>100*1024*1024)throw new Error('Dokumen terlalu kompleks.');
    if(/\.(xml|rels)$/i.test(name)){
      const text=new TextDecoder().decode(data);
      if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Struktur XML tidak aman.');
      const xml=new DOMParser().parseFromString(text,'application/xml');
      if(xml.querySelector('parsererror'))throw new Error('Struktur dokumen tidak valid.');
      for(const node of Array.from(xml.getElementsByTagNameNS('*','Relationship'))){
        if(node.getAttribute('TargetMode')==='External'||/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(node.getAttribute('Target')||''))node.remove();
      }
      zip.file(name,new XMLSerializer().serializeToString(xml));
    }else if(/\.svg$/i.test(name))zip.file(name,DOMPurify.sanitize(new TextDecoder().decode(data),{USE_PROFILES:{svg:true,svgFilters:true},FORBID_TAGS:['script','foreignObject','image','use','a']}));
  }
  return zip;
}
export function start(render,control){
  let started=false;
  window.addEventListener('message',async e=>{
    if(e.source!==parent||e.data?.token!==token)return;
    if(e.data.type==='control'){control(e.data);return;}
    if(e.data.type!=='render'||started||!(e.data.bytes instanceof ArrayBuffer))return;
    started=true;
    try{await render(e.data.bytes);send('rendered');}catch{document.getElementById('document').replaceChildren();send('failure',{message:'Dokumen tidak dapat dipreview. File mungkin rusak, terenkripsi, atau memiliki fitur yang belum didukung.'});}
  });
  document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();},true);
  send('ready');
}
