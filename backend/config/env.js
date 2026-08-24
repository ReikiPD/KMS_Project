const dotenv = require("dotenv");

dotenv.config({ quiet: true });

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

module.exports = {
  frontendOrigins,
  port: Number(process.env.PORT) || 3000,
  trustProxy: numberFromEnv("TRUST_PROXY_HOPS", 1, { min: 0, max: 5 }),
  httpLogging: booleanFromEnv("HTTP_LOGGING", process.env.NODE_ENV !== "production"),
  runMigrationsOnStart: booleanFromEnv("RUN_MIGRATIONS_ON_START", process.env.NODE_ENV !== "production"),
  database: {
    maxConnections: numberFromEnv("DATABASE_POOL_MAX", 10, { min: 2, max: 50 }),
    idleTimeoutMs: numberFromEnv("DATABASE_IDLE_TIMEOUT_MS", 30_000, { min: 1_000, max: 300_000 }),
    connectionTimeoutMs: numberFromEnv("DATABASE_CONNECTION_TIMEOUT_MS", 5_000, { min: 1_000, max: 60_000 }),
    statementTimeoutMs: numberFromEnv("DATABASE_STATEMENT_TIMEOUT_MS", 30_000, { min: 1_000, max: 120_000 }),
  },
  admin: {
    // Prefiks KMS diprioritaskan agar konfigurasi Admin dapat dipisahkan
    // dari kredensial lama tanpa mengubah variabel deployment yang sudah ada.
    email: (process.env.KMS_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
    passwordHash: process.env.KMS_ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH || "",
    fullName: (process.env.KMS_ADMIN_FULL_NAME || process.env.ADMIN_FULL_NAME || "Administrator KMS").trim(),
  },
};
