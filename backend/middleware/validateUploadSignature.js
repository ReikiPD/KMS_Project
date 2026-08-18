const fs = require("fs/promises");

let fileTypeFromFile;
const getFileTypeFromFile = async () => {
  if (!fileTypeFromFile) ({ fileTypeFromFile } = await import("file-type"));
  return fileTypeFromFile;
};

const allowedByField = {
  thumbnail: new Set(["image/jpeg", "image/png", "image/webp"]),
  avatar: new Set(["image/jpeg", "image/png", "image/webp"]),
  file: new Set(["application/pdf", "video/mp4", "video/webm", "video/ogg", "application/ogg"]),
};

const collectFiles = (req) => [
  ...(req.file ? [req.file] : []),
  ...Object.values(req.files || {}).flat(),
];

const removeFiles = async (files) => Promise.all(files.map((file) => fs.unlink(file.path).catch(() => undefined)));

const validateUploadSignature = async (req, res, next) => {
  const files = collectFiles(req);
  if (files.length === 0) return next();

  try {
    const inspect = await getFileTypeFromFile();
    for (const file of files) {
      const detected = await inspect(file.path);
      const allowedTypes = allowedByField[file.fieldname] || new Set();
      if (!detected || !allowedTypes.has(detected.mime)) {
        await removeFiles(files);
        return res.status(400).json({ error: "Isi file tidak sesuai dengan format unggahan yang diizinkan" });
      }
    }
    return next();
  } catch (error) {
    await removeFiles(files);
    return next(error);
  }
};

module.exports = { validateUploadSignature };
