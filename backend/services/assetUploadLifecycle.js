const fs = require("node:fs/promises");
const path = require("node:path");
const { uploadsDirectory } = require("../config/storage");

const committedNames = Symbol("committedAssetUploadNames");
const commitAssetUploads = (req, asset) => {
  // Call only after the database transaction commits, before audit/response work.
  req[committedNames] = new Set([asset?.file_url, asset?.thumbnail_url].filter(Boolean));
};

const discardUncommittedAssetUploads = async (req) => {
  const root = path.resolve(uploadsDirectory);
  for (const file of Object.values(req.files || {}).flat()) {
    if (!file?.filename || req[committedNames]?.has(file.filename)) continue;
    const target = path.resolve(root, file.filename);
    // Only this request's Multer-generated direct-child paths may be removed.
    if (path.basename(file.filename) !== file.filename || path.dirname(target) !== root
      || !file.path || path.resolve(file.path) !== target) continue;
    try { await fs.unlink(target); }
    catch (error) {
      if (error.code !== "ENOENT") console.error("Asset upload cleanup failed:", error.code);
    }
  }
};

const withAssetUploadCleanup = (handler) => async (req, res, next) => {
  try { return await handler(req, res, next); }
  finally {
    // A disconnected browser does not imply its transaction failed: wait for it.
    await discardUncommittedAssetUploads(req);
  }
};

module.exports = { commitAssetUploads, discardUncommittedAssetUploads, withAssetUploadCleanup };
