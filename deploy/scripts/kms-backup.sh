#!/usr/bin/env bash
set -Eeuo pipefail
umask 0077

exec 9>/run/kms-backup/backup.lock
if ! flock -n 9; then
  echo "Backup KMS lain masih berjalan; proses ini dilewati." >&2
  exit 0
fi

# File ini root-owned dan hanya dapat dibaca service backup.
source /etc/kms/backup.env
: "${BACKUP_ROOT:?BACKUP_ROOT belum diisi}"
: "${PGHOST:?PGHOST belum diisi}"
: "${PGPORT:?PGPORT belum diisi}"
: "${PGDATABASE:?PGDATABASE belum diisi}"
: "${PGUSER:?PGUSER belum diisi}"
: "${PGPASSFILE:?PGPASSFILE belum diisi}"
: "${PG_DUMP_BIN:?PG_DUMP_BIN belum diisi}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT belum diisi}"

case "$BACKUP_ROOT" in
  /mnt/*|/srv/*) ;;
  *) echo "BACKUP_ROOT wajib berada di bawah /mnt atau /srv." >&2; exit 1 ;;
esac

test -x "$PG_DUMP_BIN" || { echo "pg_dump PostgreSQL 16 tidak tersedia: $PG_DUMP_BIN" >&2; exit 1; }
for command in age tar sha256sum flock; do
  command -v "$command" >/dev/null || { echo "Perintah $command belum tersedia." >&2; exit 1; }
done

export PGPASSFILE
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_ROOT/.staging" "$BACKUP_ROOT/daily" "$BACKUP_ROOT/weekly" "$BACKUP_ROOT/monthly"
stage="$(mktemp -d "$BACKUP_ROOT/.staging/${stamp}.XXXXXX")"
cleanup() { test ! -d "$stage" || rm -rf -- "$stage"; }
trap cleanup EXIT

"$PG_DUMP_BIN" \
  --host="$PGHOST" --port="$PGPORT" --username="$PGUSER" --dbname="$PGDATABASE" \
  --format=custom --compress=6 --no-password --file=- \
  | age --encrypt --recipient "$AGE_RECIPIENT" --output "$stage/database.dump.age"

tar --directory=/var/lib/kms --create --gzip --numeric-owner uploads \
  | age --encrypt --recipient "$AGE_RECIPIENT" --output "$stage/uploads.tar.gz.age"

{
  echo "timestamp_utc=$stamp"
  echo "database=$PGDATABASE"
  echo "postgres_client=$($PG_DUMP_BIN --version)"
  echo "hostname=$(hostname --fqdn 2>/dev/null || hostname)"
  echo "uploads_bytes=$(du -sb /var/lib/kms/uploads | awk '{print $1}')"
} > "$stage/MANIFEST.txt"

(cd "$stage" && sha256sum database.dump.age uploads.tar.gz.age MANIFEST.txt > SHA256SUMS)
chmod 0600 "$stage"/*
final="$BACKUP_ROOT/daily/$stamp"
mv -- "$stage" "$final"
trap - EXIT

if [ "$(date -u +%u)" = "7" ]; then
  weekly_tmp="$BACKUP_ROOT/.staging/weekly-$stamp"
  cp -a -- "$final" "$weekly_tmp"
  mv -- "$weekly_tmp" "$BACKUP_ROOT/weekly/$stamp"
fi
if [ "$(date -u +%d)" = "01" ]; then
  monthly_tmp="$BACKUP_ROOT/.staging/monthly-$stamp"
  cp -a -- "$final" "$monthly_tmp"
  mv -- "$monthly_tmp" "$BACKUP_ROOT/monthly/$stamp"
fi

find "$BACKUP_ROOT/daily" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf -- {} +
find "$BACKUP_ROOT/weekly" -mindepth 1 -maxdepth 1 -type d -mtime +31 -exec rm -rf -- {} +
find "$BACKUP_ROOT/monthly" -mindepth 1 -maxdepth 1 -type d -mtime +186 -exec rm -rf -- {} +

echo "Backup terenkripsi selesai: $final"
