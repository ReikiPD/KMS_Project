const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const { uploadsDirectory } = require('../config/storage');
const { maxBytes, maxFiles, maxTotalBytes } = require('../config/internalAssetLimits');

// A private, owner-only directory, not a public /uploads filename. Keeping it
// under UPLOAD_DIR preserves existing backup and systemd writable-path rules.
const privateDirectory=path.join(uploadsDirectory,'.internal-assets');
const formats={
  pdf:['pdf','application/pdf'],
  docx:['word','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  doc:['word','application/msword'],
  xlsx:['spreadsheet','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xls:['spreadsheet','application/vnd.ms-excel'],
  pptx:['presentation','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ppt:['presentation','application/vnd.ms-powerpoint'],
  mp4:['video','video/mp4'],webm:['video','video/webm'],mov:['video','video/quicktime'],
  mp3:['audio','audio/mpeg'],wav:['audio','audio/wav'],m4a:['audio','audio/mp4'],ogg:['audio','audio/ogg'],flac:['audio','audio/flac'],
  png:['image','image/png'],jpg:['image','image/jpeg'],jpeg:['image','image/jpeg'],webp:['image','image/webp'],
  txt:['other','text/plain'],csv:['spreadsheet','text/csv'],zip:['other','application/zip'],rar:['other','application/vnd.rar'],'7z':['other','application/x-7z-compressed'],
};
const extensionOf=name=>path.extname(name||'').slice(1).toLowerCase();
const ensurePrivateDirectory=async()=>{
  await fs.mkdir(privateDirectory,{recursive:true,mode:0o700});
  const stat=await fs.lstat(privateDirectory);
  if(!stat.isDirectory()||stat.isSymbolicLink()) throw new Error('Direktori data internal tidak valid');
  // Preserve a deployment's explicit backup ACL on an existing directory.
};
const privateFilePath=name=>{
  if(!/^[0-9a-f-]{36}\.[a-z0-9]{1,5}$/.test(name||'')) throw new Error('Referensi file internal tidak valid');
  return path.join(privateDirectory,name);
};
const uploadedFiles=req=>req.files ? Object.values(req.files).flat() : req.file?[req.file]:[];
const discardUpload=async(req)=>{await Promise.all(uploadedFiles(req).map(async file=>{try{await fs.unlink(privateFilePath(file.filename));}catch(error){if(error.code==='ENOENT')return;console.error('Internal upload cleanup deferred:',file.filename,error.code);try{await require('../services/internalAssetRetentionService').queueFileCleanup(require('../config/db'),[file.filename]);}catch(queueError){console.error('Internal cleanup queue failed:',file.filename,queueError.code||queueError.message);}}}));};
const upload=multer({
  storage:multer.diskStorage({
    destination:(_req,_file,cb)=>ensurePrivateDirectory().then(()=>cb(null,privateDirectory),cb),
    filename:(_req,file,cb)=>cb(null,`${crypto.randomUUID()}.${extensionOf(file.originalname)}`),
  }),
  fileFilter:(_req,file,cb)=>formats[extensionOf(file.originalname)] ? cb(null,true) : cb(new Error('Format file belum didukung. Gunakan PDF, Office, video, audio, gambar, teks, atau arsip.')),
  // Busboy signals a size limit at equality. Allow one sentinel byte and then
  // validate the inclusive business limit below, without buffering in memory.
  limits:{fileSize:maxBytes+1,files:maxFiles,fields:8,parts:maxFiles+9,fieldSize:64*1024},
}).fields([{name:'files',maxCount:maxFiles},{name:'file',maxCount:1}]);

const internalUpload=(req,res,next)=>upload(req,res,async(error)=>{
  if(error){await discardUpload(req);return res.status(400).json({error:error.code==='LIMIT_FILE_SIZE' ? 'Ukuran file melebihi batas unggahan internal.' : ['LIMIT_FILE_COUNT','LIMIT_UNEXPECTED_FILE'].includes(error.code)?`Maksimal ${maxFiles} file per aset; gunakan kolom berkas yang disediakan.`:error.message});}
  try {
    const files=uploadedFiles(req);
    if(req.aborted)throw new Error('Unggahan dibatalkan.');
    if(files.some(file=>file.size>maxBytes))throw new Error('Ukuran file melebihi batas unggahan internal.');
    if(files.reduce((sum,file)=>sum+file.size,0)>maxTotalBytes)throw new Error('Total ukuran berkas melebihi batas aset.');
    if(!files.length&&req.method==='POST')throw new Error('Pilih minimal satu file.');
    for(const file of files){
    if(!file.size) throw new Error('Pilih file yang tidak kosong.');
    const extension=extensionOf(file.originalname);
    const [kind,mime]=formats[extension];
    if(['txt','csv'].includes(extension)) {
      const handle=await fs.open(file.path,'r');
      const buffer=Buffer.alloc(8192);
      try {const {bytesRead}=await handle.read(buffer,0,buffer.length,0);if(buffer.subarray(0,bytesRead).includes(0)) throw new Error('Isi file teks tidak valid.');} finally {await handle.close();}
    } else {
      const {fileTypeFromFile}=await import('file-type');
      const detected=await fileTypeFromFile(file.path);
      const legacy=['doc','xls','ppt'].includes(extension) && detected?.mime==='application/x-cfb';
      const compatible=({wav:['audio/vnd.wave','audio/wav'],ogg:['application/ogg','audio/ogg'],m4a:['audio/x-m4a','audio/mp4']})[extension]||[mime];
      if(!legacy && !compatible.includes(detected?.mime)) throw new Error('Isi file tidak cocok dengan ekstensi. Pilih file asli dengan format yang benar.');
    }
    // Keep inherited backup ACLs; the containing directory is private.
    file.kind=kind;file.canonicalMime=mime;
    }
    req.internalFiles=files;
    next();
  } catch(error) {await discardUpload(req);res.status(400).json({error:error.message});}
});
module.exports={internalUpload,privateDirectory,privateFilePath,discardUpload,formats,uploadedFiles};
