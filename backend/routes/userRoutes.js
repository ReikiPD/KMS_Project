const express = require("express");
const { registerUser, loginUser, getCurrentSession, logout, getProfile, updateProfile, updateAvatar, updatePassword, getStaff, getStaffWorkUnits, createStaff, updateStaffRole, deleteStaff, getAuditLogs, getActivityTargets } = require("../controllers/userController");
const { createAccessRole, getAccessRoles, getRolePermissions, updateAccessRole, updateRolePermissions } = require("../controllers/permissionController");
const { getNotifications, markNotificationRead, markAllNotificationsRead } = require("../controllers/notificationController");
const { getSystemHealth } = require("../controllers/systemController");
const { verifyToken, optionalToken, requireAdminWorkspace, requirePermission, requirePersistentUser } = require("../middleware/authMiddleware");
const { avatarUpload } = require("../middleware/upload");
const { validateUploadSignature } = require("../middleware/validateUploadSignature");
const { authLimiter, writeLimiter } = require("../middleware/security");
const { invalidateResponseCache } = require("../middleware/responseCache");
const { ensureUploadCapacity } = require("../config/storage");

const router = express.Router();

router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.get("/session", optionalToken, getCurrentSession);
router.post("/logout", writeLimiter, logout);

router.get("/profile", verifyToken, requirePersistentUser, requirePermission("profile", "view"), getProfile);
router.patch("/profile", writeLimiter, verifyToken, requirePersistentUser, requirePermission("profile", "edit"), invalidateResponseCache, updateProfile);
router.patch("/profile/avatar", writeLimiter, verifyToken, requirePersistentUser, requirePermission("profile", "edit"), ensureUploadCapacity, avatarUpload.single("avatar"), validateUploadSignature, updateAvatar);
router.patch("/profile/password", writeLimiter, verifyToken, requirePersistentUser, requirePermission("profile", "edit"), updatePassword);

router.get("/audit-logs", verifyToken, requirePermission("activity", "view"), getAuditLogs);
router.get("/activity-targets", verifyToken, requirePermission("activity", "view"), getActivityTargets);
router.get("/admin/system-health", verifyToken, requireAdminWorkspace, getSystemHealth);

router.get("/staff", verifyToken, requirePermission("staff_management", "view"), getStaff);
router.get("/staff-work-units", verifyToken, requirePermission("staff_management", "view"), getStaffWorkUnits);
router.get("/roles", verifyToken, requirePermission("staff_management", "view"), getAccessRoles);
router.post("/staff", writeLimiter, verifyToken, requirePermission("staff_management", "post"), invalidateResponseCache, createStaff);
router.patch("/staff/:id/role", writeLimiter, verifyToken, requirePermission("staff_management", "edit"), invalidateResponseCache, updateStaffRole);
router.delete("/staff/:id", writeLimiter, verifyToken, requirePermission("staff_management", "delete"), invalidateResponseCache, deleteStaff);

router.get("/role-permissions", verifyToken, requirePermission("role_permissions", "view"), getRolePermissions);
router.post("/roles", writeLimiter, verifyToken, requirePermission("role_permissions", "post"), invalidateResponseCache, createAccessRole);
router.put("/roles/:role", writeLimiter, verifyToken, requirePermission("role_permissions", "edit"), invalidateResponseCache, updateAccessRole);
router.put("/role-permissions/:role", writeLimiter, verifyToken, requirePermission("role_permissions", "edit"), invalidateResponseCache, updateRolePermissions);

router.get("/notifications", verifyToken, requirePersistentUser, getNotifications);
router.patch("/notifications/read-all", writeLimiter, verifyToken, requirePersistentUser, markAllNotificationsRead);
router.patch("/notifications/:id/read", writeLimiter, verifyToken, requirePersistentUser, markNotificationRead);

module.exports = router;
