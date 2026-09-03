# Runbook Produksi KMS Kemenhub

Dokumen ini adalah urutan deployment resmi untuk VM Ubuntu `192.168.55.108`.
Semua placeholder berawalan `__...__` wajib diganti. Jangan menyalin password,
private key, atau isi environment ke Git, tiket, chat, maupun riwayat shell.

## 0. Gerbang sebelum go-live

Jangan membuka login produksi sebelum seluruh item berikut tersedia:

- CIDR jaringan pengguna Kemenhub;
- CIDR/IP administrator untuk SSH;
- sertifikat CA internal dengan SAN DNS internal atau `IP:192.168.55.108`;
- CA tersebut dipercaya oleh seluruh perangkat pengguna;
- mount NAS backup yang hanya dapat ditulis service backup;
- satu sesi SSH kedua untuk menguji firewall sebelum sesi pertama ditutup.

Tanpa DNS, `https://192.168.55.108` dapat dipakai apabila IP tersebut tercantum pada
SAN sertifikat. Sertifikat self-signed yang memunculkan peringatan browser tidak layak
untuk go-live karena cookie `Secure` dan identitas server harus dipercaya pengguna.

## 1. Buat paket release di workstation

Jalankan dari PowerShell pada root proyek:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy\scripts\build-release.ps1 -Version 20260824-03
```

Script melakukan instalasi deterministik dari lockfile, lint, build frontend dengan
base URL kosong, pemeriksaan sintaks backend, pembuatan arsip, dan SHA-256. Hasilnya:

```text
deploy/artifacts/kms-release-20260824-03.tar.gz
deploy/artifacts/kms-release-20260824-03.sha256
```

Unggah kedua file melalui SFTP MobaXterm ke `/home/reiki/`. Jangan gunakan arsip source
lama karena belum memuat sesi cookie, CSRF, dan template deployment ini.

## 2. Verifikasi paket pada server

```bash
cd /home/reiki
sha256sum --check kms-release-20260824-03.sha256
tar -tzf kms-release-20260824-03.tar.gz | sed -n '1,40p'
```

Lanjutkan hanya jika checksum menghasilkan `OK` dan arsip tidak berisi `.env`, uploads,
`node_modules`, backup, atau private key.

## 3. Paket OS, akun service, dan direktori

```bash
sudo apt update
sudo apt install --yes age curl ufw ffmpeg ghostscript

sudo groupadd --system kms-app
sudo groupadd --system kms-files
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin --gid kms-app kms
sudo usermod --gid kms-app --append --groups kms-files kms
sudo usermod --append --groups kms-files www-data

sudo groupadd --system kms-backup
sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin --gid kms-backup kms-backup
sudo usermod --append --groups kms-files kms-backup

sudo install -d -o root -g root -m 0755 /opt/kms/releases
sudo install -d -o root -g kms-app -m 0750 /etc/kms
sudo install -d -o kms -g kms-files -m 2750 /var/lib/kms/uploads
sudo install -d -o postgres -g postgres -m 0700 /var/backups/kms-predeploy
```

Jika user/grup sudah ada, perintah pembuatan akan mengatakan bahwa entitas sudah ada;
verifikasi dengan `getent passwd kms kms-backup` dan `getent group kms-app kms-files`.
Jangan mengubah shell user service menjadi shell interaktif.

`ffmpeg` mengoptimalkan video ke MP4 H.264/AAC dan `ghostscript` mengompresi PDF
saat unggahan. File hasil optimasi menjadi file kanonis yang langsung dilayani saat
dibuka; server tidak melakukan konversi ulang pada setiap kunjungan agar CPU tetap
hemat. Pastikan `/etc/kms/backend.env` mengaktifkan `MEDIA_OPTIMIZATION_ENABLED=true`
serta menunjuk `FFMPEG_PATH=/usr/bin/ffmpeg` dan `GHOSTSCRIPT_PATH=/usr/bin/gs`.

## 4. Ekstrak release dan pasang dependensi backend

```bash
version=20260824-03
release=/opt/kms/releases/$version
staging=/var/tmp/kms-release-$version.tar.gz
sudo install -d -o kms -g kms-app -m 0755 "$release"
sudo install -o root -g kms-app -m 0640 \
  "/home/reiki/kms-release-$version.tar.gz" "$staging"
sudo -u kms tar -xzf "$staging" -C "$release"
sudo rm -f -- "$staging"
sudo install -d -o kms -g kms-app -m 0750 "/tmp/kms-npm-$version"
sudo -u kms npm ci --omit=dev --cache "/tmp/kms-npm-$version" --prefix "$release/backend"
sudo chown -R root:root "$release"
sudo chmod -R go-w "$release"
```

Kode release akhirnya `root:root` dan tidak dapat diubah proses Node. Hanya
`/var/lib/kms/uploads` yang writable oleh backend.

### Memindahkan uploads lama

Arsip lama memiliki root `uploads/`. Ekstrak tanpa menimpa file yang sudah ada:

```bash
sudo -u kms tar -xzf /home/reiki/kms-uploads-20260824.tar.gz \
  --directory=/var/lib/kms --skip-old-files
sudo chown -R kms:kms-files /var/lib/kms/uploads
sudo find /var/lib/kms/uploads -type d -exec chmod 2750 {} +
sudo find /var/lib/kms/uploads -type f -exec chmod 0640 {} +
```

Jangan menghapus arsip asal sebelum backup NAS pertama dan audit uploads berhasil.

## 5. Backup database sebelum perubahan ownership

```bash
sudo -u postgres /usr/lib/postgresql/16/bin/pg_dump --format=custom --compress=6 \
  --file=/var/backups/kms-predeploy/kms_project-before-secure-deploy.dump \
  kms_project
sudo -u postgres sha256sum /var/backups/kms-predeploy/kms_project-before-secure-deploy.dump
```

Salin backup ini secara terenkripsi ke media/NAS yang disetujui sebelum meneruskan.

## 6. Pisahkan role PostgreSQL

Role `kms_app` sudah tersedia. Buat dua role tambahan menggunakan prompt agar password
tidak masuk riwayat shell:

```bash
sudo -u postgres createuser --pwprompt --login --no-superuser --no-createdb \
  --no-createrole --no-replication --connection-limit=5 kms_migrator
sudo -u postgres createuser --pwprompt --login --no-superuser --no-createdb \
  --no-createrole --no-replication --connection-limit=2 kms_backup
```

Reset password `kms_app` bila password sebelumnya pernah dibagikan:

```bash
sudo -u postgres psql
\password kms_app
\q
```

Simpan ketiga password berbeda di password manager Kemenhub. Terapkan ownership dan
privilege setelah backup:

```bash
sudo -u postgres psql --set=ON_ERROR_STOP=1 \
  --file="$release/deploy/postgresql-kms-privileges.sql"
```

Pasang pembatasan koneksi PostgreSQL dengan menggabungkan (bukan menimpa secara buta)
`deploy/pg_hba.kms.example` ke `/etc/postgresql/16/main/pg_hba.conf`. Pastikan
`listen_addresses = '127.0.0.1,::1'` dan `password_encryption = 'scram-sha-256'` di
konfigurasi PostgreSQL, lalu:

```bash
sudo -u postgres /usr/lib/postgresql/16/bin/pg_ctlcluster 16 main reload
sudo -u postgres psql -tAc "SHOW listen_addresses; SHOW password_encryption;"
sudo ss -ltnp | grep 5432
```

Hasil port harus hanya `127.0.0.1:5432` dan/atau `[::1]:5432`.

## 7. Konfigurasi rahasia tanpa hard-code

Salin template, edit melalui `sudoedit`, dan jangan menaruh password di command line:

```bash
sudo install -o root -g kms-app -m 0640 "$release/deploy/backend.env.example" /etc/kms/backend.env
sudoedit /etc/kms/backend.env
```

Untuk deployment IP saat ini, nilai origin adalah `https://192.168.55.108`. Password
database pada URL harus URL-encoded. Buat CSRF secret:

```bash
openssl rand -base64 48
```

Buat bcrypt hash Admin tanpa menyimpan password plaintext ke file:

```bash
cd "$release/backend"
read -r -s -p 'Password Admin: ' admin_password; echo
printf '%s' "$admin_password" | node -e \
  "const bcrypt=require('bcrypt');let d='';process.stdin.on('data',c=>d+=c).on('end',async()=>console.log(await bcrypt.hash(d,12)))"
unset admin_password
```

Hanya salin hasil `$2b$...` ke `KMS_ADMIN_PASSWORD_HASH`.

Buat environment migrator terpisah yang hanya memuat koneksi migrator:

```bash
sudoedit /etc/kms/migrator.env
sudo chown root:root /etc/kms/migrator.env
sudo chmod 0600 /etc/kms/migrator.env
```

Isi file:

```dotenv
DATABASE_URL=postgresql://kms_migrator:__URL_ENCODED_PASSWORD__@127.0.0.1:5432/kms_project
```

## 8. Jalankan migration eksplisit

```bash
sudo ln -sfn "$release" /opt/kms/migration
sudo install -o root -g root -m 0644 "$release/deploy/kms-migrate.service.example" \
  /etc/systemd/system/kms-migrate.service
sudo systemctl daemon-reload
sudo systemctl start kms-migrate.service
sudo systemctl status kms-migrate.service --no-pager
```

Jalankan kembali privilege script agar objek baru, termasuk `user_sessions`, mendapat
hak runtime yang tepat dan `audit_logs` tetap tanpa `UPDATE/DELETE`:

```bash
sudo -u postgres psql --set=ON_ERROR_STOP=1 \
  --file="$release/deploy/postgresql-kms-privileges.sql"
```

Verifikasi privilege:

```bash
sudo -u postgres psql -d kms_project -c "
SELECT
  has_database_privilege('kms_app','kms_project','CREATE') AS app_create_db,
  has_schema_privilege('kms_app','public','CREATE') AS app_create_schema,
  has_table_privilege('kms_app','audit_logs','SELECT') AS audit_select,
  has_table_privilege('kms_app','audit_logs','INSERT') AS audit_insert,
  has_table_privilege('kms_app','audit_logs','DELETE') AS audit_delete;"
```

Hasil yang benar: `false, false, true, true, false`.

## 9. Aktifkan release dan backend systemd

```bash
sudo ln -s "$release" /opt/kms/current.next
sudo mv -Tf /opt/kms/current.next /opt/kms/current
sudo install -o root -g root -m 0755 "$release/deploy/scripts/kms-wait-ready.sh" \
  /usr/local/sbin/kms-wait-ready
sudo install -o root -g root -m 0644 "$release/deploy/kms-backend.service.example" \
  /etc/systemd/system/kms-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now kms-backend.service
sudo systemctl status kms-backend.service --no-pager
sudo journalctl -u kms-backend -n 100 --no-pager
curl --fail --silent http://127.0.0.1:3000/api/health/ready
```

### Retensi aset terhapus

Release memasang `kms-asset-retention.timer` untuk membersihkan aset yang telah
di-soft-delete lebih dari satu bulan. Timer berjalan harian sebagai user service
`kms`; file media hanya dihapus bila tidak lagi dirujuk data lain.

```bash
sudo systemctl enable --now kms-asset-retention.timer
sudo systemctl list-timers kms-asset-retention.timer
sudo systemctl status kms-asset-retention.timer --no-pager
sudo journalctl -u kms-asset-retention.service --lines=50 --no-pager
```

## 10. TLS dan Nginx

Simpan sertifikat public chain sebagai `/etc/ssl/certs/kms-kemenhub.crt` dan private key
sebagai `/etc/ssl/private/kms-kemenhub.key` dengan owner `root:root`, mode key `0600`.

```bash
sudo install -o root -g root -m 0644 "$release/deploy/nginx.kms.conf.example" \
  /etc/nginx/sites-available/kms
sudoedit /etc/nginx/sites-available/kms
```

Ganti:

- `__SERVER_NAME__` → DNS internal atau `192.168.55.108`;
- `__TLS_CERTIFICATE__` → `/etc/ssl/certs/kms-kemenhub.crt`;
- `__TLS_PRIVATE_KEY__` → `/etc/ssl/private/kms-kemenhub.key`.

Kemudian:

```bash
sudo ln -s /etc/nginx/sites-available/kms /etc/nginx/sites-enabled/kms
sudo nginx -t
sudo systemctl reload nginx
curl --cacert /path/ke/ca-kemenhub.crt --head https://192.168.55.108/
```

Baris HSTS pada template sengaja dikomentari. Aktifkan setelah sertifikat dipercaya
seluruh klien dan HTTPS lolos uji, kemudian jalankan `nginx -t` dan reload.

## 11. Firewall tanpa memutus SSH

Ganti placeholder dengan CIDR resmi. Jangan menggunakan `0.0.0.0/0` untuk SSH.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from __ADMIN_CIDR__ to any port 22 proto tcp
sudo ufw allow from __USER_KEMENHUB_CIDR__ to any port 443 proto tcp
sudo ufw allow from __USER_KEMENHUB_CIDR__ to any port 80 proto tcp
sudo ufw status verbose
```

Buka sesi SSH kedua dari jaringan administrator dan pastikan berhasil. Baru setelah itu:

```bash
sudo ufw enable
sudo ufw status numbered
sudo ss -ltnp
```

Port 3000 dan 5432 tidak boleh memiliki rule allow jaringan.

## 12. Backup terenkripsi ke NAS

Tim infra harus memasang NAS pada path khusus, misalnya `/mnt/kms-backup`, dengan opsi
`nosuid,nodev,noexec,_netdev`. Application backend dan Nginx tidak menjadi anggota
atau pemilik mount ini.

Buat key `age` pada mesin pemulihan yang aman, bukan VM aplikasi:

```bash
age-keygen -o kms-backup-private.agekey
```

Simpan private key offline/di secret manager. Hanya public recipient `age1...` yang
ditaruh dalam `/etc/kms/backup.env`.

```bash
sudo install -o root -g kms-backup -m 0640 "$release/deploy/backup.env.example" /etc/kms/backup.env
sudo install -o root -g kms-backup -m 0640 "$release/deploy/backup.pgpass.example" /etc/kms/backup.pgpass
sudoedit /etc/kms/backup.env
sudoedit /etc/kms/backup.pgpass
sudo install -o root -g root -m 0755 "$release/deploy/scripts/kms-backup.sh" /usr/local/sbin/kms-backup
sudo install -o root -g root -m 0644 "$release/deploy/kms-backup.service.example" /etc/systemd/system/kms-backup.service
sudo install -o root -g root -m 0644 "$release/deploy/kms-backup.timer.example" /etc/systemd/system/kms-backup.timer
sudoedit /etc/systemd/system/kms-backup.service
```

Ganti `__BACKUP_MOUNT__` dengan mount NAS yang sebenarnya. Pastikan folder tujuan
dimiliki `kms-backup:kms-backup` dan mode `0700`, lalu:

```bash
sudo systemctl daemon-reload
sudo systemctl start kms-backup.service
sudo journalctl -u kms-backup -n 100 --no-pager
sudo systemctl enable --now kms-backup.timer
sudo systemctl list-timers kms-backup.timer
```

Verifikasi `SHA256SUMS`, dekripsi, `pg_restore`, dan uploads pada server pemulihan
terpisah minimal bulanan. Private key tidak boleh disalin kembali ke VM aplikasi.

## 13. Monitor disk dan preflight

```bash
sudo install -o root -g root -m 0755 "$release/deploy/scripts/kms-disk-monitor.sh" /usr/local/sbin/kms-disk-monitor
sudo install -o root -g root -m 0644 "$release/deploy/kms-disk-monitor.service.example" /etc/systemd/system/kms-disk-monitor.service
sudo install -o root -g root -m 0644 "$release/deploy/kms-disk-monitor.timer.example" /etc/systemd/system/kms-disk-monitor.timer
sudo install -o root -g root -m 0755 "$release/deploy/scripts/kms-preflight.sh" /usr/local/sbin/kms-preflight
sudo systemctl daemon-reload
sudo systemctl enable --now kms-disk-monitor.timer
sudo /usr/local/sbin/kms-preflight
sudo systemd-analyze security kms-backend.service
```

Ambang default monitor adalah 70% warning dan 85% critical. Backend juga menolak
unggahan bila ruang bebas kurang dari `UPLOAD_MINIMUM_FREE_BYTES`.

## 14. Uji penerimaan keamanan

- Browser tidak memiliki `kms_token`/bearer token di localStorage atau response login.
- Cookie sesi bernama `__Host-kms_session` dan memiliki `Secure; HttpOnly; SameSite=Strict; Path=/`.
- Cookie CSRF tidak HttpOnly agar header dapat dibentuk, tetapi ditandatangani dan
  terikat ke sesi; POST tanpa `X-CSRF-Token` harus ditolak.
- Logout mencabut row sesi; cookie lama tidak dapat digunakan lagi.
- Pimpinan tetap ditolak untuk seluruh endpoint tulis.
- `/api/health/ready` tidak dapat dibaca dari jaringan melalui Nginx.
- URL langsung `/uploads/...` menghasilkan 404; media hanya tersedia melalui endpoint API yang memvalidasi aset dan visibilitas unit kerja.
- Location internal `/_kms_uploads/...` tidak dapat diakses langsung dari klien dan hanya digunakan melalui `X-Accel-Redirect` backend.
- request `.env`, source backend, backup, dotfiles, dan private key ditolak.
- `sudo -u www-data test -w /var/lib/kms/uploads` gagal.
- `kms_app` gagal `CREATE TABLE` dan gagal `DELETE FROM audit_logs`.
- reboot VM mempertahankan PostgreSQL, backend, Nginx, timer backup, dan mount NAS.

## 15. Update dan rollback berikutnya

Untuk update, ekstrak ke release versi baru, install dependency, arahkan
`/opt/kms/migration`, jalankan migration, uji, lalu ubah symlink `current` secara
atomik dan restart backend. Jangan menimpa release aktif.

### Jalur update rutin (disarankan)

Setelah skrip deployment dipasang ke `/usr/local/sbin/kms-deploy-release`, update
rutin cukup dengan mengunggah arsip dan checksum ke `/home/reiki`, lalu menjalankan:

```bash
sudo kms-deploy-release 20260825-07
```

Skrip akan memverifikasi checksum dan isi paket, memasang dependency backend,
membuat backup database, menjalankan migration, mengembalikan privilege runtime,
mengaktifkan symlink secara atomik, menguji health check/preflight, dan melakukan
rollback aplikasi bila aktivasi gagal. Skrip tidak menghapus release sebelumnya.

Untuk memasang atau memperbarui skrip dari source release yang sudah diekstrak:

```bash
sudo install -o root -g root -m 0755 \
  /opt/kms/current/deploy/scripts/kms-deploy-release.sh \
  /usr/local/sbin/kms-deploy-release
```

```bash
sudo ln -s /opt/kms/releases/__PREVIOUS_SECURE_VERSION__ /opt/kms/current.rollback
sudo mv -Tf /opt/kms/current.rollback /opt/kms/current
sudo systemctl restart kms-backend
sudo nginx -t && sudo systemctl reload nginx
```

Rollback hanya memakai release yang sudah mendukung sesi cookie dan skema keamanan.
Release bearer-token lama tidak boleh diaktifkan kembali setelah go-live aman.
