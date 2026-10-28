import {safeArchive,sanitize,start,send} from './frameShared';
import {groupStyles,customPaths} from './pptxGeometry';
import {loadPptxFonts} from './pptxFonts';
const container=document.getElementById('document');
let slides=[],slide=0;
window.KMSSanitize=sanitize;
window.KMSPptxGroups=groupStyles;
window.KMSPptxPaths=customPaths;
window.FileReaderJS={setSync(){}};
function layout(){
  slides.forEach((el,i)=>{el.style.display=i===slide?'block':'none';});
  const current=slides[slide];if(!current)return;
  const scale=Math.min(1,(innerWidth-24)/(parseFloat(current.style.width)||960));
  container.style.zoom=String(Math.max(.1,scale));
}
start(async bytes=>{
  const zip=await safeArchive(bytes),entries=new Map();
  await loadPptxFonts(zip);
  for(const [name,file]of Object.entries(zip.files))if(!file.dir){const data=await file.async('uint8array');entries.set(name,{asText:()=>new TextDecoder().decode(data),asArrayBuffer:()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)});}
  // Adapt modern, bounded JSZip output to the synchronous API PPTXjs expects.
  // Never load its obsolete JSZip v2 or its remote file loader.
  window.JSZip=class{load(){return this;}file(name){return entries.get(name)||null;}};
  await new Promise((resolve,reject)=>window.jQuery(container).pptxToHtml({fileBuffer:bytes,onRendered:resolve,onError:reject,mediaProcess:false,slideMode:false,keyBoardShortCut:false,jsZipV2:false}));
  slides=[...container.querySelectorAll('.slide')];
  if(!slides.length||slides.length>200)throw new Error('Slide tidak tersedia atau terlalu banyak.');
  for(const el of container.querySelectorAll('a')){el.removeAttribute('href');el.removeAttribute('target');}
  layout();send('slides',{count:slides.length});
},data=>{slide=Math.min(slides.length-1,Math.max(0,Number(data.slide)||0));layout();});
addEventListener('resize',layout);
