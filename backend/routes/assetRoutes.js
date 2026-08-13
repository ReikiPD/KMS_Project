const express = require("express");
const {
  getHomepageAssets,
  getAdminAssets,
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
} = require("../controller/assetController");
const upload = require("../middleware/upload");
const { verifyToken, requirePegawai } = require("../middleware/authMiddleware"); // Import middleware JWT

const router = express.Router();
router.get("/homepage", getHomepageAssets);
router.get('/admin', verifyToken, requirePegawai, getAdminAssets);
router.post(
  "/",
  verifyToken,
  requirePegawai,
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  createAsset,
);

router.get("/categories", getAllCategories);
router.post("/categories/", verifyToken, requirePegawai, createCategory);
router.put("/categories/:id", verifyToken, requirePegawai, updateCategory);
router.delete("/categories/:id", verifyToken, requirePegawai, deleteCategory);
router.get("/work-units", getAllWorkUnits);
router.post("/work-units", verifyToken, requirePegawai, createWorkUnit);
router.put("/work-units/:id", verifyToken, requirePegawai, updateWorkUnit);
router.delete("/work-units/:id", verifyToken, requirePegawai, deleteWorkUnit);

module.exports = router;
