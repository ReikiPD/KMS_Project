const express = require("express");
const {
  createAnnouncement,
  deleteAnnouncement,
  getAdminAnnouncements,
  getAnnouncementAssetOptions,
  getPublicAnnouncements,
  updateAnnouncement,
} = require("../controllers/announcementController");
const { ensureUploadCapacity } = require("../config/storage");
const { requirePermission, verifyToken } = require("../middleware/authMiddleware");
const { invalidateResponseCache, responseCache } = require("../middleware/responseCache");
const { writeLimiter } = require("../middleware/security");
const { announcementUpload } = require("../middleware/upload");
const { validateUploadSignature } = require("../middleware/validateUploadSignature");

const router = express.Router();
const adminUpload = (action) => [
  writeLimiter,
  verifyToken,
  requirePermission("announcements", action),
  ensureUploadCapacity,
  announcementUpload.single("image"),
  validateUploadSignature,
  invalidateResponseCache,
];

router.get("/", responseCache({ ttlMs: 30_000 }), getPublicAnnouncements);
router.get("/admin", verifyToken, requirePermission("announcements", "view"), responseCache({ ttlMs: 10_000, privateCache: true }), getAdminAnnouncements);
router.get("/admin/assets", verifyToken, requirePermission("announcements", "view"), responseCache({ ttlMs: 30_000, privateCache: true }), getAnnouncementAssetOptions);
router.post("/", ...adminUpload("post"), createAnnouncement);
router.put("/:id", ...adminUpload("edit"), updateAnnouncement);
router.delete("/:id", writeLimiter, verifyToken, requirePermission("announcements", "delete"), invalidateResponseCache, deleteAnnouncement);

module.exports = router;
