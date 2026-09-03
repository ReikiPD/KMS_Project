# PostgreSQL Produksi KMS

Panduan PostgreSQL produksi telah dikonsolidasikan ke
[`PRODUCTION-RUNBOOK.md`](./PRODUCTION-RUNBOOK.md), bagian 5, 6, dan 8.

Model akses final:

- `kms_migrator`: owner database/schema/objek dan menjalankan migration eksplisit;
- `kms_app`: runtime DML tanpa DDL; audit hanya `SELECT` dan `INSERT`;
- `kms_backup`: read-only untuk `pg_dump`;
- `postgres`: administrasi lokal melalui `sudo`.

Jangan memakai kembali konfigurasi lama yang menjadikan `kms_app` sebagai owner.
Script otoritatif adalah [`postgresql-kms-privileges.sql`](./postgresql-kms-privileges.sql).
