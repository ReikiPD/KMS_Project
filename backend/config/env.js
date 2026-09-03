const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ quiet: true });

const nodeEnv = (process.env.NODE_ENV || "development").trim().toLowerCase();
const host = (process.env.HOST || "127.0.0.1").trim();
const isProduction = nodeEnv === "production";

const frontendOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const numberFromEnv = (name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const booleanFromEnv = (name, fallback) => {
  if (process.env[name] === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(process.env[name]).toLowerCase());
};

const requiredSecret = (name, minimumLength = 32) => {
  const value = (process.env[name] || "").trim();
  const uniqueCharacters = new Set(value).size;
  const looksLikePlaceholder = /(?:change|replace|ganti|example|placeholder|password|secret|__)/i.test(value);
  if (isProduction && (value.length < minimumLength || uniqueCharacters < 16 || looksLikePlaceholder)) {
    throw new Error(`${name} production wajib berupa nilai acak kuat minimal ${minimumLength} karakter`);
  }
  return value;
};

const configuredUploadDirectory = (process.env.UPLOAD_DIR || "").trim();
const serveUploadsFromApi = booleanFromEnv("SERVE_UPLOADS_FROM_API", nodeEnv !== "production");
const mediaAccelRedirectPrefix = (process.env.MEDIA_ACCEL_REDIRECT_PREFIX || "").trim().replace(/\/$/, "");

if (isProduction && host !== "127.0.0.1" && host !== "::1") {
  throw new Error("HOST production wajib menggunakan loopback 127.0.0.1 atau ::1");
}
if (isProduction && !process.env.FRONTEND_ORIGIN) {
  throw new Error("FRONTEND_ORIGIN wajib dikonfigurasi di lingkungan production");
}
if (configuredUploadDirectory && !path.isAbsolute(configuredUploadDirectory)) {
  throw new Error("UPLOAD_DIR wajib menggunakan path absolut");
}
if (isProduction && !configuredUploadDirectory) {
  throw new Error("UPLOAD_DIR wajib dikonfigurasi di lingkungan production");
}
if (isProduction && serveUploadsFromApi) {
  throw new Error("SERVE_UPLOADS_FROM_API wajib false di lingkungan production");
}
if (mediaAccelRedirectPrefix && (!mediaAccelRedirectPrefix.startsWith("/") || mediaAccelRedirectPrefix.includes(".."))) {
  throw new Error("MEDIA_ACCEL_REDIRECT_PREFIX wajib berupa path internal Nginx yang aman");
}

const sessionCookieSecure = booleanFromEnv("SESSION_COOKIE_SECURE", isProduction);
if (isProduction && !sessionCookieSecure) {
  throw new Error("SESSION_COOKIE_SECURE wajib true di lingkungan production");
}
if (isProduction && frontendOrigins.some((origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol !== "https:" || parsed.origin !== origin;
  } catch {
    return true;
  }
})) {
  throw new Error("FRONTEND_ORIGIN production wajib berupa origin HTTPS tanpa path");
}
if (isProduction && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL wajib dikonfigurasi di lingkungan production");
}

const csrfSecret = requiredSecret("CSRF_SECRET") || "kms-development-csrf-secret-change-before-production";
const configuredAdminPasswordHash = process.env.KMS_ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH || "";
const configuredAdminEmail = (process.env.KMS_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const bcryptMatch = configuredAdminPasswordHash.match(/^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/);
if (isProduction && (!bcryptMatch || Number(bcryptMatch[1]) < 12)) {
  throw new Error("KMS_ADMIN_PASSWORD_HASH production wajib berupa bcrypt hash dengan cost minimal 12");
}
if (isProduction && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredAdminEmail)) {
  throw new Error("KMS_ADMIN_EMAIL production wajib berupa alamat email yang valid");
}

module.exports = {
  nodeEnv,
  isProduction,
  frontendOrigins,
  host,
  port: Number(process.env.PORT) || 3000,
  trustProxy: numberFromEnv("TRUST_PROXY_HOPS", nodeEnv === "production" ? 1 : 0, { min: 0, max: 5 }),
  httpLogging: booleanFromEnv("HTTP_LOGGING", nodeEnv !== "production"),
  runMigrationsOnStart: booleanFromEnv("RUN_MIGRATIONS_ON_START", nodeEnv !== "production"),
  uploads: {
    directory: path.resolve(configuredUploadDirectory || path.join(__dirname, "../uploads")),
    serveFromApi: serveUploadsFromApi,
    accelRedirectPrefix: mediaAccelRedirectPrefix,
    assetMaxBytes: numberFromEnv("ASSET_UPLOAD_MAX_BYTES", 20 * 1024 * 1024, { min: 1024 * 1024, max: 200 * 1024 * 1024 }),
    avatarMaxBytes: numberFromEnv("AVATAR_UPLOAD_MAX_BYTES", 2 * 1024 * 1024, { min: 256 * 1024, max: 10 * 1024 * 1024 }),
    minimumFreeBytes: numberFromEnv("UPLOAD_MINIMUM_FREE_BYTES", isProduction ? 2 * 1024 * 1024 * 1024 : 100 * 1024 * 1024, { min: 50 * 1024 * 1024 }),
  },
  mediaOptimization: {
    enabled: booleanFromEnv("MEDIA_OPTIMIZATION_ENABLED", isProduction),
    ffmpegPath: (process.env.FFMPEG_PATH || "ffmpeg").trim(),
    ghostscriptPath: (process.env.GHOSTSCRIPT_PATH || (process.platform === "win32" ? "gswin64c" : "gs")).trim(),
    timeoutMs: numberFromEnv("MEDIA_OPTIMIZATION_TIMEOUT_MS", 90_000, { min: 30_000, max: 10 * 60 * 1000 }),
    concurrency: numberFromEnv("MEDIA_OPTIMIZATION_CONCURRENCY", 1, { min: 1, max: 4 }),
    videoCrf: numberFromEnv("MEDIA_OPTIMIZATION_VIDEO_CRF", 28, { min: 18, max: 35 }),
    minSavingsPercent: numberFromEnv("MEDIA_OPTIMIZATION_MIN_SAVINGS_PERCENT", 5, { min: 0, max: 50 }),
    pdfQuality: ["screen", "ebook", "printer", "prepress"].includes(process.env.MEDIA_OPTIMIZATION_PDF_QUALITY)
      ? process.env.MEDIA_OPTIMIZATION_PDF_QUALITY
      : "ebook",
  },
  request: {
    bodyLimitKb: numberFromEnv("REQUEST_BODY_LIMIT_KB", 1024, { min: 64, max: 10 * 1024 }),
  },
  server: {
    keepAliveTimeoutMs: numberFromEnv("SERVER_KEEP_ALIVE_TIMEOUT_MS", 65_000, { min: 5_000, max: 120_000 }),
    headersTimeoutMs: numberFromEnv("SERVER_HEADERS_TIMEOUT_MS", 66_000, { min: 6_000, max: 180_000 }),
    requestTimeoutMs: numberFromEnv("SERVER_REQUEST_TIMEOUT_MS", 120_000, { min: 10_000, max: 300_000 }),
    shutdownTimeoutMs: numberFromEnv("SERVER_SHUTDOWN_TIMEOUT_MS", 10_000, { min: 3_000, max: 60_000 }),
  },
  rateLimits: {
    windowMs: numberFromEnv("RATE_LIMIT_WINDOW_MS", 15 * 60 * 1000, { min: 10_000, max: 24 * 60 * 60 * 1000 }),
    auth: numberFromEnv("RATE_LIMIT_AUTH_MAX", 10, { min: 3, max: 1000 }),
    write: numberFromEnv("RATE_LIMIT_WRITE_MAX", 120, { min: 10, max: 10_000 }),
    publicEvent: numberFromEnv("RATE_LIMIT_PUBLIC_EVENT_MAX", 60, { min: 10, max: 10_000 }),
  },
  session: {
    cookieName: isProduction ? "__Host-kms_session" : "kms_session",
    csrfCookieName: isProduction ? "__Host-kms_csrf" : "kms_csrf",
    cookieSecure: sessionCookieSecure,
    csrfSecret,
    idleMinutes: numberFromEnv("SESSION_IDLE_MINUTES", 30, { min: 5, max: 24 * 60 }),
    absoluteMinutes: numberFromEnv("SESSION_ABSOLUTE_MINUTES", 8 * 60, { min: 15, max: 7 * 24 * 60 }),
    adminIdleMinutes: numberFromEnv("ADMIN_SESSION_IDLE_MINUTES", 20, { min: 5, max: 24 * 60 }),
    adminAbsoluteMinutes: numberFromEnv("ADMIN_SESSION_ABSOLUTE_MINUTES", 2 * 60, { min: 15, max: 24 * 60 }),
    touchIntervalSeconds: numberFromEnv("SESSION_TOUCH_INTERVAL_SECONDS", 300, { min: 30, max: 3600 }),
  },
  database: {
    maxConnections: numberFromEnv("DATABASE_POOL_MAX", 10, { min: 2, max: 50 }),
    idleTimeoutMs: numberFromEnv("DATABASE_IDLE_TIMEOUT_MS", 30_000, { min: 1_000, max: 300_000 }),
    connectionTimeoutMs: numberFromEnv("DATABASE_CONNECTION_TIMEOUT_MS", 5_000, { min: 1_000, max: 60_000 }),
    statementTimeoutMs: numberFromEnv("DATABASE_STATEMENT_TIMEOUT_MS", 30_000, { min: 1_000, max: 120_000 }),
  },
  admin: {
    // Prefiks KMS diprioritaskan agar konfigurasi Admin dapat dipisahkan
    // dari kredensial lama tanpa mengubah variabel deployment yang sudah ada.
    email: configuredAdminEmail,
    passwordHash: configuredAdminPasswordHash,
    fullName: (process.env.KMS_ADMIN_FULL_NAME || process.env.ADMIN_FULL_NAME || "Administrator KMS").trim(),
  },
};
