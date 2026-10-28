// Stable entry point for existing routes and consumers.
const publicController = require("./assets/public");
const featuredController = require("./assets/featured");
const dashboardController = require("./assets/dashboard");
const recoveryController = require("./assets/recovery");
const managementController = require("./assets/management");

module.exports = {
  getHomepageAssets: publicController.getHomepageAssets,
  getFeaturedAssets: featuredController.getFeaturedAssets,
  getFeaturedSettings: featuredController.getFeaturedSettings,
  updateFeaturedSettings: featuredController.updateFeaturedSettings,
  previewFeaturedSettings: featuredController.previewFeaturedSettings,
  getFeaturedVisibility: featuredController.getFeaturedVisibility,
  updateFeaturedVisibility: featuredController.updateFeaturedVisibility,
  updateFeaturedStatus: featuredController.updateFeaturedStatus,
  getAdminAssets: managementController.getAdminAssets,
  getDeletedAssets: recoveryController.getDeletedAssets,
  restoreAsset: recoveryController.restoreAsset,
  restoreAssetsBulk: recoveryController.restoreAssetsBulk,
  permanentlyDeleteAssets: recoveryController.permanentlyDeleteAssets,
  getAdminDashboard: dashboardController.getAdminDashboard,
  getAdminDashboardRanking: dashboardController.getAdminDashboardRanking,
  getAdminAssetDetail: managementController.getAdminAssetDetail,
  getAssetById: publicController.getAssetById,
  incrementAssetView: publicController.incrementAssetView,
  trackAssetShare: publicController.trackAssetShare,
  getRelatedAssets: publicController.getRelatedAssets,
  getAdminAssetById: managementController.getAdminAssetById,
  createDraft: managementController.createDraft,
  updateDraft: managementController.updateDraft,
  createAsset: managementController.createAsset,
  updateAsset: managementController.updateAsset,
  deleteAsset: managementController.deleteAsset,
};
