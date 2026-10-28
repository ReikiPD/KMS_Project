export const INTERNAL_KINDS=[
  {value:'pdf',label:'PDF'}, {value:'spreadsheet',label:'Spreadsheet'},
  {value:'word',label:'Word'}, {value:'presentation',label:'Presentasi'},
  {value:'video',label:'Video'}, {value:'audio',label:'Audio'},
  {value:'image',label:'Gambar'}, {value:'other',label:'File lainnya'},
];
export const fileKindFromName=name=>{
  const extension=(name||'').split('.').pop().toLowerCase();
  return Object.entries({pdf:['pdf'],word:['doc','docx'],spreadsheet:['xls','xlsx','csv'],presentation:['ppt','pptx'],video:['mp4','webm','mov'],audio:['mp3','wav','m4a','ogg','flac'],image:['png','jpg','jpeg','webp']}).find(([,extensions])=>extensions.includes(extension))?.[0]||'other';
};
export const fileSize=value=>Number(value)>=1024**3?`${(Number(value)/1024**3).toLocaleString('id-ID',{maximumFractionDigits:1})} GB`:Number(value)>=1024*1024?`${(Number(value)/1024/1024).toLocaleString('id-ID',{maximumFractionDigits:1})} MB`:`${Math.max(0,Math.ceil(Number(value)/1024))} KB`;
export const dateLabel=value=>new Date(value).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'});
export const unitOptions=units=>units.map(unit=>({value:String(unit.id),label:`${'— '.repeat(Math.max(0,Number(unit.echelon_level)-1))}${unit.name}${unit.alias?` (${unit.alias})`:''}`}));

const nodes=(element,tag)=>Array.from(element.getElementsByTagNameNS('*',tag));
const parseXml=xml=>{
  const document=new DOMParser().parseFromString(xml,'application/xml');
  if(document.getElementsByTagName('parsererror').length)throw new Error('Isi dokumen tidak dapat dibaca.');
  return document;
};
// Text and cell values are rendered by React, never as HTML from a document.
export function officeSections(preview){
  const parts=preview.parts||[];
  if(preview.format==='docx')return parts.filter(part=>part.name==='word/document.xml').map(part=>({name:'Dokumen',paragraphs:nodes(parseXml(part.xml),'p').slice(0,500).map(p=>nodes(p,'t').map(t=>t.textContent).join('')).filter(Boolean)}));
  if(preview.format==='pptx')return parts.map((part,index)=>({name:`Slide ${index+1}`,paragraphs:nodes(parseXml(part.xml),'p').slice(0,150).map(p=>nodes(p,'t').map(t=>t.textContent).join('')).filter(Boolean)}));
  if(preview.format==='xlsx'){
    const shared=parts.find(part=>part.name==='xl/sharedStrings.xml');
    const strings=shared?nodes(parseXml(shared.xml),'si').map(si=>nodes(si,'t').map(t=>t.textContent).join('')):[];
    return parts.filter(part=>part.name.startsWith('xl/worksheets/')).map((part,index)=>({name:`Sheet ${index+1}`,rows:nodes(parseXml(part.xml),'row').slice(0,100).map(row=>{
      const cells=Array(30).fill('');let last=0;
      for(const cell of nodes(row,'c')){
        const letters=(cell.getAttribute('r')||'').match(/^[A-Z]+/)?.[0]||'A';
        const column=[...letters].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1;
        if(column>=30)continue;
        const value=nodes(cell,'v')[0]?.textContent||'';
        cells[column]=cell.getAttribute('t')==='s'?(strings[Number(value)]||''):cell.getAttribute('t')==='inlineStr'?nodes(cell,'t').map(t=>t.textContent).join(''):value;
        last=Math.max(last,column);
      }
      return cells.slice(0,last+1);
    })}));
  }
  return [];
}
import {apiFetch} from '../../../lib/api';

export const downloadInternalFile=async(path,name)=>{
  const response=await apiFetch(path,{cache:'no-store'});
  if(!response.ok)throw new Error('File belum dapat diunduh. Periksa akses atau coba kembali.');
  const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
  link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
