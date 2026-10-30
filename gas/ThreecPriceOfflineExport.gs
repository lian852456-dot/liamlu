// New google.script.run entry only; existing public price routes stay unchanged.
// The existing manager code and server-side employee allowlist are rechecked on
// every request. No new password, token, session, scope or permission is added.
function threec_export_readonly(payload) {
  reportUploadAuthorize_(payload);
  const input = payload || {};
  threecAllowedKeys_(input, ['employeeId','adminSecret','expectedActiveHashes'], '唯讀匯出請求');
  const expected = input.expectedActiveHashes;
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      Object.keys(expected).sort().join(',') !== 'shopping,tradein' ||
      ['shopping','tradein'].some(function(kind) { return !/^[a-f0-9]{32,64}$/.test(String(expected[kind] || '')); })) {
    throw new Error('請先完成發布收據與正式版本核對，再下載唯讀版。');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let responses;
  try {
    const registry = threecRegistry_();
    responses = {};
    ['shopping','tradein'].forEach(function(kind) {
      const active = registry.kinds[kind].active;
      if (!active) throw new Error('手機與舊換新兩類正式資料均發布後，才可匯出完整唯讀版。');
      if (String(active.snapshot_hash) !== expected[kind]) throw new Error('正式版本已變更，請重新核對後再下載。');
      const readback = threecReadActive_(kind, {registry:registry,includeChanges:false});
      if (!readback.snapshot || readback.snapshot.snapshot_hash !== expected[kind]) throw new Error('正式價格版本核對失敗，停止匯出。');
      // The existing public projection strips file IDs, operator identity and
      // registry history. No client preview or credential is passed to assembly.
      responses[kind] = ThreecPriceTransport.encode(Object.assign({status:'ok'}, threecPublicResult_({snapshot:readback.snapshot})));
    });
  } finally {
    lock.releaseLock();
  }
  const projected = ThreecPriceOfflineCore.projectResponses(responses);
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(projected));
  const payloadSha256 = digest.map(function(byte) { return ('0' + (byte < 0 ? byte + 256 : byte).toString(16)).slice(-2); }).join('');
  const result = ThreecPriceOfflineCore.assemble(THREEC_PRICE_OFFLINE_ASSETS.template, projected, {
    generatedAt:new Date().toISOString(),sourceCommit:THREEC_PRICE_OFFLINE_ASSETS.sourceCommit,payloadSha256:payloadSha256
  });
  const dates = result.manifest.sources;
  const fileName = '門市查價_手機' + dates.shopping.source_version_date.replace(/-/g,'') + '_舊換新' + dates.tradein.source_version_date.replace(/-/g,'') + '_' +
    Utilities.formatDate(new Date(result.manifest.generatedAt),'Asia/Taipei','yyyyMMdd-HHmmss') + '.html';
  return {status:'ok',fileName:fileName,html:result.html,manifest:result.manifest};
}
