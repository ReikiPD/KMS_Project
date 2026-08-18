const multer = require("multer");
const path = require("path");

const uploadsDirectory = path.join(__dirname, "../uploads");
const extensionOf = (file) => path.extname(file.originalname || "").toLowerCase();
const imageExtensions = { "image/jpeg": [".jpg", ".jpeg"], "image/png": [".png"], "image/webp": [".webp"] };
const mediaExtensions = { "application/pdf": [".pdf"], "video/mp4": [".mp4"], "video/webm": [".webm"], "video/ogg": [".ogg"] };

const assetStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDirectory),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDirectory),
  filename: (req, file, cb) => {
    const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `avatar-${uniqueSuffix}${extensions[file.mimetype] || ""}`);
  },
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

const assetUpload = multer({
  storage: assetStorage,
  fileFilter: assetFileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: avatarFileFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

module.exports = { assetUpload, avatarUpload };
