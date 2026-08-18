const dotenv = require("dotenv");

dotenv.config({ quiet: true });

const frontendOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

module.exports = {
  frontendOrigins,
  port: Number(process.env.PORT) || 3000,
  admin: {
    // Prefiks KMS diprioritaskan agar konfigurasi Admin dapat dipisahkan
    // dari kredensial lama tanpa mengubah variabel deployment yang sudah ada.
    email: (process.env.KMS_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase(),
    passwordHash: process.env.KMS_ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD_HASH || "",
    fullName: (process.env.KMS_ADMIN_FULL_NAME || process.env.ADMIN_FULL_NAME || "Administrator KMS").trim(),
  },
};
