const { Pool } = require("pg");
const { database } = require("../config/env");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: database.maxConnections,
  idleTimeoutMillis: database.idleTimeoutMs,
  connectionTimeoutMillis: database.connectionTimeoutMs,
  statement_timeout: database.statementTimeoutMs,
  application_name: "kms-kemenhub-api",
});

pool
  .connect()
  .then((client) => {
    client.release();
    console.log("Terkoneksi ke PostgreSQL");
  })
  .catch((err) => console.error("Error koneksi database", err.stack));

pool.on("error", (error) => {
  console.error("Koneksi PostgreSQL idle mengalami error:", error.message);
});

module.exports = pool;
