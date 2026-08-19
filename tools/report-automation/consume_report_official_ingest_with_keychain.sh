#!/bin/bash
set -euo pipefail

readonly tool_dir="$(cd "$(dirname "$0")" && pwd)"
readonly keychain_service="North12BPrivateDashboardAdminSecret"
readonly keychain_account="${PRIVATE_DASHBOARD_KEYCHAIN_ACCOUNT:-$USER}"

if [[ -z "${REPORT_AUTOMATION_DIR:-}" || "${REPORT_AUTOMATION_DIR:0:1}" != "/" ]]; then
  printf '%s\n' "official ingest consumer blocked: REPORT_AUTOMATION_DIR must be an absolute path" >&2
  exit 1
fi
if [[ -z "${REPORT_UPLOAD_GAS_URL:-}" || -z "${REPORT_UPLOAD_EMPLOYEE_ID:-}" ]]; then
  printf '%s\n' "official ingest consumer blocked: REPORT_UPLOAD_GAS_URL and REPORT_UPLOAD_EMPLOYEE_ID are required" >&2
  exit 1
fi
admin_secret="$(security find-generic-password -a "$keychain_account" -s "$keychain_service" -w)"
if [[ -z "$admin_secret" ]]; then
  printf '%s\n' "official ingest consumer blocked: Keychain administrator secret is empty" >&2
  exit 1
fi
PRIVATE_DASHBOARD_ADMIN_SECRET="$admin_secret" \
REPORT_OUTLOOK_BRIDGE_COMMAND="$tool_dir/outlook_bridge_host_adapter.sh" \
node "$tool_dir/report_official_ingest_consumer.mjs" "$@"
