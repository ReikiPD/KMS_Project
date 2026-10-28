const rateLimit = require("express-rate-limit");
const crypto = require("node:crypto");
const { rateLimits } = require("../config/env");

const limiter = (limit, message) => rateLimit({
  windowMs: rateLimits.windowMs,
  limit,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: message },
});

const authLimiter = limiter(rateLimits.auth, "Terlalu banyak percobaan autentikasi. Silakan coba kembali beberapa saat lagi.");
const loginIpLimiter = limiter(rateLimits.loginIp ?? rateLimits.auth, "Terlalu banyak percobaan autentikasi. Silakan coba kembali beberapa saat lagi.");
// Caller-controlled audience must never select a weaker login policy.
const accountLoginLimiter = rateLimit({
  windowMs: rateLimits.windowMs,
  limit: rateLimits.loginAccount ?? rateLimits.auth,
  keyGenerator: (req) => crypto.createHash("sha256")
    .update(typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "")
    .digest("hex"),
  skipSuccessfulRequests: true,
  standardHeaders: false,
  legacyHeaders: false,
  message: { error: "Terlalu banyak percobaan autentikasi. Silakan coba kembali beberapa saat lagi." },
});
const loginLimiter = (req, res, next) => loginIpLimiter(req, res,
  (error) => error ? next(error) : accountLoginLimiter(req, res, next));
const writeLimiter = limiter(rateLimits.write, "Terlalu banyak perubahan data. Silakan coba kembali beberapa saat lagi.");
const publicEventLimiter = limiter(rateLimits.publicEvent, "Terlalu banyak aktivitas. Silakan coba kembali beberapa saat lagi.");

module.exports = { authLimiter, loginLimiter, writeLimiter, publicEventLimiter };
