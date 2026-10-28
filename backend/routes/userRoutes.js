const express = require("express");
const { registerUser, loginUser, getCurrentSession, logout, getProfile, updateProfile, updateAvatar, updatePassword, getStaff, getStaffWorkUnits, createStaff, updateStaffRole, deleteStaff, getAuditLogs, getActivityTargets } = require("../controllers/userController");
const { createAccessRole, getAccessRoles, getRolePermissions, previewRolePermissions, reviewRolePermissions, updateAccessRole, updateRolePermissions } = require("../controllers/permissionController");
const { getNotifications, markNotificationRead, markAllNotificationsRead } = require("../controllers/notificationController");
const { getSystemHealth } = require("../controllers/systemController");
const { getMyTasks } = require("../controllers/myTasksController");
const { verifyToken, optionalToken, requireBackoffice, requireAdminWorkspace, requirePermission, requirePersistentUser, getStaffAccessContext } = require("../middleware/authMiddleware");
const { avatarUpload } = require("../middleware/upload");
const { validateUploadSignature } = require("../middleware/validateUploadSignature");
const { authLimiter, loginLimiter, writeLimiter } = require("../middleware/security");
const { invalidateResponseCache } = require("../middleware/responseCache");
const { ensureUploadCapacity } = require("../config/storage");

const router = express.Router();

router.post("/register", authLimiter, registerUser);
router.post("/login", loginLimiter, loginUser);
router.get("/session", optionalToken, getCurrentSession);
router.post("/logout", writeLimiter, logout);
router.get("/my-tasks", verifyToken, requireBackoffice, requirePermission("my_tasks", "view"), getMyTasks);

router.get("/profile", verifyToken, requirePersistentUser, requirePermission("profile", "view"), getProfile);
router.patch("/profile", writeLimiter, verifyToken, requirePersistentUser, requirePermission("profile", "edit"), invalidateResponseCache, updateProfile);
router.patch("/profile/avatar", writeLimiter, verifyToken, requirePersistentUser, requirePermission("profile", "edit"), ensureUploadCapacity, avatarUpload.single("avatar"), validateUploadSignature, updateAvatar);
router.patch("/profile/password", writeLimiter, verifyToken, requirePersistentUser, requirePermission("profile", "edit"), updatePassword);

router.get("/audit-logs", verifyToken, requirePermission("activity", "view"), getAuditLogs);
router.get("/activity-targets", verifyToken, requirePermission("activity", "view"), getActivityTargets);
router.get("/admin/system-health", verifyToken, requireAdminWorkspace, getSystemHealth);

router.get("/staff", verifyToken, requirePermission("staff_management", "view"), getStaff);
router.get("/staff/context", verifyToken, getStaffAccessContext);
router.get("/staff-work-units", verifyToken, requirePermission("staff_management", "view"), getStaffWorkUnits);
router.get("/roles", verifyToken, requirePermission("staff_management", "view"), getAccessRoles);
router.post("/staff", writeLimiter, verifyToken, requirePermission("staff_management", "view"), requirePermission("staff_management", "edit"), invalidateResponseCache, createStaff);
router.patch("/staff/:id/role", writeLimiter, verifyToken, requirePermission("staff_management", "view"), requirePermission("staff_management", "edit"), invalidateResponseCache, updateStaffRole);
router.delete("/staff/:id", writeLimiter, verifyToken, requirePermission("staff_management", "view"), requirePermission("staff_management", "delete"), invalidateResponseCache, deleteStaff);

router.get("/role-permissions", verifyToken, requirePermission("role_permissions", "view"), getRolePermissions);
router.post("/roles", writeLimiter, verifyToken, requirePermission("role_permissions", "post"), invalidateResponseCache, createAccessRole);
router.put("/roles/:role", writeLimiter, verifyToken, requirePermission("role_permissions", "edit"), invalidateResponseCache, updateAccessRole);
router.post("/role-permissions/:role/preview", writeLimiter, verifyToken, requirePermission("role_permissions", "edit"), previewRolePermissions);
router.patch("/role-permissions/:role/review", writeLimiter, verifyToken, requirePermission("role_permissions", "edit"), invalidateResponseCache, reviewRolePermissions);
router.put("/role-permissions/:role", writeLimiter, verifyToken, requirePermission("role_permissions", "edit"), invalidateResponseCache, updateRolePermissions);

router.get("/notifications", verifyToken, requirePersistentUser, getNotifications);
router.patch("/notifications/read-all", writeLimiter, verifyToken, requirePersistentUser, markAllNotificationsRead);
router.patch("/notifications/:id/read", writeLimiter, verifyToken, requirePersistentUser, markNotificationRead);

module.exports = router;
