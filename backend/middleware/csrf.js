const { frontendOrigins, isProduction, session } = require("../config/env");
const { getRawSessionToken, parseCookies, verifyCsrfToken } = require("../services/sessionService");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const PUBLIC_AUTH_PATHS = new Set([
  "/api/users/register",
  "/api/users/login",
]);

const csrfProtection = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("Origin");
  if (origin && !frontendOrigins.includes(origin)) {
    return res.status(403).json({ error: "Origin permintaan tidak diizinkan" });
  }
  if (isProduction && !origin) {
    return res.status(403).json({ error: "Origin permintaan wajib tersedia" });
  }
  if (PUBLIC_AUTH_PATHS.has(req.path)) return next();

  const sessionToken = getRawSessionToken(req);
  if (!sessionToken) return next();
  const cookies = parseCookies(req.headers.cookie);
  const csrfCookie = cookies[session.csrfCookieName];
  const csrfHeader = req.get("X-CSRF-Token");
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader || !verifyCsrfToken(sessionToken, csrfHeader)) {
    return res.status(403).json({ error: "Token CSRF tidak valid. Muat ulang halaman lalu coba kembali." });
  }
  return next();
};

module.exports = { csrfProtection };
