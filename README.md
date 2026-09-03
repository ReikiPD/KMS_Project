# KMS Kemenhub

## Struktur inti

- `frontend/src/app`: halaman per rute; halaman dimuat secara lazy agar bundle awal tetap ringan.
- `frontend/src/components`: komponen antarmuka yang dapat dipakai ulang.
- `frontend/src/lib`: akses API, pemetaan form, validasi, pencarian, dan format tanggal bersama.
- `frontend/src/hooks`: perilaku state yang dipakai lintas halaman, seperti autosave dan peringatan perubahan.
- `backend/controllers`: logika per domain; data master dipisahkan dari pengelolaan aset.
- `backend/routes`: kontrak endpoint dan susunan middleware autentikasi/unggahan.
- `backend/database`: skema bersih, migrasi, dan seed idempoten.

Gunakan helper yang sudah tersedia sebelum menambah implementasi baru. Akses HTTP frontend dipusatkan di `frontend/src/lib/api.js`, sedangkan bentuk data form aset dipusatkan di `frontend/src/lib/assetForm.js`.

Knowledge Management System untuk menghimpun, menemukan, dan membagikan pengetahuan Kementerian Perhubungan. Workspace ini berisi frontend React/Vite dan backend Express/PostgreSQL.

## Menjalankan proyek

1. Salin `backend/.env.example` menjadi `backend/.env`, lalu isi koneksi PostgreSQL dan secret CSRF.
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
- `backend/npm run assets:purge-expired`: menghapus permanen aset yang sudah berada di tempat sampah lebih dari satu bulan. Produksi menjalankannya melalui timer systemd harian.
- `frontend/npm run lint` dan `frontend/npm run build`: validasi kualitas dan build produksi.

Folder `backend/uploads` menyimpan media lokal dan tidak dilacak Git. Jalankan audit terlebih dahulu sebelum memakai perintah pembersihan permanen.

## Konfigurasi produksi

1. Jalankan `npm run migrate` sebagai langkah deployment terpisah sebelum backend dimulai.
2. Gunakan `NODE_ENV=production`, `RUN_MIGRATIONS_ON_START=false`, dan `HTTP_LOGGING=false` pada server produksi.
3. Sesuaikan `DATABASE_POOL_MAX` dengan kapasitas PostgreSQL. Nilai awal `10` cocok untuk satu proses API; jumlah seluruh pool dari semua proses tidak boleh mendekati batas koneksi PostgreSQL.
4. Production wajib mengatur `UPLOAD_DIR` ke path absolut di luar source code, misalnya `/var/lib/kms/uploads`. Path tersebut dapat menjadi mount File Server dan harus ikut dicadangkan.
5. Jalankan backend di belakang reverse proxy. Contoh Nginx tersedia pada `deploy/nginx.kms.conf.example`; konfigurasi tersebut mengompresi JSON/CSS/JavaScript dan melayani unggahan langsung tanpa membebani proses Node.js.
6. Jalankan frontend hasil `npm run build` dari folder `frontend/dist`; jangan menjalankan development server Vite di produksi.
7. Gunakan sesi opaque pada cookie aman; production tidak menerima bearer token dan tidak menyimpan token di `localStorage`.
8. Ikuti urutan lengkap pada `deploy/PRODUCTION-RUNBOOK.md`, termasuk TLS, role database, systemd, Nginx, firewall, backup terenkripsi, preflight, dan rollback.

Hak akses backoffice disimpan pada `role_permissions` dan diperiksa ulang oleh backend pada setiap permintaan. Admin database dapat berjumlah lebih dari satu, sedangkan Admin environment tetap menjadi akses darurat dengan hak penuh. Perubahan matriks role tidak memerlukan restart aplikasi.

Endpoint publik menggunakan cache singkat dan endpoint backoffice menggunakan cache terisolasi per akun. Setiap perubahan aset/data master akan membersihkan cache terkait secara otomatis.
