const express = require("express");
const {
  getHomepageAssets,
  getFeaturedAssets,
  getAdminAssets,
  getDeletedAssets,
  restoreAsset,
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
  getAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllWorkUnits,
  createWorkUnit,
  updateWorkUnit,
  deleteWorkUnit,
} = require("../controllers/assetController");
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

const router = express.Router();

// 1. SEMUA RUTE STATIS HARUS DI ATAS
router.get("/homepage", getHomepageAssets);
router.get("/featured", getFeaturedAssets);
router.get("/search/suggestions", getSearchSuggestions);
router.post("/search-events", publicEventLimiter, optionalToken, trackSearchEvent);
router.get("/admin", verifyToken, requireBackoffice, getAdminAssets);
router.get("/admin/dashboard", verifyToken, requireBackoffice, getAdminDashboard);
router.get("/admin/dashboard/rankings", verifyToken, requireBackoffice, getAdminDashboardRanking);
router.get("/admin/comments", verifyToken, requirePegawai, getOwnedAssetComments);
router.get("/admin/recovery", verifyToken, requireAdmin, getDeletedAssets);
router.patch("/admin/recovery/:id", writeLimiter, verifyToken, requireAdmin, restoreAsset);
router.get("/admin/:id/detail", verifyToken, requireBackoffice, getAdminAssetDetail);
router.get("/admin/:id", verifyToken, requireBackoffice, getAdminAssetById);
router.delete("/admin/:id/comments/:commentId", verifyToken, requireAssetWrite, moderateOwnedAssetComment);

// Rute Categories
router.get("/categories", getAllCategories);
router.post("/categories/", verifyToken, requireAdmin, createCategory);
router.put("/categories/:id", verifyToken, requireAdmin, updateCategory);
router.delete("/categories/:id", verifyToken, requireAdmin, deleteCategory);

// Rute Work Units
router.get("/work-units", getAllWorkUnits);
router.post("/work-units", verifyToken, requireAdmin, createWorkUnit);
router.put("/work-units/:id", verifyToken, requireAdmin, updateWorkUnit);
router.delete("/work-units/:id", verifyToken, requireAdmin, deleteWorkUnit);

// 2. RUTE DINAMIS (Jaring Penangkap :id) HARUS DI BAWAH
router.get("/:id/related", getRelatedAssets);
router.post("/:id/view", incrementAssetView);
router.post("/:id/share", publicEventLimiter, optionalToken, trackAssetShare);
router.get("/:id/comments", getAssetComments);
router.post("/:id/comments", verifyToken, requireCommenter, createComment);
router.patch("/:id/comments/:commentId", verifyToken, requireCommenter, updateComment);
router.delete("/:id/comments/:commentId", verifyToken, requireCommenter, deleteComment);
router.get("/:id", getAssetById);

router.post(
  "/",
  writeLimiter,
  verifyToken,
  requireAssetWrite,
  assetUpload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  validateUploadSignature,
  createAsset,
);

router.post(
  "/drafts",
  writeLimiter,
  verifyToken,
  requireAssetWrite,
  assetUpload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  validateUploadSignature,
  createDraft,
);

router.patch(
  "/:id/draft",
  writeLimiter,
  verifyToken,
  requireAssetWrite,
  assetUpload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  validateUploadSignature,
  updateDraft,
);

router.put(
  "/:id",
  writeLimiter,
  verifyToken,
  requireAssetWrite,
  assetUpload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  validateUploadSignature,
  updateAsset,
);

router.delete("/:id", verifyToken, requireAssetWrite, deleteAsset);

module.exports = router;
