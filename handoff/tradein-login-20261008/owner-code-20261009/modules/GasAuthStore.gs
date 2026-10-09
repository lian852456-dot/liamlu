// Candidate only. Every production entry remains disabled. Synthetic mode
// additionally requires a synthetic ScriptApp identity, never a payload flag.
const PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ = false;
const PRIVATE_DASHBOARD_GAS_AUTH_STATE_KEY_ = 'DASHBOARD_AUTH_NATIVE_V1';
const PRIVATE_DASHBOARD_GAS_AUTH_NONCE_PREFIX_ = 'DASHBOARD_AUTH_RPC_V1_';

function privateDashboardGasAuthGate_(options) {
  const synthetic = options && options.mode === 'LOCAL_SYNTHETIC_ONLY' &&
    /^SYNTHETIC_[A-Z_]+$/.test(String(ScriptApp.getScriptId()));
  if (!synthetic && PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ !== true) throw new Error('AUTH_RELEASE_DISABLED');
  return synthetic;
}

function privateDashboardGasAuthDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value))
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function privateDashboardGasAuthJson_(value, maxBytes) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string' || encodeURIComponent(text).replace(/%[A-F0-9]{2}/g, 'x').length > maxBytes) {
    throw new Error('AUTH_CAPACITY');
  }
  return text;
}

function privateDashboardCreateGasAuthStore_(options) {
  privateDashboardGasAuthGate_(options);
  privateDashboardRequireAuthOwner_();
  const config = privateDashboardAuthOwnerConfig_();
  const props = options.properties || privateDashboardProperties();
  const now = options.now || function() { return Date.now(); };
  function writeChecked(key, value) {
    const text = privateDashboardGasAuthJson_(value, 8000);
    props.setProperty(key, text);
    if (props.getProperty(key) !== text) throw new Error('AUTH_PERSISTENCE_FAILED');
  }
  function readState() {
    const text = props.getProperty(PRIVATE_DASHBOARD_GAS_AUTH_STATE_KEY_);
    if (!text || text.length > 8000) throw new Error('AUTH_STATE_REQUIRED');
    let state;
    try { state = JSON.parse(text); } catch (_) { throw new Error('AUTH_STATE_INVALID'); }
    if (!state || Object.keys(state).sort().join('|') !== 'owner|revision|subjects|v' || state.v !== 1 ||
        state.owner !== config.owner || !Number.isSafeInteger(state.revision) || state.revision < 0 ||
        !state.subjects || Array.isArray(state.subjects) || typeof state.subjects !== 'object' ||
        Object.keys(state.subjects).length > 64) throw new Error('AUTH_STATE_INVALID');
    Object.keys(state.subjects).forEach(function(id) {
      const row = state.subjects[id];
      if (!/^[A-Z0-9]{5,12}$/.test(id) || !row || Object.keys(row).sort().join('|') !== 'denied|generation|pending' ||
          !Number.isSafeInteger(row.generation) || row.generation < 0 || typeof row.denied !== 'boolean' ||
          row.pending !== null && (!row.pending || Object.keys(row.pending).sort().join('|') !== 'intent|operation|version' ||
            !Number.isInteger(row.pending.operation) || row.pending.operation < 0 || row.pending.operation > 3 ||
            row.pending.version !== row.generation || !/^[a-f0-9]{32}$/.test(row.pending.intent))) {
        throw new Error('AUTH_STATE_INVALID');
      }
    });
    return state;
  }
  function transaction(run) {
    return privateDashboardRosterTransaction_(function() {
      const state = readState(), result = run(state);
      if (result && typeof result.then === 'function') throw new Error('AUTH_ASYNC_TRANSACTION_FORBIDDEN');
      state.revision++;
      if (!Number.isSafeInteger(state.revision)) throw new Error('AUTH_CAPACITY');
      writeChecked(PRIVATE_DASHBOARD_GAS_AUTH_STATE_KEY_, state);
      return result;
    });
  }
  function read(run) { return privateDashboardRosterTransaction_(function() { return run(readState()); }); }
  function consumeRequest(requestId, issuedAt) {
    // Sixteen bounded buckets; no getProperties(), credential reads, persisted
    // request bodies, responses, actor names, devices or credential digests.
    return privateDashboardRosterTransaction_(function() {
      const current = now();
      if (!/^[A-Za-z0-9_-]{20,80}$/.test(requestId) || !Number.isSafeInteger(issuedAt) ||
          issuedAt > current + 30000 || issuedAt < current - 120000) throw new Error('AUTH_REQUEST_EXPIRED');
      const digest = privateDashboardGasAuthDigest_(requestId), key = PRIVATE_DASHBOARD_GAS_AUTH_NONCE_PREFIX_ + digest[0];
      const text = props.getProperty(key);
      if (!text || text.length > 8000) throw new Error('AUTH_REPLAY_STATE_REQUIRED');
      let bucket;
      try { bucket = JSON.parse(text); } catch (_) { throw new Error('AUTH_REPLAY_STATE_INVALID'); }
      if (!bucket || Object.keys(bucket).sort().join('|') !== 'entries|owner|v' || bucket.v !== 1 ||
          bucket.owner !== config.owner || !Array.isArray(bucket.entries) || bucket.entries.length > 64 ||
          bucket.entries.some(function(e) { return !Array.isArray(e) || e.length !== 2 ||
            !/^[a-f0-9]{64}$/.test(e[0]) || e[0][0] !== digest[0] || !Number.isSafeInteger(e[1]); }) ||
          new Set(bucket.entries.map(function(e) { return e[0]; })).size !== bucket.entries.length) throw new Error('AUTH_REPLAY_STATE_INVALID');
      bucket.entries = bucket.entries.filter(function(e) { return e[1] >= current; });
      if (bucket.entries.some(function(e) { return e[0] === digest; })) throw new Error('AUTH_REPLAY_DENIED');
      if (bucket.entries.length >= 64) throw new Error('AUTH_CAPACITY');
      // Retain beyond the maximum accepted request timestamp lifetime, including
      // clock skew. The nonce is consumed before the native operation can write.
      bucket.entries.push([digest, issuedAt + 150000]);
      writeChecked(key, bucket);
    });
  }
  readState();
  return Object.freeze({transaction:transaction,read:read,consumeRequest:consumeRequest});
}
