const rateLimit = require("express-rate-limit");
const { rateLimits } = require("../config/env");

const limiter = (limit, message) => rateLimit({
  windowMs: rateLimits.windowMs,
  limit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: message },
});

const authLimiter = limiter(rateLimits.auth, "Terlalu banyak percobaan autentikasi. Silakan coba kembali beberapa saat lagi.");
const writeLimiter = limiter(rateLimits.write, "Terlalu banyak perubahan data. Silakan coba kembali beberapa saat lagi.");
const publicEventLimiter = limiter(rateLimits.publicEvent, "Terlalu banyak aktivitas. Silakan coba kembali beberapa saat lagi.");

module.exports = { authLimiter, writeLimiter, publicEventLimiter };
