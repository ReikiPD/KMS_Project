#!/usr/bin/env bash
set -Eeuo pipefail

upload_path="${KMS_UPLOAD_PATH:-/var/lib/kms/uploads}"
warning="${KMS_DISK_WARNING_PERCENT:-70}"
critical="${KMS_DISK_CRITICAL_PERCENT:-85}"
usage="$(df -P "$upload_path" | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"

if ! [[ "$usage" =~ ^[0-9]+$ ]]; then
  echo "Tidak dapat membaca pemakaian disk untuk $upload_path" >&2
  exit 2
fi
if (( usage >= critical )); then
  echo "CRITICAL: disk uploads KMS terpakai ${usage}% (ambang ${critical}%)." >&2
  exit 2
fi
if (( usage >= warning )); then
  echo "WARNING: disk uploads KMS terpakai ${usage}% (ambang ${warning}%)." >&2
  exit 1
fi
echo "OK: disk uploads KMS terpakai ${usage}%."
