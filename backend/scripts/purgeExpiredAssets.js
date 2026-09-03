const pool = require("../database/db");
const { purgeExpiredAssets } = require("../services/assetRetentionService");

const main = async () => {
  let total = 0;
  while (true) {
    const result = await purgeExpiredAssets({ batchSize: 100 });
    total += result.count;
    if (result.fileCleanup.failed.length) {
      console.warn("Pembersihan beberapa file gagal:", result.fileCleanup.failed);
    }
    if (result.count < 100) break;
  }
  console.log(`${total} aset yang melewati masa pemulihan satu bulan dihapus permanen.`);
};

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error("Pembersihan aset kedaluwarsa gagal:", error);
    await pool.end().catch(() => undefined);
    process.exit(1);
  });
