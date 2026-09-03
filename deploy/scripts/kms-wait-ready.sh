#!/usr/bin/env bash
set -Eeuo pipefail

for _attempt in $(seq 1 20); do
  if curl --fail --silent --show-error --max-time 2 \
    http://127.0.0.1:3000/api/health/ready >/dev/null; then
    exit 0
  fi
  sleep 1
done
echo "Backend KMS tidak siap setelah 20 detik." >&2
exit 1
