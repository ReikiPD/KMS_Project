const express = require("express");
const cors = require("cors");
const fs = require("fs");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const { frontendOrigins, port: PORT } = require("./config/env");
const { runMigrations } = require("./database/migrate");
const assetRoutes = require("./routes/assetRoutes");
const userRoutes = require("./routes/userRoutes");

const uploadsDirectory = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDirectory)) fs.mkdirSync(uploadsDirectory, { recursive: true });

const app = express();

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || frontendOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin tidak diizinkan oleh CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(morgan((tokens, request, response) => `${tokens.method(request, response)} ${request.path} ${tokens.status(request, response)} ${tokens["response-time"](request, response)} ms`));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use("/api/users", userRoutes);
app.use("/api/assets", assetRoutes);
app.use("/uploads", express.static(uploadsDirectory));

app.use((_request, response) => {
  response.status(404).json({ error: "Endpoint tidak ditemukan" });
});

app.use((error, _request, response, _next) => {
  console.error("Error middleware:", error);
  const isUploadError = error?.name === "MulterError" || /Thumbnail harus|File utama harus|Avatar harus|Field unggahan/.test(error?.message || "");
  response.status(isUploadError ? 400 : 500).json({
    error: isUploadError ? "Unggahan tidak valid" : "Terjadi kegagalan pada sistem (Middleware)",
    detail: error.message || error,
  });
});

const startServer = async () => {
  try {
    if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET wajib tersedia");
    if (process.env.JWT_SECRET.length < 32) {
      if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET produksi wajib minimal 32 karakter");
      console.warn("JWT_SECRET lokal lebih pendek dari rekomendasi 32 karakter. Gunakan secret kuat sebelum deploy produksi.");
    }

    await runMigrations();
    app.listen(PORT, () => {
      console.log(`KMS Backend berjalan di port ${PORT}`);
      console.log(`URL Akses: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Backend gagal memulai karena migrasi database gagal:", error);
    process.exit(1);
  }
};

startServer();
