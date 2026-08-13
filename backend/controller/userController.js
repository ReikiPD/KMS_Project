const pool = require("../database/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const registerUser = async (req, res) => {
  // Tambahkan role pada req.body
  const { full_name, email, password, department, role } = req.body;

  try {
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const query = `
      INSERT INTO users (full_name, email, password, department, role) 
      VALUES ($1, $2, $3, $4, $5) 
      RETURNING id, full_name, email, role;
    `;

    // Jika role tidak diisi dari frontend, default ke 'user'
    const finalRole = role === "pegawai" ? "pegawai" : "user";
    const { rows } = await pool.query(query, [
      full_name,
      email,
      hashedPassword,
      department,
      finalRole,
    ]);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("Error register:", error);
    res.status(500).json({ error: "Gagal mendaftarkan pengguna" });
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Cari pengguna berdasarkan email (pastikan belum di-soft delete)
    const userQuery =
      "SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL";
    const { rows } = await pool.query(userQuery, [email]);
    const user = rows[0];

    if (!user) {
      return res.status(404).json({ error: "Pengguna tidak ditemukan" });
    }

    // 2. Bandingkan password yang dikirim dengan hash di database
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Password salah" });
    }

    // 3. Jika cocok, buat JWT Token
    // Kita menyimpan ID dan department di dalam token (Payload)
    // Di dalam fungsi loginUser, cari bagian pembuatan token (jwt.sign) dan ubah menjadi:

    // 3. Jika cocok, buat JWT Token dengan menyertakan role
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        department: user.department,
        role: user.role, // <-- Tambahkan baris ini
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    // Kirim response beserta token
    res.json({
      message: "Login berhasil",
      token: token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      },
    });
  } catch (error) {
    console.error("Error login:", error);
    res.status(500).json({ error: "Terjadi kesalahan saat login" });
  }
};

module.exports = { registerUser, loginUser };
