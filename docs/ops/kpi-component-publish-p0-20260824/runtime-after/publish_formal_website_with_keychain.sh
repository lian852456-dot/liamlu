#!/bin/zsh
# Publish and verify both protected website data paths. A website update is
# complete only after kpicalc and dashboard snapshot read back with matching
# source/date values.
set -euo pipefail

readonly PROJECT_ROOT="/Users/liamlu/Downloads/liam-agent"
readonly REPORT_UPLOAD_GAS_URL_VALUE="https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec"
readonly REPORT_ACCESS_GAS_URL_VALUE="https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec"
readonly DASHBOARD_GAS_URL="$REPORT_ACCESS_GAS_URL_VALUE"
readonly KEYCHAIN_SERVICE="North12BPrivateDashboardAdminSecret"
readonly KEYCHAIN_ACCOUNT="${PRIVATE_DASHBOARD_KEYCHAIN_ACCOUNT:-$USER}"
readonly KEYCHAIN_PATH="${PRIVATE_DASHBOARD_KEYCHAIN_PATH:-}"

if [[ -z "${REPORT_RUN_DATE_ISO:-}" ]]; then
  print -u2 "formal website publish blocked: REPORT_RUN_DATE_ISO is required."
  exit 1
fi
if [[ -z "${REPORT_DATA_CUTOFF_DATE:-}" ]]; then
  print -u2 "formal website publish blocked: REPORT_DATA_CUTOFF_DATE is required."
  exit 1
fi
if [[ ! "$REPORT_RUN_DATE_ISO" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ || ! "$REPORT_DATA_CUTOFF_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  print -u2 "formal website publish blocked: report run/data cutoff dates must use YYYY-MM-DD."
  exit 1
fi
if [[ "$REPORT_DATA_CUTOFF_DATE" > "$REPORT_RUN_DATE_ISO" ]]; then
  print -u2 "formal website publish blocked: data cutoff date cannot be after report run date."
  exit 1
fi

if [[ -z "${REPORT_UPLOAD_EMPLOYEE_ID:-}" ]]; then
  print -u2 "formal website publish blocked: REPORT_UPLOAD_EMPLOYEE_ID is required."
  exit 1
fi

keychain_args=(-a "$KEYCHAIN_ACCOUNT" -s "$KEYCHAIN_SERVICE")
if [[ -n "$KEYCHAIN_PATH" ]]; then
  keychain_args+=("$KEYCHAIN_PATH")
fi
if ! security find-generic-password "${keychain_args[@]}" >/dev/null 2>&1; then
  print -u2 "formal website publish blocked: Keychain item not found or not accessible."
  exit 1
fi
admin_secret="$(security find-generic-password "${keychain_args[@]}" -w)"
if [[ -z "$admin_secret" ]]; then
  print -u2 "formal website publish blocked: Keychain secret is empty."
  exit 1
fi

publisher="$PROJECT_ROOT/report-automation/work/publish_formal_website_data.mjs"
publisher_args=("$@")
if (( ${publisher_args[(I)--kpi-component-only]} )); then
  publisher="$PROJECT_ROOT/report-automation/work/publish_kpi_component_data.mjs"
  publisher_args=("${publisher_args[@]:#--kpi-component-only}")
fi

PRIVATE_DASHBOARD_GAS_URL="$DASHBOARD_GAS_URL" \
REPORT_UPLOAD_GAS_URL="$REPORT_UPLOAD_GAS_URL_VALUE" \
REPORT_ACCESS_GAS_URL="$REPORT_ACCESS_GAS_URL_VALUE" \
PRIVATE_DASHBOARD_ADMIN_SECRET="$admin_secret" \
node "$publisher" "${publisher_args[@]}"
