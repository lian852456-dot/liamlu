#!/bin/zsh
set -euo pipefail

readonly tool_dir="${0:A:h}"
readonly keychain_service="North12BPrivateDashboardAdminSecret"
readonly keychain_account="${PRIVATE_DASHBOARD_KEYCHAIN_ACCOUNT:-$USER}"

if [[ -z "${REPORT_AUTOMATION_DIR:-}" || "${REPORT_AUTOMATION_DIR:0:1}" != "/" ]]; then
  print -u2 "official ingest consumer blocked: REPORT_AUTOMATION_DIR must be an absolute path"
  exit 1
fi
if [[ -z "${REPORT_UPLOAD_GAS_URL:-}" || -z "${REPORT_UPLOAD_EMPLOYEE_ID:-}" ]]; then
  print -u2 "official ingest consumer blocked: REPORT_UPLOAD_GAS_URL and REPORT_UPLOAD_EMPLOYEE_ID are required"
  exit 1
fi
admin_secret="$(security find-generic-password -a "$keychain_account" -s "$keychain_service" -w)"
if [[ -z "$admin_secret" ]]; then
  print -u2 "official ingest consumer blocked: Keychain administrator secret is empty"
  exit 1
fi
PRIVATE_DASHBOARD_ADMIN_SECRET="$admin_secret" \
REPORT_OUTLOOK_BRIDGE_COMMAND="$tool_dir/outlook_bridge_host_adapter.sh" \
node "$tool_dir/report_official_ingest_consumer.mjs" "$@"
