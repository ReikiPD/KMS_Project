require('dotenv').config(); // 1. Wajib di baris paling atas

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Import Routes
const userRoutes = require('./routes/userRoutes');
const assetRoutes = require('./routes/assetRoutes');

// Inisialisasi Express & Port
const app = express();
const PORT = process.env.PORT || 3000; // 2. Ambil PORT langsung dari .env

// --- Pengaturan Middleware Global ---
app.use(cors()); 
app.use(morgan('dev')); 
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));


// --- Pengaturan Routing ---
app.use('/api/users', userRoutes);
app.use('/api/assets', assetRoutes);


// --- Penanganan Route Tidak Ditemukan (404) ---
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

//  TAMBAHKAN KODE INI 
// --- Global Error Handler (Untuk menangkap error dari Middleware seperti Multer) ---
app.use((err, req, res, next) => {
  console.error(' Error dari Middleware:', err);
  
  res.status(500).json({
    error: 'Terjadi kegagalan pada sistem (Middleware)',
    detail: err.message || err // Menampilkan pesan asli dari Cloudinary
  });
});


// --- Menjalankan Server ---
app.listen(PORT, () => {
  console.log(`🚀 KMS Backend berjalan di port ${PORT}`);
  console.log(`URL Akses: http://localhost:${PORT}`);
});