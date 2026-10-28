const pool = require("../config/db");
const { hasPermission } = require("../services/permissionService");
const { loadMyTasks } = require("../services/myTasksService");

const getMyTasks = async (req, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    return res.json(await loadMyTasks(req, pool, hasPermission));
  } catch (error) {
    console.error("Error fetching my tasks:", error);
    return res.status(500).json({ error: "Tugas belum dapat dimuat. Silakan coba lagi." });
  }
};

module.exports = { getMyTasks };
