#!/usr/bin/env bash
set -Eeuo pipefail

readonly APP_NAME="KMS Kemenhub"
readonly RELEASE_ROOT="/opt/kms/releases"
readonly CURRENT_LINK="/opt/kms/current"
readonly MIGRATION_LINK="/opt/kms/migration"
readonly BACKUP_ROOT="/var/backups/kms-predeploy"
readonly DATABASE_NAME="kms_project"

log() { printf '\n[%s] %s\n' "$1" "$2"; }
fail() { printf '\nGAGAL: %s\n' "$1" >&2; exit 1; }

if [[ ${EUID} -ne 0 ]]; then
  fail "jalankan dengan sudo"
fi

version="${1:-}"
package_dir="${2:-/home/reiki}"

if [[ ! "$version" =~ ^[0-9]{8}-[0-9]{2,6}$ ]]; then
  fail "versi wajib memakai format aman, contoh: 20260825-07"
fi

package="$package_dir/kms-release-$version.tar.gz"
checksum="$package_dir/kms-release-$version.sha256"
release="$RELEASE_ROOT/$version"
partial="$RELEASE_ROOT/.$version.partial"
staging="/var/tmp/kms-release-$version.tar.gz"
npm_cache="/var/tmp/kms-npm-$version"
backup="$BACKUP_ROOT/${DATABASE_NAME}-before-$version.dump"
previous_release="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"

cleanup() {
  rm -f -- "$staging"
  rm -rf -- "$npm_cache"
  if [[ -d "$partial" ]]; then
    rm -rf -- "$partial"
  fi
}
trap cleanup EXIT

[[ -f "$package" ]] || fail "paket tidak ditemukan: $package"
[[ -f "$checksum" ]] || fail "checksum tidak ditemukan: $checksum"
[[ ! -e "$release" ]] || fail "release sudah tersedia: $release"
[[ ! -e "$partial" ]] || fail "direktori persiapan masih tersedia: $partial"
[[ ! -e "$backup" ]] || fail "backup versi ini sudah tersedia: $backup"
[[ -f /etc/kms/backend.env ]] || fail "/etc/kms/backend.env tidak tersedia"
[[ -f /etc/kms/migrator.env ]] || fail "/etc/kms/migrator.env tidak tersedia"
id kms >/dev/null 2>&1 || fail "akun service kms tidak tersedia"

log INFO "Memverifikasi paket $APP_NAME $version"
expected="$(awk 'NR == 1 { print $1 }' "$checksum" | tr -d '\r')"
[[ "$expected" =~ ^[0-9a-fA-F]{64}$ ]] || fail "format checksum tidak valid"
actual="$(sha256sum "$package" | awk '{ print $1 }')"
[[ "${actual,,}" == "${expected,,}" ]] || fail "checksum paket tidak cocok"

if tar -tzf "$package" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
  fail "paket mengandung path yang tidak aman"
fi

if tar -tzf "$package" | grep -Eq '(^|/)(\.env$|node_modules/|uploads/|\.git/|.*\.(pem|key|dump|bak)$)'; then
  fail "paket mengandung file yang tidak boleh masuk release"
fi

available_kb="$(df --output=avail "$RELEASE_ROOT" | awk 'NR == 2 { print $1 }')"
(( available_kb >= 1048576 )) || fail "ruang kosong kurang dari 1 GiB"

printf 'Release sekarang : %s\n' "${previous_release:-belum ada}"
printf 'Release baru     : %s\n' "$release"
printf 'Backup database  : %s\n' "$backup"
read -r -p "Ketik DEPLOY untuk melanjutkan: " confirmation
[[ "$confirmation" == "DEPLOY" ]] || fail "deployment dibatalkan"

log INFO "Menyiapkan release tanpa mengubah versi aktif"
install -o root -g kms-app -m 0640 "$package" "$staging"
install -d -o kms -g kms-app -m 0755 "$partial"
runuser -u kms -- tar -xzf "$staging" -C "$partial"

[[ -f "$partial/backend/app.js" ]] || fail "backend/app.js tidak tersedia"
[[ -f "$partial/backend/package-lock.json" ]] || fail "backend/package-lock.json tidak tersedia"
[[ -f "$partial/frontend/dist/index.html" ]] || fail "frontend build tidak tersedia"
[[ -f "$partial/deploy/postgresql-kms-privileges.sql" ]] || fail "skrip privilege tidak tersedia"

install -d -o kms -g kms-app -m 0750 "$npm_cache"
runuser -u kms -- env npm_config_cache="$npm_cache" \
  npm ci --omit=dev --prefix "$partial/backend"

runuser -u kms -- node -e "
const bcrypt = require('$partial/backend/node_modules/bcrypt');
bcrypt.hash('kms-release-check', 12)
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
" || fail "modul bcrypt gagal digunakan"

chown -R root:root "$partial"
chmod -R go-w "$partial"
mv -T "$partial" "$release"

log INFO "Membuat backup database sebelum migrasi"
install -d -o postgres -g postgres -m 0700 "$BACKUP_ROOT"
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_dump \
  --format=custom \
  --compress=6 \
  --file="$backup" \
  "$DATABASE_NAME"
chmod 0600 "$backup"
runuser -u postgres -- test -s "$backup" || fail "backup database kosong"
runuser -u postgres -- /usr/lib/postgresql/16/bin/pg_restore --list "$backup" >/dev/null

log INFO "Menjalankan migrasi database"
migration_next="/opt/kms/migration.$$.next"
ln -s "$release" "$migration_next"
mv -Tf "$migration_next" "$MIGRATION_LINK"

install -o root -g root -m 0644 \
  "$release/deploy/kms-migrate.service.example" \
  /etc/systemd/system/kms-migrate.service
systemctl daemon-reload
systemctl start kms-migrate.service

runuser -u postgres -- psql \
  --set=ON_ERROR_STOP=1 \
  --file="$release/deploy/postgresql-kms-privileges.sql" >/dev/null

log INFO "Mengaktifkan release secara atomik"
install -o root -g root -m 0755 \
  "$release/deploy/scripts/kms-wait-ready.sh" \
  /usr/local/sbin/kms-wait-ready
install -o root -g root -m 0755 \
  "$release/deploy/scripts/kms-preflight.sh" \
  /usr/local/sbin/kms-preflight
install -o root -g root -m 0644 \
  "$release/deploy/kms-backend.service.example" \
  /etc/systemd/system/kms-backend.service
install -o root -g root -m 0644 \
  "$release/deploy/kms-asset-retention.service.example" \
  /etc/systemd/system/kms-asset-retention.service
install -o root -g root -m 0644 \
  "$release/deploy/kms-asset-retention.timer.example" \
  /etc/systemd/system/kms-asset-retention.timer
systemctl daemon-reload
nginx -t

current_next="/opt/kms/current.$$.next"
ln -s "$release" "$current_next"
mv -Tf "$current_next" "$CURRENT_LINK"

rollback_application() {
  if [[ -n "$previous_release" && -d "$previous_release" ]]; then
    log ROLLBACK "Mengembalikan aplikasi ke $previous_release"
    rollback_next="/opt/kms/current.$$.rollback"
    ln -s "$previous_release" "$rollback_next"
    mv -Tf "$rollback_next" "$CURRENT_LINK"
    systemctl restart kms-backend.service || true
    systemctl reload nginx || true
  fi
}

if ! systemctl restart kms-backend.service; then
  rollback_application
  fail "backend release baru gagal dimulai"
fi

if ! curl --fail --silent --show-error --max-time 10 \
  http://127.0.0.1:3000/api/health/ready >/dev/null; then
  rollback_application
  fail "health check release baru gagal"
fi

if ! systemctl reload nginx; then
  rollback_application
  fail "Nginx gagal dimuat ulang"
fi

if ! /usr/local/sbin/kms-preflight; then
  rollback_application
  fail "preflight release baru gagal"
fi

# Timer baru diaktifkan setelah release lolos health check. Dengan urutan ini,
# timer tidak sempat menjalankan skrip dari release lama saat proses cutover.
systemctl enable --now kms-asset-retention.timer

log SELESAI "$APP_NAME $version aktif"
printf 'Release aktif : %s\n' "$(readlink -f "$CURRENT_LINK")"
printf 'Backup        : %s\n' "$backup"
printf 'Health        : ready\n'
