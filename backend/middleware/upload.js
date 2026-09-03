const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const { uploadsDirectory } = require("../config/storage");
const { uploads } = require("../config/env");

const extensionOf = (file) => path.extname(file.originalname || "").toLowerCase();
const imageExtensions = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] };
const mediaExtensions = { "application/pdf": [".pdf"], "video/mp4": [".mp4"], "video/webm": [".webm"], "video/ogg": [".ogg"] };
const canonicalExtension = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogg",
};

const generatedFileName = (prefix, file) => `${prefix}-${crypto.randomUUID()}${canonicalExtension[file.mimetype] || ""}`;

const assetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDirectory),
  filename: (req, file, cb) => cb(null, generatedFileName(file.fieldname, file)),
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDirectory),
  filename: (req, file, cb) => cb(null, generatedFileName("avatar", file)),
});

const announcementStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDirectory),
  filename: (req, file, cb) => cb(null, generatedFileName("announcement", file)),
});

const assetFileFilter = (req, file, cb) => {
  if (file.fieldname === "thumbnail") {
    if (imageExtensions[file.mimetype]?.includes(extensionOf(file))) return cb(null, true);
    return cb(new Error("Thumbnail harus berupa file gambar."));
  }

  if (file.fieldname === "file") {
    const allowedMimeTypes = ["application/pdf", "video/mp4", "video/webm", "video/ogg"];
    if (allowedMimeTypes.includes(file.mimetype) && mediaExtensions[file.mimetype]?.includes(extensionOf(file))) return cb(null, true);
    return cb(new Error("File utama harus berupa PDF, MP4, WebM, atau OGG."));
  }

  return cb(new Error("Field unggahan tidak dikenali."));
};

const avatarFileFilter = (req, file, cb) => {
  if (file.fieldname !== "avatar") return cb(new Error("Field unggahan tidak dikenali."));
  if (imageExtensions[file.mimetype]?.includes(extensionOf(file))) return cb(null, true);
  return cb(new Error("Avatar harus berupa JPG, PNG, atau WebP."));
};

const announcementFileFilter = (req, file, cb) => {
  if (file.fieldname !== "image") return cb(new Error("Field unggahan tidak dikenali."));
  if (imageExtensions[file.mimetype]?.includes(extensionOf(file))) return cb(null, true);
  return cb(new Error("Gambar pengumuman harus berupa JPG, PNG, atau WebP."));
};

const assetUpload = multer({
  storage: assetStorage,
  fileFilter: assetFileFilter,
  limits: { fileSize: uploads.assetMaxBytes, files: 2, fields: 20, parts: 22 },
});

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: { fileSize: uploads.avatarMaxBytes, files: 1, fields: 2, parts: 3 },
});

const announcementUpload = multer({
  storage: announcementStorage,
  fileFilter: announcementFileFilter,
  limits: { fileSize: uploads.avatarMaxBytes, files: 1, fields: 10, parts: 11 },
});

module.exports = { announcementUpload, assetUpload, avatarUpload };
