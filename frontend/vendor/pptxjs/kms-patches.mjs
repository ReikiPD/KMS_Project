// Surgical adapters for the pinned upstream 1.21.1 bundle. Fail the build if
// upstream changes instead of silently applying a patch to the wrong function.
export function patchPptxRenderer(source){
 const replaceSection=(start,end,replacement)=>{
  const from=source.indexOf(start),to=source.indexOf(end,from+start.length);
  if(from<0||to<0||source.indexOf(start,from+1)!==-1)throw new Error('PPTXjs adapter no longer matches the pinned renderer.');
  source=source.slice(0,from)+replacement+source.slice(to);
 };
 replaceSection('function m(a, t, r) {','function y(a, t, r, e, s)',`function m(a, t, r) {
  var css=window.KMSPptxGroups(ul(a,["p:grpSpPr","a:xfrm"]),a.attrs.order);
  var html="<div class='block group' style='"+css.outer+"'><div class='kms-group-space' style='"+css.inner+"'>";
  for(var key in a){var nodes=Array.isArray(a[key])?a[key]:[a[key]];
   for(var index=0;index<nodes.length;index++)html+=z(key,nodes[index],a,t,r,"kms-group");}
  return html+"</div></div>";
 } `);
 replaceSection('var Fn = ul(y, ["a:pathLst"])','g += "</svg>"',`var Fn,Nn,On,En,Hn,qn,Un,Vn,Qn,Xn,Yn,Wn,Zn,$n,Jn,Kn,al,ga;
  var paths=window.KMSPptxPaths(y,P,w);
  for(var pathIndex=0;pathIndex<paths.length;pathIndex++){
   var path=paths[pathIndex];
   g+="<path d='"+path.d+"' fill='"+(path.fill?(C?"url(#imgPtrn_"+b+")":_?"url(#linGrd_"+b+")":I):"none")+"' stroke='"+(path.stroke&&S?S.color:"none")+"' stroke-width='"+(S?S.width:0)+"' stroke-dasharray='"+(S?S.strokeDasharray:"")+"'/>";
  } `);
 // Normal spaces allow wrapping at word boundaries; nonbreaking spaces force
 // the legacy renderer to split words between rich-text runs.
 source=source.replaceAll('.replace(/\\s/g, "&nbsp;")','');
 // Its XML parser drops whitespace-only a:t nodes. Preserve these rich-text
 // spacer runs as character references until the sanitized HTML is parsed.
 source=source.replace('var e = a.file(t).asText();',`var e = a.file(t).asText().replace(/(<a:t\\b[^>]*>)([\\t\\r\\n ]+)(<\\/a:t>)/g,function(match,open,value,close){return open+value.replace(/[\\t\\r\\n ]/g,function(c){return "&#"+c.charCodeAt(0)+";";})+close;});`);
 // OOXML sizes are points; geometry is at 96 CSS px/inch, so text must use
 // 96/72 as well. The upstream 1.25 conversion changes line wrapping.
 if(!source.includes('R = 1.25'))throw new Error('PPTXjs font scale adapter no longer matches.');
 source=source.replace('R = 1.25','R = 96 / 72');
 source=source.replace('return void 0 === s ? "inherit" : s }(a, n, d, s)',
  'return void 0 === s ? "inherit" : s + ", Arial, sans-serif" }(a, n, d, s)');
 return source;
}
