export const OFFICE_MAX_BYTES=20*1024*1024;
export async function loadBoundedArchive(bytes){
  checkOfficeArchive(bytes);
  const {default:JSZip}=await import('jszip');
  const zip=await JSZip.loadAsync(bytes);let total=0;
  for(const [name,file]of Object.entries(zip.files)){
    if(file.dir)continue;
    // Count actual inflated bytes, not only untrusted sizes from the ZIP index.
    const data=await new Promise((resolve,reject)=>{
      const chunks=[];let size=0,failed=false;
      const stream=file.internalStream('uint8array');
      stream.on('data',chunk=>{
        if(failed)return;
        size+=chunk.length;total+=chunk.length;
        if(size>32*1024*1024||total>100*1024*1024){failed=true;stream.pause();chunks.length=0;reject(new Error('Dokumen terlalu kompleks untuk preview.'));return;}
        chunks.push(chunk);
      }).on('error',reject).on('end',()=>{
        if(failed)return;
        const output=new Uint8Array(size);let offset=0;for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}resolve(output);
      }).resume();
    });
    zip.file(name,data);
  }
  return zip;
}
// Inspect the ZIP central directory before a library inflates OOXML content.
export function checkOfficeArchive(bytes){
  if(bytes.byteLength>OFFICE_MAX_BYTES)throw new Error('Batas preview Office adalah 20 MB. Silakan unduh file asli.');
  const v=new DataView(bytes);let end=-1;
  for(let p=v.byteLength-22;p>=Math.max(0,v.byteLength-65557);p--)if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===v.byteLength){end=p;break;}
  if(end<0)throw new Error('Dokumen rusak atau terenkripsi. Unduh file asli untuk memeriksanya.');
  const count=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),expanded=0;
  if(count>6000||v.getUint16(end+4,true)!==0)throw new Error('Dokumen terlalu kompleks untuk preview.');
  for(let i=0;i<count;i++){
    if(pos+46>end||v.getUint32(pos,true)!==0x02014b50)throw new Error('Indeks dokumen tidak valid.');
    const size=v.getUint32(pos+24,true),length=46+v.getUint16(pos+28,true)+v.getUint16(pos+30,true)+v.getUint16(pos+32,true);
    expanded+=size;
    if(pos+length>end||(v.getUint16(pos+8,true)&1)||size>32*1024*1024||expanded>100*1024*1024)throw new Error('Dokumen terenkripsi atau terlalu kompleks untuk preview.');
    pos+=length;
  }
}
