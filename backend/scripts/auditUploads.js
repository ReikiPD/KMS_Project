const fs = require("fs/promises");
const path = require("path");
const pool = require("../database/db");
const { uploadsDirectory } = require("../config/storage");

const shouldDelete = process.argv.includes("--delete");

const localFileName = (value) => {
  if (!value || typeof value !== "string" || /^https?:\/\//i.test(value)) return null;
  const name = path.basename(value.split(/[?#]/, 1)[0].replace(/\\/g, "/"));
  return name && name !== "." && path.extname(name) ? name : null;
};

const getReferencedFiles = async () => {
  const [assets, users, announcements] = await Promise.all([
    pool.query("SELECT file_url, thumbnail_url FROM knowledge_assets"),
    pool.query("SELECT avatar_url FROM users"),
    pool.query("SELECT image_url FROM announcements"),
  ]);

  const references = new Set();
  for (const asset of assets.rows) {
    [asset.file_url, asset.thumbnail_url].map(localFileName).filter(Boolean).forEach((name) => references.add(name));
  }
  for (const user of users.rows) {
    const name = localFileName(user.avatar_url);
    if (name) references.add(name);
  }
  for (const announcement of announcements.rows) {
    const name = localFileName(announcement.image_url);
    if (name) references.add(name);
  }
  return references;
};

const run = async () => {
  const referencedFiles = await getReferencedFiles();
  const entries = await fs.readdir(uploadsDirectory, { withFileTypes: true });
  const existingFiles = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const orphanFiles = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith(".") && !referencedFiles.has(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  console.log(`Referensi lokal database: ${referencedFiles.size}`);
  const missingReferencedFiles = [...referencedFiles].filter((fileName) => !existingFiles.has(fileName));
  console.log(`Referensi database tanpa file: ${missingReferencedFiles.length}`);
  missingReferencedFiles.forEach((fileName) => console.log(`! Hilang: ${fileName}`));
  console.log(`File yatim ditemukan: ${orphanFiles.length}`);
  orphanFiles.forEach((fileName) => console.log(`- ${fileName}`));

  if (!shouldDelete) {
    console.log("Mode laporan. Jalankan npm run uploads:clean untuk menghapus file yatim secara permanen.");
    return;
  }

  if (missingReferencedFiles.length > 0) {
    throw new Error("Ada referensi database yang kehilangan file; pembersihan dibatalkan.");
  }

  for (const fileName of orphanFiles) {
    const filePath = path.resolve(uploadsDirectory, fileName);
    if (path.dirname(filePath) !== uploadsDirectory) throw new Error(`Target unggahan tidak valid: ${fileName}`);
    await fs.unlink(filePath);
    console.log(`Dihapus: ${fileName}`);
  }
  console.log(`Pembersihan selesai: ${orphanFiles.length} file dihapus.`);
};

run()
  .catch((error) => {
    console.error("Audit unggahan gagal; tidak ada file yang dihapus:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
