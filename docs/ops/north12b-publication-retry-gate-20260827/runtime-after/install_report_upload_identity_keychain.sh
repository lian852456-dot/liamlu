#!/bin/zsh
set -euo pipefail

readonly KEYCHAIN_SERVICE="North12BReportUploadEmployeeId"
readonly KEYCHAIN_ACCOUNT="${REPORT_UPLOAD_IDENTITY_KEYCHAIN_ACCOUNT:-${USER:-}}"

if [[ -z "$KEYCHAIN_ACCOUNT" ]]; then
  print -u2 "setup blocked: Keychain account is unavailable."
  exit 78
fi

print "North12B 09:45 automation credential setup"
print "Enter the authorized employee ID at the secure Keychain prompt."
print "The value is not echoed, written to shell history, JSON, or automation logs."
security add-generic-password \
  -U \
  -a "$KEYCHAIN_ACCOUNT" \
  -s "$KEYCHAIN_SERVICE" \
  -D "North12B report upload identity" \
  -j "Used only by the local 09:45 North12B automation preflight and publisher" \
  -T /usr/bin/security \
  -w

source "${0:A:h}/report_upload_identity_keychain.zsh"
export REPORT_UPLOAD_IDENTITY_REQUIRE_KEYCHAIN=1
if ! load_report_upload_identity; then
  print -u2 "Keychain item was saved, but its format is invalid. Rerun this setup and enter 5–12 letters or digits."
  exit 78
fi
clear_report_upload_identity
print "Keychain item saved and format-validated. No credential value was displayed."
