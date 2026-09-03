const fs = require("fs/promises");
const path = require("path");
const pool = require("./db");
const { runSqlFile } = require("./runSqlFile");

const MIGRATION_FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;

const listMigrationFiles = async () => {
  const migrationsDirectory = path.join(__dirname, "migrations");
  const entries = await fs.readdir(migrationsDirectory, { withFileTypes: true });
  const migrations = entries
    .filter((entry) => entry.isFile() && MIGRATION_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));

  if (!migrations.length) throw new Error("Tidak ada file migrasi database yang ditemukan");
  return migrations;
};

const runMigrations = async () => {
  const migrations = await listMigrationFiles();
  for (const migration of migrations) {
    await runSqlFile(path.join("migrations", migration));
  }
  console.log(`Migrasi database KMS selesai (${migrations.length} file).`);
};

if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error("Migrasi database gagal:", error);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { listMigrationFiles, runMigrations };
