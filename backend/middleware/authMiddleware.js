const jwt = require("jsonwebtoken");
const pool = require("../database/db");
require("../config/env");

const BACKOFFICE_ROLES = new Set(["pegawai", "pimpinan", "admin"]);

const verifyToken = async (req, res, next) => {
  // Token biasanya dikirim di dalam header Authorization dengan format: "Bearer <token>"
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(403)
      .json({ error: "Akses ditolak. Token tidak ditemukan." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role === "admin" && decoded.environmentAdmin === true) {
      req.user = decoded;
      return next();
    }

    const { rows } = await pool.query(
      `SELECT id, full_name, email, department, avatar_url, role
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [decoded.id],
    );
    const user = rows[0];
    if (!user || user.role !== decoded.role) {
      return res.status(401).json({ error: "Sesi tidak lagi aktif. Silakan login kembali." });
    }
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({
      error: "Sesi tidak valid atau telah kedaluwarsa. Silakan login kembali.",
    });
  }
};

const optionalToken = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return next();
  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (!error) req.user = decoded;
    next();
  });
};

const reject = (res, detail) => res.status(403).json({ error: "Akses ditolak", detail });

const requireBackoffice = (req, res, next) => {
  if (!req.user || !BACKOFFICE_ROLES.has(req.user.role)) return reject(res, "Halaman ini hanya tersedia untuk Pegawai, Pimpinan, atau Admin.");
  return next();
};

const requireAssetWrite = (req, res, next) => {
  if (!req.user || !["pegawai", "admin"].includes(req.user.role)) return reject(res, "Pimpinan hanya memiliki akses lihat.");
  return next();
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin") return reject(res, "Hanya Admin yang dapat mengubah data master atau akun Pegawai.");
  return next();
};

const requireCommenter = (req, res, next) => {
  if (!req.user || !["user", "pegawai"].includes(req.user.role)) return reject(res, "Hanya akun publik atau Pegawai yang dapat menulis komentar.");
  return next();
};

const requirePegawai = (req, res, next) => {
  if (req.user?.role !== "pegawai") return reject(res, "Fitur ini hanya tersedia untuk Pegawai.");
  return next();
};

const requirePersistentUser = (req, res, next) => {
  if (!req.user?.id) return reject(res, "Akun Admin environment tidak memiliki profil tersimpan.");
  return next();
};

module.exports = { verifyToken, optionalToken, requireBackoffice, requireAssetWrite, requireAdmin, requireCommenter, requirePegawai, requirePersistentUser };
