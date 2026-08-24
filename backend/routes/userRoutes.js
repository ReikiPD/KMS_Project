const express = require("express");
const { registerUser, loginUser, loginAdmin, getProfile, updateProfile, updateAvatar, updatePassword, getStaff, createStaff, deleteStaff, getAuditLogs, deleteAuditLogs } = require("../controllers/userController");
const { getNotifications, markNotificationRead, markAllNotificationsRead } = require("../controllers/notificationController");
const { verifyToken, requireAdmin, requireBackoffice, requirePegawai, requirePersistentUser } = require("../middleware/authMiddleware");
const { avatarUpload } = require("../middleware/upload");
const { validateUploadSignature } = require("../middleware/validateUploadSignature");
const { authLimiter, writeLimiter } = require("../middleware/security");
const { invalidateResponseCache } = require("../middleware/responseCache");

const router = express.Router();

router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/admin/login", authLimiter, loginAdmin);

router.get("/profile", verifyToken, requirePersistentUser, getProfile);
router.patch("/profile", writeLimiter, verifyToken, requirePersistentUser, invalidateResponseCache, updateProfile);
router.patch("/profile/avatar", writeLimiter, verifyToken, requirePersistentUser, avatarUpload.single("avatar"), validateUploadSignature, updateAvatar);
router.patch("/profile/password", writeLimiter, verifyToken, requirePersistentUser, updatePassword);

router.get("/audit-logs", verifyToken, requirePegawai, getAuditLogs);
router.delete("/audit-logs", writeLimiter, verifyToken, requirePegawai, deleteAuditLogs);

router.get("/staff", verifyToken, requireBackoffice, getStaff);
router.post("/staff", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, createStaff);
router.delete("/staff/:id", writeLimiter, verifyToken, requireAdmin, invalidateResponseCache, deleteStaff);

router.get("/notifications", verifyToken, requirePegawai, getNotifications);
router.patch("/notifications/read-all", writeLimiter, verifyToken, requirePegawai, markAllNotificationsRead);
router.patch("/notifications/:id/read", writeLimiter, verifyToken, requirePegawai, markNotificationRead);

module.exports = router;
