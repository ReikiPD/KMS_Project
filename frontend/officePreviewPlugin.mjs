import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {patchPptxRenderer} from './vendor/pptxjs/kms-patches.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
// Classic scripts deliberately avoid cross-origin module imports in opaque-origin frames.
export const officePreviewPlugin=()=>{
  let pending;
  const assets=()=>pending??=(async()=>{
    const result={};
    for(const kind of ['docx','pptx']){
      const bundle=await build({absWorkingDir:root,entryPoints:[`src/preview/${kind}Frame.js`],bundle:true,write:false,format:'iife',target:'es2022',minify:true,legalComments:'inline'});
      let prelude='';
      if(kind==='pptx'){
        prelude=await readFile(new URL('./node_modules/jquery/dist/jquery.min.js',import.meta.url),'utf8');
        for(const name of ['d3.min.js','nv.d3.min.js','dingbat.js','pptxjs.min.js']){
          const source=await readFile(new URL('./vendor/pptxjs/js/'+name,import.meta.url),'utf8');
          prelude+='\n'+(name==='pptxjs.min.js'?patchPptxRenderer(source):source);
        }
      }
      result[`${kind}.js`]=prelude+'\n'+bundle.outputFiles[0].text;
      let css='html,body{margin:0;background:#e9edf1;color:#182434;font-family:Arial,sans-serif}#document{padding:12px;overflow:auto;min-height:100vh;box-sizing:border-box}a{pointer-events:none}section.docx{color:#000;background:white}.docx-wrapper{padding:12px!important}.slide{background:white}';
      if(kind==='pptx')for(const name of ['pptxjs.css','nv.d3.min.css'])css+='\n'+await readFile(new URL('./vendor/pptxjs/css/'+name,import.meta.url),'utf8');
      result[`${kind}.html`]=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; media-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><style>${css}</style></head><body><div id="document"></div><script src="./${kind}.js"></script></body></html>`;
    }
    const licenses=[];
    for(const file of ['vendor/pptxjs/LICENSE','vendor/pptxjs/D3-LICENSE','vendor/pptxjs/NVD3-LICENSE','node_modules/docx-preview/LICENSE','node_modules/dompurify/LICENSE','node_modules/jquery/LICENSE.txt','node_modules/jszip/LICENSE.markdown','node_modules/xlsx/LICENSE'])licenses.push(file+'\n'+await readFile(new URL(file,import.meta.url),'utf8'));
    result['THIRD-PARTY-LICENSES.txt']=licenses.join('\n\n');
    return result;
  })();
  return {name:'kms-office-sandbox',
    configureServer(server){server.middlewares.use(async(req,res,next)=>{
      const key=req.url?.split('?')[0].replace(/^\/office-preview\//,'');
      if(!req.url?.startsWith('/office-preview/')||!['docx.html','pptx.html','docx.js','pptx.js'].includes(key))return next();
      try{res.setHeader('Content-Type',key.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8');res.end((await assets())[key]);}catch(e){next(e);}
    });},
    async generateBundle(){for(const [name,source]of Object.entries(await assets()))this.emitFile({type:'asset',fileName:`office-preview/${name}`,source});},
  };
};
