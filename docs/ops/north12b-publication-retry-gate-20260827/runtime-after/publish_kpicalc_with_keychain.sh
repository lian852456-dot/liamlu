#!/bin/zsh
# Publish one KPI Excel through the isolated report-upload deployment while
# keeping the administrator secret in macOS Keychain.
set -euo pipefail

readonly PROJECT_ROOT="/Users/liamlu/Downloads/liam-agent"
readonly GAS_URL="https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec"
readonly ACCESS_GAS_URL="https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec"
readonly KEYCHAIN_SERVICE="North12BPrivateDashboardAdminSecret"
readonly KEYCHAIN_ACCOUNT="${PRIVATE_DASHBOARD_KEYCHAIN_ACCOUNT:-$USER}"
readonly KEYCHAIN_PATH="${PRIVATE_DASHBOARD_KEYCHAIN_PATH:-}"

source "$PROJECT_ROOT/report-automation/work/report_upload_identity_keychain.zsh"

if ! load_report_upload_identity; then
  print -u2 "official KPI publish blocked: upload identity configuration is missing or invalid."
  exit 78
fi

keychain_args=(-a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE")
if [[ -n "$KEYCHAIN_PATH" ]]; then
  keychain_args+=("$KEYCHAIN_PATH")
fi

if ! security find-generic-password "${keychain_args[@]}" >/dev/null 2>&1; then
  print -u2 "official KPI publish blocked: Keychain item not found or not accessible."
  exit 1
fi

admin_secret="$(security find-generic-password "${keychain_args[@]}" -w)"
if [[ -z "$admin_secret" ]]; then
  print -u2 "official KPI publish blocked: Keychain secret is empty."
  exit 1
fi

REPORT_UPLOAD_GAS_URL="$GAS_URL" \
REPORT_ACCESS_GAS_URL="$ACCESS_GAS_URL" \
PRIVATE_DASHBOARD_ADMIN_SECRET="$admin_secret" \
node "$PROJECT_ROOT/report-automation/work/publish_kpicalc_report.mjs" "$@"
