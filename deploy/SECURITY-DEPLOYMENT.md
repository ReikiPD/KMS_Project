# Baseline Keamanan Deployment KMS

Panduan eksekusi otoritatif adalah
[`PRODUCTION-RUNBOOK.md`](./PRODUCTION-RUNBOOK.md). Dokumen tersebut mencakup:

- HTTPS wajib dan cookie sesi opaque + CSRF;
- pemisahan web root, source, uploads, konfigurasi, dan backup;
- service Node non-root dengan sandbox systemd;
- Nginx sebagai satu-satunya entry point;
- PostgreSQL loopback dengan tiga role least-privilege;
- backup terenkripsi off-host dan uji restore;
- firewall berbasis CIDR Kemenhub;
- preflight, monitoring disk, cutover, serta rollback.

Deployment tidak boleh go-live apabila sertifikat tepercaya, CIDR resmi, NAS backup,
atau uji restore belum tersedia.
