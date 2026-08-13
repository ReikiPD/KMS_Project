const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "kms_kemenkeu_assets", // Nama folder di dalam Cloudinary Anda
    resource_type: "auto", // Sangat penting: 'auto' mengizinkan upload gambar, PDF, dan video
    allowed_formats: ["jpg", "jpeg", "png", "pdf", "mp4"],
  },
});

const upload = multer({ storage: storage });

module.exports = upload;
