const express = require("express");
const {
  getHomepageAssets,
  getFeaturedAssets,
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
const {
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllWorkUnits,
  createWorkUnit,
  updateWorkUnit,
  deleteWorkUnit,
} = require("../controllers/masterDataController");
const { getSearchSuggestions, trackSearchEvent } = require("../controllers/discoveryController");
const {
  getAssetComments,
  createComment,
  updateComment,
  deleteComment,
  getOwnedAssetComments,
  moderateOwnedAssetComment,
} = require("../controllers/commentController");
const { assetUpload } = require("../middleware/upload");
const { validateUploadSignature } = require("../middleware/validateUploadSignature");
const { verifyToken, optionalToken, requireAdmin, requireAssetWrite, requireBackoffice, requireCommenter, requirePegawai } = require("../middleware/authMiddleware");
const { writeLimiter, publicEventLimiter } = require("../middleware/security");
const { invalidateResponseCache, responseCache } = require("../middleware/responseCache");

const router = express.Router();
const assetWritePipeline = [
  writeLimiter,
  verifyToken,
  requireAssetWrite,
  assetUpload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  validateUploadSignature,
  invalidateResponseCache,
];

// 1. SEMUA RUTE STATIS HARUS DI ATAS
router.get("/homepage", responseCache({ ttlMs: 15_000 }), getHomepageAssets);
router.get("/featured", responseCache({ ttlMs: 30_000 }), getFeaturedAssets);
router.get("/search/suggestions", responseCache({ ttlMs: 15_000 }), getSearchSuggestions);
router.post("/search-events", publicEventLimiter, optionalToken, trackSearchEvent);
router.get("/admin", verifyToken, requireBackoffice, responseCache({ ttlMs: 10_000, privateCache: true }), getAdminAssets);
router.get("/admin/dashboard", verifyToken, requireBackoffice, responseCache({ ttlMs: 15_000, privateCache: true }), getAdminDashboard);
router.get("/admin/dashboard/rankings", verifyToken, requireBackoffice, responseCache({ ttlMs: 20_000, privateCache: true }), getAdminDashboardRanking);
router.get("/admin/comments", verifyToken, requirePegawai, getOwnedAssetComments);
router.get("/admin/recovery", verifyToken, requireAdmin, responseCache({ ttlMs: 10_000, privateCache: true }), getDeletedAssets);
router.patch("/admin/recovery", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, restoreAssetsBulk);
router.delete("/admin/recovery", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, permanentlyDeleteAssets);
router.patch("/admin/recovery/:id", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, restoreAsset);
router.get("/admin/:id/detail", verifyToken, requireBackoffice, getAdminAssetDetail);
router.get("/admin/:id", verifyToken, requireBackoffice, getAdminAssetById);
router.delete("/admin/:id/comments/:commentId", writeLimiter, verifyToken, requireAssetWrite, moderateOwnedAssetComment);

// Rute Categories
router.get("/categories", responseCache({ ttlMs: 60_000 }), getAllCategories);
router.post("/categories/", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, createCategory);
router.put("/categories/:id", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, updateCategory);
router.delete("/categories/:id", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, deleteCategory);

// Rute Work Units
router.get("/work-units", responseCache({ ttlMs: 60_000 }), getAllWorkUnits);
router.post("/work-units", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, createWorkUnit);
router.put("/work-units/:id", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, updateWorkUnit);
router.delete("/work-units/:id", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, deleteWorkUnit);

// 2. RUTE DINAMIS (Jaring Penangkap :id) HARUS DI BAWAH
router.get("/:id/related", responseCache({ ttlMs: 15_000 }), getRelatedAssets);
router.post("/:id/view", publicEventLimiter, incrementAssetView);
router.post("/:id/share", publicEventLimiter, optionalToken, trackAssetShare);
router.get("/:id/comments", getAssetComments);
router.post("/:id/comments", writeLimiter, verifyToken, requireCommenter, createComment);
router.patch("/:id/comments/:commentId", writeLimiter, verifyToken, requireCommenter, updateComment);
router.delete("/:id/comments/:commentId", writeLimiter, verifyToken, requireCommenter, deleteComment);
router.patch("/:id/undo-delete", writeLimiter, verifyToken, requireAssetWrite, invalidateResponseCache, restoreAsset);
router.get("/:id", responseCache({ ttlMs: 15_000 }), getAssetById);

router.post("/", ...assetWritePipeline, createAsset);
router.post("/drafts", ...assetWritePipeline, createDraft);
router.patch("/:id/draft", ...assetWritePipeline, updateDraft);
router.put("/:id", ...assetWritePipeline, updateAsset);

router.delete("/:id", writeLimiter, verifyToken, requireAssetWrite, invalidateResponseCache, deleteAsset);

module.exports = router;
