# KMS Kemenhub

Knowledge Management System untuk menghimpun, menemukan, dan membagikan pengetahuan Kementerian Perhubungan. Workspace ini berisi frontend React/Vite dan backend Express/PostgreSQL.

## Menjalankan proyek

1. Salin `backend/.env.example` menjadi `backend/.env`, lalu isi koneksi PostgreSQL dan JWT secret.
2. Salin `frontend/.env.example` menjadi `frontend/.env` bila URL API tidak menggunakan nilai lokal bawaan.
3. Jalankan `npm install` pada folder `backend` dan `frontend`.
4. Jalankan `npm run migrate` pada folder `backend`, lalu mulai API dengan `npm run dev`.
5. Mulai frontend dengan `npm run dev` pada folder `frontend`.

## Perintah penting

- `backend/npm run migrate`: menerapkan migrasi idempoten.
- `backend/npm run seed`: menambahkan data contoh tanpa duplikasi.
- `backend/npm run reindex-search`: mengekstrak ulang teks PDF.
- `backend/npm run uploads:audit`: melaporkan unggahan lokal yang tidak dirujuk database.
- `backend/npm run uploads:clean`: menghapus permanen file yatim yang ditemukan audit.
- `frontend/npm run lint` dan `frontend/npm run build`: validasi kualitas dan build produksi.

Folder `backend/uploads` menyimpan media lokal dan tidak dilacak Git. Jalankan audit terlebih dahulu sebelum memakai perintah pembersihan permanen.
