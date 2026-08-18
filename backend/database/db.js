const { Pool } = require("pg");
require("../config/env");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool
  .connect()
  .then((client) => {
    client.release();
    console.log("Terkoneksi ke PostgreSQL");
  })
  .catch((err) => console.error("Error koneksi database", err.stack));

module.exports = pool;
