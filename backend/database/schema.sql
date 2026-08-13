-- 1. Tabel Pengguna (Penulis/Pegawai)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    department VARCHAR(100), 
    avatar_url TEXT,         
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL -- Kolom penanda Soft Delete
);

-- 2. Tabel Kategori 
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL, 
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL -- Kolom penanda Soft Delete
);

-- 3. Tabel Aset Pengetahuan (Artikel/Video/PDF)
CREATE TABLE knowledge_assets (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    
    -- Penambahan tipe aset dan link file
    asset_type VARCHAR(50) NOT NULL DEFAULT 'article', -- Contoh isi: 'article', 'pdf', 'video'
    file_url TEXT,           -- URL dokumen PDF atau link Video (misal YouTube/Cloud Storage)
    
    summary TEXT,            
    content TEXT,            -- Dibuat opsional (tidak ada NOT NULL) karena PDF/Video mungkin tidak ada teks artikelnya
    thumbnail_url TEXT,      
    
    view_count INTEGER DEFAULT 0, 
    is_published BOOLEAN DEFAULT false, 
    
    author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL -- Kolom penanda Soft Delete
);

-- 4. Tabel Komentar
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    
    -- Relasi ke aset pengetahuan (artikel/video/pdf)
    -- Jika menggunakan CASCADE, komentar terhapus permanen jika asetnya dihapus permanen.
    asset_id INTEGER NOT NULL REFERENCES knowledge_assets(id) ON DELETE CASCADE,
    
    -- Relasi ke pengguna (siapa yang berkomentar)
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    
    -- Isi komentar
    content TEXT NOT NULL,
    
    -- (Opsional) Jika Anda ingin mendukung fitur "Balas Komentar" / Nested Comments di MVP ini
    parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE DEFAULT NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP DEFAULT NULL -- Kolom penanda Soft Delete
);

