#!/bin/zsh
set -euo pipefail

readonly PROJECT_ROOT="/Users/liamlu/Downloads/liam-agent"
readonly KEYCHAIN_SERVICE="North12BPrivateDashboardAdminSecret"
readonly KEYCHAIN_ACCOUNT="${PRIVATE_DASHBOARD_KEYCHAIN_ACCOUNT:-$USER}"

source "$PROJECT_ROOT/report-automation/work/report_upload_identity_keychain.zsh"

if [[ -z "${REPORT_UPLOAD_GAS_URL:-}" ]]; then
  print -u2 "official ingest consumer blocked: REPORT_UPLOAD_GAS_URL is required"
  exit 78
fi
if ! load_report_upload_identity; then
  print -u2 "official ingest consumer blocked: upload identity configuration is missing or invalid"
  exit 78
fi
admin_secret="$(security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE" -w)"
if [[ -z "$admin_secret" ]]; then
  print -u2 "official ingest consumer blocked: Keychain administrator secret is empty"
  exit 1
fi
PRIVATE_DASHBOARD_ADMIN_SECRET="$admin_secret" \
node "$PROJECT_ROOT/report-automation/work/report_official_ingest_consumer.mjs" "$@"
