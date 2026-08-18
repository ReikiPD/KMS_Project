const pool = require("./db");
const { runSqlFile } = require("./runSqlFile");

const runMigrations = async () => {
  const migrations = [
    "migrations/001_add_featured_assets.sql",
    "migrations/002_add_comment_indexes.sql",
    "migrations/003_create_notifications.sql",
    "migrations/004_add_asset_view_events.sql",
    "migrations/005_discovery_security_foundation.sql",
    "migrations/006_remove_video_transcript.sql",
    "migrations/007_roles_content_cleanup.sql",
  ];
  for (const migration of migrations) {
    await runSqlFile(migration);
  }
  console.log("Migrasi database KMS selesai.");
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

module.exports = { runMigrations };
