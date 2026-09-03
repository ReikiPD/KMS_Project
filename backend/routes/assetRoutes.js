const express = require("express");
const {
  getHomepageAssets,
  getFeaturedAssets,
  updateFeaturedStatus,
  getAdminAssets,
  getDeletedAssets,
  restoreAsset,
  restoreAssetsBulk,
  permanentlyDeleteAssets,
  getAdminDashboard,
  getAdminDashboardRanking,
  getAdminAssetDetail,
  getAssetById,
  incrementAssetView,
  trackAssetShare,
  getRelatedAssets,
  getAdminAssetById,
  createDraft,
  updateDraft,
  createAsset,
  updateAsset,
  deleteAsset,
} = require("../controllers/assetController");
const { getPublicationReviews, reviewPublication } = require("../controllers/publicationReviewController");
const {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllWorkUnits,
  getBackofficeWorkUnits,
  getWorkUnitAnalyticsScope,
  getWorkUnitAnalytics,
  createWorkUnit,
  reorderWorkUnits,
  updateWorkUnit,
  updateWorkUnitVisibility,
  deleteWorkUnit,
} = require("../controllers/masterDataController");
const { getSearchSuggestions, trackSearchEvent } = require("../controllers/discoveryController");
const { getMedia } = require("../controllers/mediaController");
const {
  getAssetComments,
  createComment,
  updateComment,
  deleteComment,
  getOwnedAssetComments,
  moderateOwnedAssetComment,
} = require("../controllers/commentController");
const { assetUpload } = require("../middleware/upload");
const { ensureUploadCapacity } = require("../config/storage");
const { validateUploadSignature } = require("../middleware/validateUploadSignature");
const { optimizeAssetUpload } = require("../middleware/optimizeUpload");
const { verifyToken, optionalToken, requireBackoffice, requirePermission, requireCommenter, requirePegawai } = require("../middleware/authMiddleware");
const { writeLimiter, publicEventLimiter } = require("../middleware/security");
const { invalidateResponseCache, responseCache } = require("../middleware/responseCache");

const router = express.Router();
const assetWritePipeline = (action) => [
  writeLimiter,
  verifyToken,
  requirePermission("assets", action),
  ensureUploadCapacity,
  assetUpload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  validateUploadSignature,
  optimizeAssetUpload,
  invalidateResponseCache,
];

// 1. SEMUA RUTE STATIS HARUS DI ATAS
router.get("/homepage", responseCache({ ttlMs: 15_000 }), getHomepageAssets);
router.get("/featured", responseCache({ ttlMs: 30_000 }), getFeaturedAssets);
router.get("/search/suggestions", responseCache({ ttlMs: 15_000 }), getSearchSuggestions);
router.post("/search-events", publicEventLimiter, optionalToken, trackSearchEvent);
router.get("/media/:fileName", getMedia);
router.get("/admin", verifyToken, requirePermission("assets", "view"), responseCache({ ttlMs: 10_000, privateCache: true }), getAdminAssets);
router.get("/admin/dashboard", verifyToken, requirePermission("dashboard", "view"), responseCache({ ttlMs: 15_000, privateCache: true }), getAdminDashboard);
router.get("/admin/dashboard/rankings", verifyToken, requirePermission("dashboard", "view"), responseCache({ ttlMs: 20_000, privateCache: true }), getAdminDashboardRanking);
router.get("/admin/comments", verifyToken, requirePegawai, requirePermission("activity", "view"), getOwnedAssetComments);
router.get("/admin/recovery", verifyToken, requirePermission("asset_recovery", "view"), responseCache({ ttlMs: 10_000, privateCache: true }), getDeletedAssets);
router.get("/admin/publication-reviews", verifyToken, requirePermission("asset_verification", "view"), getPublicationReviews);
router.patch("/admin/publication-reviews/:id", writeLimiter, verifyToken, requirePermission("asset_verification", "view"), requirePermission("asset_verification", "edit"), invalidateResponseCache, reviewPublication);
router.patch("/admin/recovery", writeLimiter, verifyToken, requirePermission("asset_recovery", "edit"), invalidateResponseCache, restoreAssetsBulk);
router.delete("/admin/recovery", writeLimiter, verifyToken, requirePermission("asset_recovery", "delete"), invalidateResponseCache, permanentlyDeleteAssets);
router.patch("/admin/recovery/:id", writeLimiter, verifyToken, requirePermission("asset_recovery", "edit"), invalidateResponseCache, restoreAsset);
router.patch("/admin/:id/featured", writeLimiter, verifyToken, requirePermission("assets", "edit"), invalidateResponseCache, updateFeaturedStatus);
router.get("/admin/:id/detail", verifyToken, requirePermission("assets", "view"), getAdminAssetDetail);
router.get("/admin/:id", verifyToken, requirePermission("assets", "view"), getAdminAssetById);
router.delete("/admin/:id/comments/:commentId", writeLimiter, verifyToken, requirePermission("assets", "delete"), moderateOwnedAssetComment);

// Rute Categories
router.get("/categories", responseCache({ ttlMs: 60_000 }), getAllCategories);
router.post("/categories/", writeLimiter, verifyToken, requirePermission("categories", "post"), invalidateResponseCache, createCategory);
router.put("/categories/:id", writeLimiter, verifyToken, requirePermission("categories", "edit"), invalidateResponseCache, updateCategory);
router.delete("/categories/:id", writeLimiter, verifyToken, requirePermission("categories", "delete"), invalidateResponseCache, deleteCategory);

// Rute Work Units
router.get("/work-units", responseCache({ ttlMs: 60_000 }), getAllWorkUnits);
router.get("/work-units/backoffice", verifyToken, requireBackoffice, requirePermission("work_units", "view"), responseCache({ ttlMs: 60_000, privateCache: true }), getBackofficeWorkUnits);
router.get("/work-units/analytics/scope", verifyToken, requireBackoffice, responseCache({ ttlMs: 20_000, privateCache: true }), getWorkUnitAnalyticsScope);
router.get("/work-units/:identifier/analytics", verifyToken, requireBackoffice, responseCache({ ttlMs: 20_000, privateCache: true }), getWorkUnitAnalytics);
router.post("/work-units", writeLimiter, verifyToken, requirePermission("work_units", "post"), invalidateResponseCache, createWorkUnit);
router.put("/work-units/reorder", writeLimiter, verifyToken, requirePermission("work_units", "edit"), invalidateResponseCache, reorderWorkUnits);
router.put("/work-units/:id", writeLimiter, verifyToken, requirePermission("work_units", "edit"), invalidateResponseCache, updateWorkUnit);
router.patch("/work-units/:id/visibility", writeLimiter, verifyToken, requirePermission("work_units", "edit"), invalidateResponseCache, updateWorkUnitVisibility);
router.delete("/work-units/:id", writeLimiter, verifyToken, requirePermission("work_units", "delete"), invalidateResponseCache, deleteWorkUnit);

// 2. RUTE DINAMIS (Jaring Penangkap :id) HARUS DI BAWAH
router.get("/:id/related", responseCache({ ttlMs: 15_000 }), getRelatedAssets);
router.post("/:id/view", publicEventLimiter, incrementAssetView);
router.post("/:id/share", publicEventLimiter, optionalToken, trackAssetShare);
router.get("/:id/comments", getAssetComments);
router.post("/:id/comments", writeLimiter, verifyToken, requireCommenter, createComment);
router.patch("/:id/comments/:commentId", writeLimiter, verifyToken, requireCommenter, updateComment);
router.delete("/:id/comments/:commentId", writeLimiter, verifyToken, requireCommenter, deleteComment);
router.patch("/:id/undo-delete", writeLimiter, verifyToken, requirePermission("assets", "edit"), invalidateResponseCache, restoreAsset);
router.get("/:id", responseCache({ ttlMs: 15_000 }), getAssetById);

router.post("/", ...assetWritePipeline("post"), createAsset);
router.post("/drafts", ...assetWritePipeline("post"), createDraft);
router.patch("/:id/draft", ...assetWritePipeline("edit"), updateDraft);
router.put("/:id", ...assetWritePipeline("edit"), updateAsset);

router.delete("/:id", writeLimiter, verifyToken, requirePermission("assets", "delete"), invalidateResponseCache, deleteAsset);

module.exports = router;
