const jwt = require("jsonwebtoken");
require("dotenv").config();

const verifyToken = (req, res, next) => {
  // Token biasanya dikirim di dalam header Authorization dengan format: "Bearer <token>"
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(403)
      .json({ error: "Akses ditolak. Token tidak ditemukan." });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        error:
          "Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.",
      });
    }

    // Jika valid, simpan data hasil ekstrak token (id, email) ke dalam req.user
    // Ini sangat berguna untuk digunakan di controller selanjutnya
    req.user = decoded;
    next();
  });
};

const requirePegawai = (req, res, next) => {
  // req.user didapatkan dari middleware verifyToken yang berjalan sebelumnya
  if (!req.user || req.user.role !== "pegawai") {
    return res.status(403).json({
      error: "Akses Ditolak",
      detail:
        "Hanya akun dengan hak akses Pegawai yang diizinkan mengunggah atau mengedit dokumen.",
    });
  }

  next(); // Lanjutkan ke controller jika dia adalah pegawai
};

module.exports = { verifyToken, requirePegawai };
