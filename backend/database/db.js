const { Pool } = require("pg");
require("dotenv").config(); // Pastikan dotenv dipanggil

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool
  .connect()
  .then(() => console.log("Terkoneksi ke PostgreSQL"))
  .catch((err) => console.error("Error koneksi database", err.stack));

module.exports = pool;
