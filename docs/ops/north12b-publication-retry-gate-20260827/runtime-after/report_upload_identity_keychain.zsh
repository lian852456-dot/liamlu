#!/bin/zsh

# Source-only helper. It never prints the upload identity and only exports it
# into the current process so the immediate child publisher can authenticate.

typeset -gr REPORT_UPLOAD_IDENTITY_KEYCHAIN_SERVICE="North12BReportUploadEmployeeId"

load_report_upload_identity() {
  local require_keychain="${REPORT_UPLOAD_IDENTITY_REQUIRE_KEYCHAIN:-0}"
  local account="${REPORT_UPLOAD_IDENTITY_KEYCHAIN_ACCOUNT:-${USER:-}}"
  local identity=""

  if [[ "$require_keychain" != "1" && -n "${REPORT_UPLOAD_EMPLOYEE_ID:-}" ]]; then
    identity="${(U)${REPORT_UPLOAD_EMPLOYEE_ID//[[:space:]]/}}"
    if [[ "$identity" != [A-Z0-9]## || ${#identity} -lt 5 || ${#identity} -gt 12 ]]; then
      unset identity
      return 78
    fi
    export REPORT_UPLOAD_EMPLOYEE_ID="$identity"
    export REPORT_UPLOAD_IDENTITY_SOURCE="runtime-env"
    unset identity
    return 0
  fi

  if [[ -z "$account" ]]; then
    return 78
  fi
  if ! security find-generic-password -a "$account" -s "$REPORT_UPLOAD_IDENTITY_KEYCHAIN_SERVICE" >/dev/null 2>&1; then
    return 78
  fi
  identity="$(security find-generic-password -a "$account" -s "$REPORT_UPLOAD_IDENTITY_KEYCHAIN_SERVICE" -w 2>/dev/null)" || return 78
  identity="${(U)${identity//[[:space:]]/}}"
  if [[ "$identity" != [A-Z0-9]## || ${#identity} -lt 5 || ${#identity} -gt 12 ]]; then
    unset identity
    return 78
  fi
  export REPORT_UPLOAD_EMPLOYEE_ID="$identity"
  export REPORT_UPLOAD_IDENTITY_SOURCE="macos-login-keychain"
  unset identity
}

clear_report_upload_identity() {
  unset REPORT_UPLOAD_EMPLOYEE_ID REPORT_UPLOAD_IDENTITY_SOURCE
}
