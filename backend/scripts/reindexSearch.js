const pool = require("../database/db");
const { extractPdfText } = require("../services/mediaService");

const run = async () => {
  const { rows } = await pool.query(
    `SELECT id, file_url FROM knowledge_assets
     WHERE asset_type = 'document' AND file_url IS NOT NULL AND deleted_at IS NULL
     ORDER BY id ASC`,
  );
  let indexed = 0;
  for (const asset of rows) {
    const extractedText = await extractPdfText(asset.file_url);
    await pool.query(
      "UPDATE knowledge_assets SET extracted_text = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [extractedText, asset.id],
    );
    indexed += 1;
    console.log(`Reindeks ${indexed}/${rows.length}: aset ${asset.id}`);
  }
  console.log(`Reindeks selesai: ${indexed} dokumen diproses.`);
};

run().then(() => pool.end()).catch(async (error) => {
  console.error("Reindeks gagal:", error);
  await pool.end();
  process.exit(1);
});
