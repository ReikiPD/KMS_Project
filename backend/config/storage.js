const fs = require("fs");
const fsPromises = require("fs/promises");
const { uploads } = require("./env");

const uploadsDirectory = uploads.directory;

const ensureUploadsDirectory = () => {
  fs.mkdirSync(uploadsDirectory, { recursive: true, mode: 0o750 });
  const stats = fs.statSync(uploadsDirectory);
  if (!stats.isDirectory()) throw new Error("UPLOAD_DIR bukan sebuah direktori");
};

const ensureUploadCapacity = async (_req, res, next) => {
  try {
    const stats = await fsPromises.statfs(uploadsDirectory);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    if (freeBytes < uploads.minimumFreeBytes) {
      return res.status(507).json({ error: "Penyimpanan unggahan hampir penuh. Hubungi administrator sebelum mengunggah file baru." });
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { ensureUploadsDirectory, ensureUploadCapacity, uploadsDirectory };
