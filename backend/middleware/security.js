const rateLimit = require("express-rate-limit");

const limiter = (limit, message) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: message },
});

const authLimiter = limiter(10, "Terlalu banyak percobaan autentikasi. Silakan coba kembali dalam 15 menit.");
const writeLimiter = limiter(120, "Terlalu banyak perubahan data. Silakan coba kembali beberapa saat lagi.");
const publicEventLimiter = limiter(60, "Terlalu banyak aktivitas. Silakan coba kembali beberapa saat lagi.");

module.exports = { authLimiter, writeLimiter, publicEventLimiter };
