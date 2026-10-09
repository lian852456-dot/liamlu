// Auth ownership candidate. No transport, credentials, scopes, Properties
// writes or trigger installation are supplied by this module. Missing approved
// owner transport/provider fails closed; it never falls back to a peer roster.
const PRIVATE_DASHBOARD_AUTH_OPERATIONS_ = [
  'privateDashboardRequestBinding','privateDashboardRequestStatus',
  'privateDashboardAccess','kpiCalcAccess','privateDashboardAdminRequests',
  'privateDashboardAdminApprove','privateDashboardAdminRevoke',
  'privateDashboardAdminRestoreEligibility','privateDashboardAdminSetTrustedEmployee',
  'privateDashboardSyncRoster','phoneStockAuthorizeRead_','phoneStockAuthorizePublish_',
  'threecAuthorizeRead_','privateDashboardThreecRead_'
];
let privateDashboardAuthFrames_ = [];

function privateDashboardAuthBoundaryEnabled_() {
  // Source-only boundary fixtures have no GAS release switch. Concrete GAS
  // candidates preserve native A while off; only host-held synthetic Script
  // identities may exercise adapters without enabling a real deployment.
  return typeof PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ === 'undefined' ||
    PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ === true ||
    (typeof ScriptApp !== 'undefined' && /^SYNTHETIC_[A-Z_]+$/.test(String(ScriptApp.getScriptId())));
}

function privateDashboardAuthOwnerConfig_() {
  const owner = String(privateDashboardProperties().getProperty('DASHBOARD_AUTH_OWNER_SCRIPT_ID') || '');
  const current = String(ScriptApp.getScriptId() || '');
  if (!/^[A-Za-z0-9_-]{12,120}$/.test(owner) || !/^[A-Za-z0-9_-]{12,120}$/.test(current)) {
    throw new Error('AUTH_OWNER_CONFIGURATION_REQUIRED');
  }
  return { owner:owner, current:current };
}

function privateDashboardRequireAuthOwner_() {
  if (!privateDashboardAuthBoundaryEnabled_()) return;
  const config = privateDashboardAuthOwnerConfig_();
  if (config.current !== config.owner) throw new Error('AUTH_OWNER_ONLY');
}

function privateDashboardAuthProvider_() {
  privateDashboardRequireAuthOwner_();
  if (typeof privateDashboardAuthNativeProvider_ !== 'function') throw new Error('AUTH_NATIVE_PROVIDER_REQUIRED');
  const provider = privateDashboardAuthNativeProvider_();
  if (!provider || typeof provider.assertNativeEntry !== 'function' ||
      typeof provider.begin !== 'function' || typeof provider.complete !== 'function') {
    throw new Error('AUTH_NATIVE_PROVIDER_REQUIRED');
  }
  return provider;
}

function privateDashboardAuthRun_(operation, args, run) {
  if (!privateDashboardAuthBoundaryEnabled_()) return run();
  const config = privateDashboardAuthOwnerConfig_();
  const input = Array.prototype.slice.call(args);
  if (config.current !== config.owner) {
    if (PRIVATE_DASHBOARD_AUTH_OPERATIONS_.indexOf(operation) < 0 ||
        typeof privateDashboardAuthOwnerTransport_ !== 'function') throw new Error('AUTH_OWNER_UNAVAILABLE');
    // The endpoint/provider is host-held. No request field selects an owner.
    if (operation === 'threecAuthorizeRead_' && typeof privateDashboardGasThreecPayload_ === 'function') {
      if (input.length !== 1) throw new Error('AUTH_REQUEST_INVALID');
      const payload = privateDashboardGasThreecPayload_(input[0]);
      delete payload.kind; // The legacy helper never reads business data, even when its caller has kind.
      const reply = privateDashboardAuthOwnerTransport_(config.owner,'privateDashboardThreecRead_',[payload]);
      if (!reply || reply.employeeId !== payload.employeeId) throw new Error('AUTH_OWNER_DENIED');
      return reply.employeeId;
    }
    return privateDashboardAuthOwnerTransport_(config.owner, operation, input);
  }
  return privateDashboardRosterTransaction_(function() {
    const provider = privateDashboardAuthProvider_();
    const frame = { operation:operation, args:input, receipt:null };
    privateDashboardAuthFrames_.push(frame);
    try {
      provider.assertNativeEntry(operation, input);
      const result = run();
      SpreadsheetApp.flush();
      if (frame.receipt) provider.complete(frame.receipt);
      return result;
    } finally {
      // Failed native mutations retain their pending fence/deny. Only a
      // successful, validated owner operation may complete that transition.
      privateDashboardAuthFrames_.pop();
    }
  });
}

function privateDashboardAuthNativeBegin_(operation, args) {
  if (!privateDashboardAuthBoundaryEnabled_()) return;
  privateDashboardRequireAuthOwner_();
  const frame = privateDashboardAuthFrames_[privateDashboardAuthFrames_.length - 1];
  if (!frame || frame.operation !== operation || frame.receipt) throw new Error('AUTH_OWNER_OPERATION_REQUIRED');
  frame.receipt = privateDashboardAuthProvider_().begin(operation, Array.prototype.slice.call(args));
}

function privateDashboardAuthResumeNative_(operation, employeeId) {
  if (!privateDashboardAuthBoundaryEnabled_()) return false;
  privateDashboardRequireAuthOwner_();
  const frame = privateDashboardAuthFrames_[privateDashboardAuthFrames_.length - 1];
  if (!frame || frame.operation !== operation) throw new Error('AUTH_OWNER_OPERATION_REQUIRED');
  const provider = privateDashboardAuthProvider_();
  return typeof provider.canResume === 'function' && provider.canResume(operation, employeeId) === true;
}

function privateDashboardAuthSheetKind_(sheet, headers) {
  const name = sheet && typeof sheet.getName === 'function' ? String(sheet.getName()) : '';
  const key = Array.isArray(headers) ? headers.join('|') : '';
  if (name === PRIVATE_DASHBOARD_USERS_SHEET) return 'users';
  if (name === PRIVATE_DASHBOARD_REQUESTS_SHEET) return 'requests';
  if (key === PRIVATE_DASHBOARD_USERS_HEADERS.join('|') || key === PRIVATE_DASHBOARD_REQUEST_HEADERS.join('|')) {
    throw new Error('AUTH_SHEET_IDENTITY_REQUIRED');
  }
  return '';
}

function privateDashboardAuthGuardSheet_(sheet, headers) {
  const kind = privateDashboardAuthSheetKind_(sheet, headers);
  if (!privateDashboardAuthBoundaryEnabled_()) return kind;
  if (!kind) return '';
  privateDashboardRequireAuthOwner_();
  const expected = kind === 'users' ? PRIVATE_DASHBOARD_USERS_HEADERS : PRIVATE_DASHBOARD_REQUEST_HEADERS;
  if (!Array.isArray(headers) || headers.join('|') !== expected.join('|')) throw new Error('AUTH_SHEET_SCHEMA_REQUIRED');
  return kind;
}

function privateDashboardAuthGuardSheetName_(name, headers) {
  if (name !== PRIVATE_DASHBOARD_USERS_SHEET && name !== PRIVATE_DASHBOARD_REQUESTS_SHEET) return;
  privateDashboardAuthGuardSheet_({getName:function() { return name; }}, headers);
}

function privateDashboardAuthGuardRoster_(roster) {
  if (!privateDashboardAuthBoundaryEnabled_()) return roster;
  // Existing callers require these two methods only. Never expose a raw
  // Spreadsheet/getSheets/getSheetById capability to a nonowner runtime.
  const guard = function(name) {
    if (name === PRIVATE_DASHBOARD_USERS_SHEET || name === PRIVATE_DASHBOARD_REQUESTS_SHEET) {
      privateDashboardRequireAuthOwner_();
    }
  };
  return {
    getSheetByName:function(name) { guard(name); return roster.getSheetByName(name); },
    insertSheet:function(name) { guard(name); return roster.insertSheet(name); }
  };
}
