const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const { frontendOrigins, host: HOST, httpLogging, port: PORT, request, runMigrationsOnStart, server: serverConfig, trustProxy, uploads } = require("./config/env");
const { ensureUploadsDirectory, uploadsDirectory } = require("./config/storage");
const pool = require("./database/db");
const { runMigrations } = require("./database/migrate");
const assetRoutes = require("./routes/assetRoutes");
const announcementRoutes = require("./routes/announcementRoutes");
const userRoutes = require("./routes/userRoutes");
const { csrfProtection } = require("./middleware/csrf");

ensureUploadsDirectory();

const app = express();

app.set("trust proxy", trustProxy);
app.set("etag", "strong");
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" }, hsts: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || frontendOrigins.includes(origin)) return callback(null, true);
    const error = new Error("Origin tidak diizinkan oleh CORS");
    error.status = 403;
    return callback(error);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token", "X-KMS-Context-User", "X-KMS-Context-Mode"],
  credentials: true,
}));
if (httpLogging) {
  app.use(morgan((tokens, request, response) => `${tokens.method(request, response)} ${request.path} ${tokens.status(request, response)} ${tokens["response-time"](request, response)} ms`));
}
app.use(express.json({ limit: `${request.bodyLimitKb}kb` }));
app.use(express.urlencoded({ extended: true, limit: `${request.bodyLimitKb}kb` }));
app.use(csrfProtection);
app.get("/api/health/live", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.json({ status: "ok" });
});
app.get("/api/health/ready", async (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  try {
    // Selain koneksi, pastikan skema yang dipakai autentikasi dan pembatasan
    // organisasi sudah tersedia. Health check tidak boleh hijau ketika
    // migrasi tertinggal tetapi PostgreSQL masih dapat menerima koneksi.
    await pool.query(
      `SELECT u.work_unit_id, wu.echelon_level, wu.created_at, wu.updated_at,
              rp.can_view, asset.publication_status, review.review_round
       FROM users u
       LEFT JOIN work_units wu ON wu.id = u.work_unit_id
       LEFT JOIN role_permissions rp ON rp.role = u.role
       LEFT JOIN knowledge_assets asset ON FALSE
       LEFT JOIN asset_publication_reviews review ON FALSE
       LIMIT 0`,
    );
    response.json({ status: "ready" });
  } catch {
    response.status(503).json({ status: "unavailable" });
  }
});
app.use("/api/users", (_request, response, next) => {
  response.setHeader("Cache-Control", "private, no-store");
  next();
}, userRoutes);
app.use("/api/assets", (request, response, next) => {
  const privateResponse = request.path.startsWith("/admin")
    || request.path.startsWith("/drafts")
    || request.path.includes("/comments")
    || !["GET", "HEAD"].includes(request.method);
  if (privateResponse) response.setHeader("Cache-Control", "private, no-store");
  next();
}, assetRoutes);
app.use("/api/announcements", (request, response, next) => {
  if (request.path.startsWith("/admin") || !["GET", "HEAD"].includes(request.method)) {
    response.setHeader("Cache-Control", "private, no-store");
  }
  next();
}, announcementRoutes);
if (uploads.serveFromApi) {
  app.use(
    "/uploads",
    (_request, response, next) => {
      response.removeHeader("X-Frame-Options");
      response.setHeader("Content-Security-Policy", `frame-ancestors 'self' ${frontendOrigins.join(" ")}`);
      next();
    },
    express.static(uploadsDirectory, {
      immutable: true,
      maxAge: "1y",
      etag: true,
      fallthrough: false,
      dotfiles: "deny",
      redirect: false,
    }),
  );
}

app.use((_request, response) => {
  response.status(404).json({ error: "Endpoint tidak ditemukan" });
});

app.use((error, _request, response, _next) => {
  if (error?.status === 403) {
    return response.status(403).json({ error: "Origin permintaan tidak diizinkan" });
  }
  if (error?.status === 404 || error?.statusCode === 404) {
    return response.status(404).json({ error: "File tidak ditemukan" });
  }
  console.error("Error middleware:", error);
  const isUploadError = error?.name === "MulterError" || /Thumbnail harus|File utama harus|Avatar harus|Gambar pengumuman harus|Field unggahan/.test(error?.message || "");
  return response.status(isUploadError ? 400 : 500).json({
    error: isUploadError ? "Unggahan tidak valid" : "Terjadi kegagalan pada sistem (Middleware)",
    ...(process.env.NODE_ENV !== "production" ? { detail: error.message || error } : {}),
  });
});

const startServer = async () => {
  try {
    if (runMigrationsOnStart) await runMigrations();
    await pool.query("DELETE FROM user_sessions WHERE absolute_expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days'");
    const server = app.listen(PORT, HOST, () => {
      console.log(`KMS Backend berjalan di ${HOST}:${PORT}`);
    });
    server.keepAliveTimeout = serverConfig.keepAliveTimeoutMs;
    server.headersTimeout = Math.max(serverConfig.headersTimeoutMs, serverConfig.keepAliveTimeoutMs + 1_000);
    server.requestTimeout = serverConfig.requestTimeoutMs;

    const shutdown = (signal) => {
      console.log(`${signal} diterima, menghentikan server dengan aman...`);
      server.close(async () => {
        await pool.end();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), serverConfig.shutdownTimeoutMs).unref();
    };
    process.once("SIGTERM", () => shutdown("SIGTERM"));
    process.once("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("Backend gagal memulai karena migrasi database gagal:", error);
    process.exit(1);
  }
};

startServer();
