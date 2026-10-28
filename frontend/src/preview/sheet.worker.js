import * as XLSX from 'xlsx';
import {OFFICE_MAX_BYTES,loadBoundedArchive} from './officeSafety';
let workbook;
self.onmessage=async({data})=>{
  try{
    if(data.type==='load'){
      if(data.bytes.byteLength>OFFICE_MAX_BYTES)throw new Error('Batas preview Office adalah 20 MB.');
      if(data.extension==='xlsx')await loadBoundedArchive(data.bytes);
      if(data.extension==='xls'&&!new Uint8Array(data.bytes).slice(0,8).every((v,i)=>v===[208,207,17,224,161,177,26,225][i]))throw new Error('Format XLS tidak valid.');
      workbook=XLSX.read(data.bytes,{type:'array',cellFormula:false,cellHTML:false,cellStyles:false,cellText:true,bookVBA:false});
      if(!workbook.SheetNames.length)throw new Error('Tidak ada sheet.');
      self.postMessage({type:'sheets',names:workbook.SheetNames});return;
    }
    if(!workbook||data.type!=='page')return;
    const sheet=workbook.Sheets[workbook.SheetNames[data.sheet]],range=XLSX.utils.decode_range(sheet['!ref']||'A1');
    const total=range.e.r+1,totalColumns=range.e.c+1,start=Math.max(0,Math.min(Number(data.page)||0,Math.ceil(total/100)-1))*100;
    const colStart=Math.max(0,Math.min(Number(data.columnPage)||0,Math.ceil(totalColumns/50)-1))*50;
    const end=Math.min(total,start+100),colEnd=Math.min(totalColumns,colStart+50),merges=sheet['!merges']||[],rows=[];
    for(let r=start;r<end;r++){
      const cells=[];
      for(let c=colStart;c<colEnd;c++){
        const merge=merges.find(m=>r>=m.s.r&&r<=m.e.r&&c>=m.s.c&&c<=m.e.c);
        if(merge&&(r!==Math.max(start,merge.s.r)||c!==Math.max(colStart,merge.s.c)))continue;
        const cell=sheet[XLSX.utils.encode_cell(merge?merge.s:{r,c})];
        cells.push({column:c,text:cell?XLSX.utils.format_cell(cell):'',rowSpan:merge?Math.min(end-1,merge.e.r)-r+1:1,colSpan:merge?Math.min(colEnd-1,merge.e.c)-c+1:1});
      }
      rows.push({number:r+1,cells});
    }
    self.postMessage({type:'page',request:data.request,total,totalColumns,start,rows,columns:Array.from({length:colEnd-colStart},(_,i)=>XLSX.utils.encode_col(colStart+i))});
  }catch{self.postMessage({type:'failure',message:'Spreadsheet tidak dapat dibaca. File mungkin rusak, terenkripsi, atau tidak didukung.'});}
};
