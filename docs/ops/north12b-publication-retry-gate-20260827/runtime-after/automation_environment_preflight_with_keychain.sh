#!/bin/zsh
set -euo pipefail

readonly PROJECT_ROOT="/Users/liamlu/Downloads/liam-agent"
readonly WORK_DIR="$PROJECT_ROOT/report-automation/work"
readonly ADMIN_KEYCHAIN_SERVICE="North12BPrivateDashboardAdminSecret"
readonly KEYCHAIN_ACCOUNT="${PRIVATE_DASHBOARD_KEYCHAIN_ACCOUNT:-${USER:-}}"
readonly REPORT_UPLOAD_GAS_URL_VALUE="https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec"
readonly REPORT_ACCESS_GAS_URL_VALUE="https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec"

source "$WORK_DIR/report_upload_identity_keychain.zsh"
export REPORT_UPLOAD_IDENTITY_REQUIRE_KEYCHAIN=1
if ! load_report_upload_identity; then
  print -u2 '{"action":"credential-environment-preflight","status":"BLOCKED","failure_class":"configuration","retryable":false,"failures":["upload_identity_keychain"]}'
  exit 78
fi

admin_ready=0
node_ready=0
curl_ready=0
endpoints_ready=0
security find-generic-password -a "$KEYCHAIN_ACCOUNT" -s "$ADMIN_KEYCHAIN_SERVICE" >/dev/null 2>&1 && admin_ready=1
command -v node >/dev/null 2>&1 && node_ready=1
command -v curl >/dev/null 2>&1 && curl_ready=1
if [[ "$REPORT_UPLOAD_GAS_URL_VALUE" == https://script.google.com/macros/s/*/exec && \
      "$REPORT_ACCESS_GAS_URL_VALUE" == https://script.google.com/macros/s/*/exec ]]; then
  endpoints_ready=1
fi

export AUTOMATION_PREFLIGHT_ADMIN_KEYCHAIN="$admin_ready"
export AUTOMATION_PREFLIGHT_NODE="$node_ready"
export AUTOMATION_PREFLIGHT_CURL="$curl_ready"
export AUTOMATION_PREFLIGHT_ENDPOINTS="$endpoints_ready"

if [[ "${1:-}" == "--fixture-dry-run" ]]; then
  node "$WORK_DIR/automation_runtime_dry_run.mjs"
else
  node "$WORK_DIR/automation_environment_preflight.mjs"
fi
status=$?
clear_report_upload_identity
exit "$status"
