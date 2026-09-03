const { optimizeUploadedMedia } = require("../services/mediaOptimizationService");

const optimizeAssetUpload = async (req, _res, next) => {
  const file = req.files?.file?.[0];
  if (!file) return next();
  try {
    req.mediaOptimization = await optimizeUploadedMedia(file);
    if (req.mediaOptimization.error) {
      console.warn("Media optimization skipped:", req.mediaOptimization.error);
    }
    return next();
  } catch (error) {
    console.warn("Media optimization failed safely:", error.message);
    req.mediaOptimization = { optimized: false, reason: "unexpected_error" };
    return next();
  }
};

module.exports = { optimizeAssetUpload };
