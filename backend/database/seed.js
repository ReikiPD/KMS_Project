const pool = require("./db");
const { runSqlFile } = require("./runSqlFile");

const runSeed = async () => {
  await runSqlFile("seed.sql");
  console.log("Seed contoh KMS Kemenhub selesai.");
};

if (require.main === module) {
  runSeed()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error("Seed database gagal:", error);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { runSeed };
