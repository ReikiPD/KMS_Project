const fs = require("fs/promises");
const path = require("path");
const pool = require("./db");

const runSqlFile = async (fileName) => {
  const filePath = path.join(__dirname, fileName);
  const sql = await fs.readFile(filePath, "utf8");
  await pool.query(sql);
};

module.exports = { runSqlFile };
