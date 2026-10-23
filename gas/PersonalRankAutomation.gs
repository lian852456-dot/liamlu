// Compatibility for the existing non-exportable publication signing helper.
// No provisioning, credential mutation, general login or full-component writes.
const PERSONAL_RANK_AUTOMATION_VERSION = 'north12b-automation-hmac-v1';
const PERSONAL_RANK_AUTOMATION_SCOPES = ['kpi.read','kpi.write','awards.read','awards.write','haosu.read','metadata.read','identity.revoke'];
const PERSONAL_RANK_AUTOMATION_ACTIONS = ['private_admin_snapshot_status','private_access','kpicalc_access','private_publish_kpi_component'];

function personalRankAutomationEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) mismatch |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return mismatch === 0;
}

function personalRankAutomationHex_(bytes) {
  return bytes.map(function(value) { return ('0' + (value & 255).toString(16)).slice(-2); }).join('');
}

function personalRankAutomationNonce_(props, identity, nonce, timestamp) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const raw = props.getProperty('NORTH12B_AUTOMATION_NONCE_LEDGER');
    let ledger;
    try { ledger = JSON.parse(raw || '{}'); } catch (error) { throw new Error('RANK_AUTH_NONCE_LEDGER_INVALID'); }
    if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) throw new Error('RANK_AUTH_NONCE_LEDGER_INVALID');
    const cutoff = Math.floor(Date.now() / 1000) - 600;
    Object.keys(ledger).forEach(function(key) {
      if (!Number.isFinite(ledger[key])) throw new Error('RANK_AUTH_NONCE_LEDGER_INVALID');
      if (ledger[key] < cutoff) delete ledger[key];
    });
    const key = privateDashboardHash(identity + ':' + nonce);
    if (Object.prototype.hasOwnProperty.call(ledger, key)) throw new Error('RANK_AUTH_REPLAY');
    if (Object.keys(ledger).length >= 80) throw new Error('RANK_AUTH_NONCE_CAPACITY');
    ledger[key] = timestamp;
    props.setProperty('NORTH12B_AUTOMATION_NONCE_LEDGER', JSON.stringify(ledger));
  } finally { lock.releaseLock(); }
}

function personalRankAutomationVerified_(payload) {
  const fields = ['action','automationAuthVersion','automationId','automationAudience','automationTimestamp','automationNonce','automationDataBase64','automationSignature'];
  privateDashboardRankShape_(payload, fields);
  const action = String(payload.action || '');
  if (payload.automationAuthVersion !== PERSONAL_RANK_AUTOMATION_VERSION || PERSONAL_RANK_AUTOMATION_ACTIONS.indexOf(action) < 0) throw new Error('RANK_AUTH_ACTION');
  const props = privateDashboardProperties();
  if (String(props.getProperty('NORTH12B_AUTOMATION_REVOKED_AT') || '').trim()) throw new Error('RANK_AUTH_REVOKED');
  const configuredId = String(props.getProperty('NORTH12B_AUTOMATION_ID') || '').trim();
  const secret = String(props.getProperty('NORTH12B_AUTOMATION_SECRET') || '');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(configuredId) || secret.length < 32) throw new Error('RANK_AUTH_NOT_CONFIGURED');
  if (payload.automationId !== configuredId) throw new Error('RANK_AUTH_IDENTITY');
  const timestamp = payload.automationTimestamp;
  if (!Number.isSafeInteger(timestamp) || !/^\d{10}$/.test(String(timestamp)) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300) throw new Error('RANK_AUTH_EXPIRED');
  const nonce = payload.automationNonce;
  if (!/^[A-Za-z0-9_-]{24,128}$/.test(String(nonce || ''))) throw new Error('RANK_AUTH_NONCE');
  const audience = String(props.getProperty('NORTH12B_AUTOMATION_AUDIENCE') || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(audience) || payload.automationAudience !== audience || ScriptApp.getService().getUrl() !== audience) throw new Error('RANK_AUTH_AUDIENCE');
  const data64 = payload.automationDataBase64;
  if (typeof data64 !== 'string' || !data64 || data64.length > 2 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(data64) || data64.length % 4) throw new Error('RANK_AUTH_PAYLOAD');
  const signature = payload.automationSignature;
  if (!/^[a-f0-9]{64}$/.test(String(signature || ''))) throw new Error('RANK_AUTH_SIGNATURE');
  const signingText = [PERSONAL_RANK_AUTOMATION_VERSION,configuredId,audience,String(timestamp),nonce,action,privateDashboardHash(data64)].join('\n');
  const expected = personalRankAutomationHex_(Utilities.computeHmacSha256Signature(signingText, secret));
  if (!personalRankAutomationEqual_(signature, expected)) throw new Error('RANK_AUTH_SIGNATURE');
  let data;
  try { data = JSON.parse(Utilities.newBlob(Utilities.base64Decode(data64)).getDataAsString('UTF-8')); } catch (error) { throw new Error('RANK_AUTH_PAYLOAD'); }
  const write = action === 'private_publish_kpi_component';
  privateDashboardRankShape_(data, write ? ['rankPatchBase64','expectedKpiPayloadHash','expectedProtectedKpiPayloadHash','expectedSnapshotPayloadHash'] : []);
  if (write && !data.rankPatchBase64) throw new Error('RANK_AUTH_RANK_PATCH_REQUIRED');
  const scopes = String(props.getProperty('NORTH12B_AUTOMATION_SCOPES') || '').split(/[;,\s]+/).filter(Boolean);
  if (!scopes.length || scopes.some(function(scope) { return PERSONAL_RANK_AUTOMATION_SCOPES.indexOf(scope) < 0; })) throw new Error('RANK_AUTH_SCOPES_CONFIG');
  const required = action === 'kpicalc_access' ? ['kpi.read','haosu.read'] : ['kpi.read','awards.read','haosu.read'];
  if (write) required.push('kpi.write','metadata.read');
  if (action === 'private_admin_snapshot_status') required.push('metadata.read');
  if (required.some(function(scope) { return scopes.indexOf(scope) < 0; })) throw new Error('RANK_AUTH_SCOPE');
  // Persist replay protection only after all signature, payload and scope checks.
  personalRankAutomationNonce_(props, configuredId, nonce, timestamp);
  return { action: action, data: data };
}

function personalRankAutomationStoredSnapshot_() {
  const file = privateDashboardLatestSnapshotFile_();
  if (!file) throw new Error('RANK_PARENT_MISSING');
  const snapshot = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!snapshot || !snapshot.kpiBattle || !snapshot.awardsBattle) throw new Error('RANK_PARENT_INVALID');
  return snapshot;
}

function personalRankAutomationDispatch_(request) {
  if (request.action === 'private_publish_kpi_component') return privateDashboardPublishRankPatch_(request.data);
  if (request.action === 'kpicalc_access') {
    const file = kpiCalcLatestDataFile();
    if (!file) throw new Error('RANK_PARENT_MISSING');
    const data = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
    if (!data || !data.meta || !Array.isArray(data.persons) || !Array.isArray(data.stores)) throw new Error('RANK_PARENT_INVALID');
    return { data: data };
  }
  // The ordinary display reader attaches virtual components. A CAS parent must
  // be the stored file itself; never persist those unrelated display additions.
  if (request.action === 'private_access') return { snapshot: personalRankAutomationStoredSnapshot_() };
  const snapshot = personalRankAutomationStoredSnapshot_();
  return { kpiReportDate: snapshot.kpiBattle.report_date, awardsReportDate: snapshot.awardsBattle.report_date,
    kpiComponentRunId: snapshot.kpiBattle.kpi_run_id, publishedAt: snapshot.publishedAt,
    kpiPayloadHash: privateDashboardRankHash_(snapshot.kpiBattle), snapshotPayloadHash: privateDashboardRankHash_(snapshot) };
}

function personalRankAutomationMaybePost_(payload, event) {
  if (!Object.keys(payload || {}).some(function(key) { return key.indexOf('automation') === 0; })) return null;
  const request = personalRankAutomationVerified_(payload);
  return privateDashboardPostResponse(Object.assign({ status: 'ok' }, personalRankAutomationDispatch_(request)), event);
}
