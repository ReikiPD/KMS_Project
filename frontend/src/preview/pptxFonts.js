// EOT structure: https://www.w3.org/submissions/EOT/
// Only bounded, uncompressed/unobfuscated OpenType payloads are used. Compressed
// EOT and restricted/bitmap-only fonts retain the browser's local fallback.
export function openTypePayload(bytes){
 if(bytes.byteLength<82||bytes.byteLength>8*1024*1024)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(0,true)!==bytes.byteLength||view.getUint16(34,true)!==0x504c)return null;
 if(![0x00010000,0x00020001,0x00020002].includes(view.getUint32(8,true)))return null;
 if(view.getUint32(12,true)&0x100000a4)return null;
 if(view.getUint16(32,true)&0x0202)return null;
 const size=view.getUint32(4,true),offset=bytes.length-size;
 if(size<12||offset<82)return null;
 const signature=view.getUint32(offset,false);
 if(signature!==0x4f54544f&&signature!==0x00010000)return null;
 return {bytes:bytes.slice(offset),weight:Math.max(100,Math.min(900,view.getUint32(28,true)||400)),style:view.getUint8(27)?'italic':'normal'};
}

export async function loadPptxFonts(zip){
 const part=zip.file('ppt/presentation.xml'),rels=zip.file('ppt/_rels/presentation.xml.rels');
 if(!part||!rels)return;
 const parse=text=>new DOMParser().parseFromString(text,'application/xml');
 const xml=parse(await part.async('string')),relations=parse(await rels.async('string'));
 const targets=new Map([...relations.getElementsByTagNameNS('*','Relationship')].map(n=>[n.getAttribute('Id'),n.getAttribute('Target')]));
 let count=0;
 for(const font of xml.getElementsByTagNameNS('*','embeddedFont')){
  const family=font.getElementsByTagNameNS('*','font')[0]?.getAttribute('typeface');
  if(!family||family.length>200)continue;
  for(const style of ['regular','bold','italic','boldItalic']){
   const face=font.getElementsByTagNameNS('*',style)[0],id=face?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
   const target=targets.get(id);
   if(!target||!/^(?:\/ppt\/)?fonts\/[a-z0-9_.-]+$/i.test(target))continue;
   const entry=zip.file(target.startsWith('/')?target.slice(1):`ppt/${target}`);
   if(!entry||++count>32)continue;
   const payload=openTypePayload(await entry.async('uint8array'));if(!payload)continue;
   try{
    const loaded=await new FontFace(family,payload.bytes,{weight:String(payload.weight),style:payload.style}).load();
    document.fonts.add(loaded);
   }catch{/* Invalid or unsupported font: retain the system fallback. */}
  }
 }
}
