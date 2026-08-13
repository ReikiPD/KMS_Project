const express = require("express");
const { registerUser, loginUser } = require("../controller/userController");

const router = express.Router();

// Endpoint untuk mendaftarkan akun baru
// URL: POST http://localhost:3000/api/users/register
router.post("/register", registerUser);

// Endpoint untuk masuk (login) dan mendapatkan token JWT
// URL: POST http://localhost:3000/api/users/login
router.post("/login", loginUser);

module.exports = router;
