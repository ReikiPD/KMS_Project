#!/usr/bin/env bash
set -Eeuo pipefail

failed=0
ok() { printf 'OK    %s\n' "$1"; }
fail() { printf 'GAGAL %s\n' "$1" >&2; failed=1; }

test -L /opt/kms/current && ok "release aktif berupa symlink" || fail "/opt/kms/current bukan symlink"
test -f /opt/kms/current/frontend/dist/index.html && ok "frontend build tersedia" || fail "frontend build tidak tersedia"
test -f /opt/kms/current/backend/app.js && ok "backend tersedia" || fail "backend tidak tersedia"
test "$(stat -c '%U:%G:%a' /etc/kms/backend.env)" = "root:kms-app:640" && ok "permission backend.env benar" || fail "backend.env wajib root:kms-app 640"
sudo -u kms test -r /etc/kms/backend.env && ok "service dapat membaca konfigurasi" || fail "service tidak dapat membaca konfigurasi"
sudo -u kms test -w /var/lib/kms/uploads && ok "backend dapat menulis uploads" || fail "backend tidak dapat menulis uploads"
sudo -u www-data test -r /var/lib/kms/uploads && ok "Nginx dapat membaca uploads" || fail "Nginx tidak dapat membaca uploads"
if sudo -u www-data test -w /var/lib/kms/uploads; then fail "Nginx tidak boleh menulis uploads"; else ok "Nginx tidak dapat menulis uploads"; fi

nginx -t >/dev/null 2>&1 && ok "konfigurasi Nginx valid" || fail "konfigurasi Nginx tidak valid"
systemctl is-active --quiet kms-backend && ok "backend aktif" || fail "backend tidak aktif"
systemctl is-active --quiet nginx && ok "Nginx aktif" || fail "Nginx tidak aktif"
curl --fail --silent --max-time 5 http://127.0.0.1:3000/api/health/ready >/dev/null && ok "health check backend siap" || fail "health check backend gagal"

if ss -ltn | awk '$4 ~ /(^|:)3000$/ && $4 !~ /127\.0\.0\.1:3000|\[::1\]:3000/ { found=1 } END { exit found ? 0 : 1 }'; then
  fail "port 3000 terpapar selain loopback"
else
  ok "port 3000 hanya loopback"
fi
if ss -ltn | awk '$4 ~ /(^|:)5432$/ && $4 !~ /127\.0\.0\.1:5432|\[::1\]:5432/ { found=1 } END { exit found ? 0 : 1 }'; then
  fail "port 5432 terpapar selain loopback"
else
  ok "port 5432 hanya loopback"
fi

exit "$failed"
