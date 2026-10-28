const fs=require('node:fs/promises');
const zlib=require('node:zlib');
const path=require('node:path');

// Read only selected XML parts of OOXML, never extract an archive to disk or
// run Office/macros. Bound input, entry count, decompression and output sizes.
const MAX_XML=2*1024*1024;
const readOfficeParts=async(filePath)=>{
  const stat=await fs.stat(filePath);
  if(stat.size>50*1024*1024) throw new Error('File terlalu besar untuk preview isi. Unduh untuk membukanya.');
  const buffer=await fs.readFile(filePath);
  let end=-1;
  for(let p=buffer.length-22;p>=Math.max(0,buffer.length-65557);p--) {
    if(buffer.readUInt32LE(p)===0x06054b50 && p+22+buffer.readUInt16LE(p+20)===buffer.length){end=p;break;}
  }
  if(end<0) throw new Error('Struktur dokumen tidak dapat dipreview.');
  const count=buffer.readUInt16LE(end+10);let cursor=buffer.readUInt32LE(end+16);
  if(count>6000 || buffer.readUInt16LE(end+4)!==0) throw new Error('Dokumen terlalu kompleks untuk preview.');
  const entries=[];
  for(let i=0;i<count;i++){
    if(cursor+46>buffer.length || buffer.readUInt32LE(cursor)!==0x02014b50) throw new Error('Indeks dokumen tidak valid.');
    const nameLength=buffer.readUInt16LE(cursor+28),extra=buffer.readUInt16LE(cursor+30),comment=buffer.readUInt16LE(cursor+32);
    const name=buffer.toString('utf8',cursor+46,cursor+46+nameLength);
    if(/^(word\/document\.xml|xl\/(workbook|sharedStrings)\.xml|xl\/worksheets\/sheet\d+\.xml|ppt\/slides\/slide\d+\.xml)$/.test(name)) {
      entries.push({name,flags:buffer.readUInt16LE(cursor+8),method:buffer.readUInt16LE(cursor+10),size:buffer.readUInt32LE(cursor+20),expanded:buffer.readUInt32LE(cursor+24),offset:buffer.readUInt32LE(cursor+42)});
    }
    cursor+=46+nameLength+extra+comment;
  }
  const extension=path.extname(filePath);
  const selected=entries.filter(entry=>extension==='.docx'?entry.name==='word/document.xml':extension==='.xlsx'?entry.name.startsWith('xl/'):entry.name.startsWith('ppt/')).sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true})).slice(0,extension==='.xlsx'?7:30);
  const parts=[];let total=0;
  for(const entry of selected){
    const {offset,size,expanded,method,flags}=entry;
    if(flags&1 || expanded>MAX_XML || ![0,8].includes(method) || offset+30>buffer.length || buffer.readUInt32LE(offset)!==0x04034b50) throw new Error('Dokumen terenkripsi atau terlalu besar untuk preview isi.');
    const start=offset+30+buffer.readUInt16LE(offset+26)+buffer.readUInt16LE(offset+28);
    if(start+size>buffer.length) throw new Error('Bagian dokumen tidak lengkap.');
    const data=method===8?zlib.inflateRawSync(buffer.subarray(start,start+size),{maxOutputLength:MAX_XML}):buffer.subarray(start,start+size);
    total+=data.length;
    if(data.length>MAX_XML || total>5*MAX_XML) throw new Error('Isi dokumen melebihi batas preview.');
    const xml=data.toString('utf8');
    if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Struktur XML tidak didukung.');
    parts.push({name:entry.name,xml});
  }
  if(!parts.length) throw new Error('Isi dokumen belum didukung untuk preview.');
  return {format:extension.slice(1),parts,limited:true};
};
module.exports={readOfficeParts};
