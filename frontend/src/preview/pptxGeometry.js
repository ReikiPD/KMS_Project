// PPTXjs adapter fixes. All values returned to its HTML builder are finite numbers.
const list=value=>value==null?[]:Array.isArray(value)?value:[value];
const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const EMU=96/914400;

export function groupStyles(transform={},order=0){
 const off=transform['a:off']?.attrs||{},ext=transform['a:ext']?.attrs||{};
 const childOff=transform['a:chOff']?.attrs||{},childExt=transform['a:chExt']?.attrs||{};
 const width=num(ext.cx)*EMU,height=num(ext.cy)*EMU;
 const sx=num(num(childExt.cx)>0?num(ext.cx)/num(childExt.cx):1,1);
 const sy=num(num(childExt.cy)>0?num(ext.cy)/num(childExt.cy):1,1);
 const attrs=transform.attrs||{};
 return {
  outer:`z-index:${num(order)};left:${num(off.x)*EMU}px;top:${num(off.y)*EMU}px;width:${width}px;height:${height}px;transform-origin:50% 50%;transform:rotate(${num(attrs.rot)/60000}deg) scale(${attrs.flipH==='1'?-1:1},${attrs.flipV==='1'?-1:1});`,
  inner:`position:absolute;left:0;top:0;transform-origin:0 0;transform:scale(${sx},${sy}) translate(${-num(childOff.x)*EMU}px,${-num(childOff.y)*EMU}px);`,
 };
}

export function customPaths(geometry,width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<0||height<0)return [];
 return list(geometry?.['a:pathLst']?.['a:path']).flatMap(path=>{
  const attrs=path.attrs||{},w=num(attrs.w,width),h=num(attrs.h,height);
  if(w<=0||h<=0)return [];
  const sx=width/w,sy=height/h,values={w,h,l:0,t:0,r:w,b:h,hc:w/2,vc:h/2,ss:Math.min(w,h),ls:Math.max(w,h),cd2:10800000,cd4:5400000,cd8:2700000};
  for(const divisor of [2,3,4,5,6,8,10,12,16,32]){values[`wd${divisor}`]=w/divisor;values[`hd${divisor}`]=h/divisor;values[`ssd${divisor}`]=Math.min(w,h)/divisor;}
  const resolve=value=>Object.hasOwn(values,value)?values[value]:num(value,NaN);
  for(const guide of [...list(geometry['a:avLst']?.['a:gd']),...list(geometry['a:gdLst']?.['a:gd'])].slice(0,1000)){
   const [op,...args]=String(guide.attrs?.fmla||'').split(/\s+/),[a,b,c]=args.map(resolve);
   const result=op==='val'?a:op==='*/'?a*b/c:op==='+-'?a+b-c:op==='+/'?(a+b)/c:op==='?:'?(a>0?b:c):op==='abs'?Math.abs(a):op==='min'?Math.min(a,b):op==='max'?Math.max(a,b):op==='sqrt'?Math.sqrt(a):NaN;
   if(Number.isFinite(result)&&guide.attrs?.name)values[guide.attrs.name]=result;
  }
  const commands=[];
  for(const type of ['moveTo','lnTo','cubicBezTo','quadBezTo','arcTo','close'])for(const node of list(path[`a:${type}`]))commands.push({type,node,order:num(node.attrs?.order)});
  commands.sort((a,b)=>a.order-b.order);
  let x=0,y=0,startX=0,startY=0,valid=true,d='';
  const point=node=>{const p=node?.attrs||{};return [resolve(p.x)*sx,resolve(p.y)*sy];};
  for(const {type,node}of commands){
   const points=list(node['a:pt']).map(point);
   if(points.some(p=>p.some(v=>!Number.isFinite(v)))){valid=false;break;}
   if(type==='moveTo'||type==='lnTo'){
    if(points.length!==1){valid=false;break;}[x,y]=points[0];
    d+=`${type==='moveTo'?'M':'L'}${x},${y} `;if(type==='moveTo'){startX=x;startY=y;}
   }else if(type==='cubicBezTo'||type==='quadBezTo'){
    if(points.length!==(type==='cubicBezTo'?3:2)){valid=false;break;}
    d+=`${type==='cubicBezTo'?'C':'Q'}${points.map(p=>p.join(',')).join(' ')} `;[x,y]=points.at(-1);
   }else if(type==='arcTo'){
    const a=node.attrs||{},rx=resolve(a.wR)*sx,ry=resolve(a.hR)*sy,angle=resolve(a.stAng)/60000*Math.PI/180,sweep=resolve(a.swAng)/60000*Math.PI/180;
    if(![rx,ry,angle,sweep].every(Number.isFinite)||rx<=0||ry<=0){valid=false;break;}
    // OOXML angles are radial; convert to ellipse parameter angles.
    const parameter=theta=>Math.atan2(rx*Math.sin(theta),ry*Math.cos(theta));
    const start=parameter(angle),cx=x-rx*Math.cos(start),cy=y-ry*Math.sin(start);
    const parts=Math.max(1,Math.ceil(Math.abs(sweep)/Math.PI));if(parts>64){valid=false;break;}
    for(let i=1;i<=parts;i++){const end=parameter(angle+sweep*i/parts);x=cx+rx*Math.cos(end);y=cy+ry*Math.sin(end);d+=`A${rx},${ry} 0 0 ${sweep>=0?1:0} ${x},${y} `;}
   }else if(type==='close'){d+='Z ';x=startX;y=startY;}
  }
  return valid&&d.trim()?[{d:d.trim(),fill:attrs.fill!=='none',stroke:attrs.stroke!=='0'&&attrs.stroke!=='false'}]:[];
 });
}
