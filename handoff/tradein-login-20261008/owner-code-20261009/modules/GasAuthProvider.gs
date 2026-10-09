// GAS-native native-authority provider. No Node APIs, new KDF, credentials,
// logging, resource creation, implicit initialization or cross-project stores.
function privateDashboardCreateGasAuthProvider_(options) {
  privateDashboardGasAuthGate_(options);
  privateDashboardRequireAuthOwner_();
  const store = options.store;
  if (!store || typeof store.transaction !== 'function' || typeof store.read !== 'function') throw new Error('AUTH_STATE_REQUIRED');
  const mutations = ['privateDashboardAdminRevoke','privateDashboardAdminRestoreEligibility','privateDashboardSyncRoster','privateDashboardAdminSetTrustedEmployee'];
  const receipts = new WeakSet(), snapshots = new WeakSet();
  const canonical = function(id) { return privateDashboardCleanEmployeeId(id); };
  const nativeUsers = function() {
    return privateDashboardRows(privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS), PRIVATE_DASHBOARD_USERS_HEADERS);
  };
  function subject(state, id) {
    if (!Object.prototype.hasOwnProperty.call(state.subjects, id)) {
      if (Object.keys(state.subjects).length >= 64) throw new Error('AUTH_CAPACITY');
      state.subjects[id] = {generation:0,denied:false,pending:null};
    }
    return state.subjects[id];
  }
  function assertEmployee(id) {
    return store.read(function(state) {
      const row = state.subjects[id];
      if (row && (row.denied || row.pending)) throw new Error('NATIVE_ELIGIBILITY_DENIED');
      return true;
    });
  }
  function intent(operation, id, payload) {
    const target = operation === 2 ? (payload.members || []).filter(function(m) { return canonical(m.employeeId) === id; })[0] : null;
    const meaning = operation === 2 ? [id,String(target.store || ''),String(target.role || ''),target.status === 'inactive' ? 'inactive' : 'active'] :
      operation === 3 ? [canonical(payload.employeeId)] : [id];
    return privateDashboardGasAuthDigest_(JSON.stringify(meaning)).slice(0,32);
  }
  function begin(operation, args) {
    const code = mutations.indexOf(operation), payload = args[0] || {};
    if (code < 0) throw new Error('NATIVE_OPERATION_INVALID');
    return store.transaction(function(state) {
      let ids;
      if (code === 2) {
        const previous = Object.create(null);
        nativeUsers().forEach(function(row) { previous[row.employee_id] = row; });
        ids = (payload.members || []).filter(function(m) {
          const id = canonical(m.employeeId), row = previous[id], current = state.subjects[id];
          return (!row || row.status !== 'revoked') && (current && current.pending && current.pending.operation === code ||
            !row || row.status !== (m.status === 'inactive' ? 'inactive' : 'active') || row.store !== String(m.store || '') || row.role !== String(m.role || ''));
        }).map(function(m) { return canonical(m.employeeId); });
      } else if (code === 3) {
        const target = canonical(payload.employeeId), fingerprint = intent(code, target, payload);
        ids = [privateDashboardProperties().getProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID'), target].filter(Boolean).map(canonical);
        // The prior trusted property may already have changed before a failure.
        Object.keys(state.subjects).forEach(function(id) {
          const pending = state.subjects[id].pending;
          if (pending && pending.operation === code && pending.intent === fingerprint) ids.push(id);
        });
      } else ids = [canonical(payload.employeeId)];
      ids = Array.from(new Set(ids));
      if (!ids.length) return null;
      ids.forEach(function(id) {
        const row = subject(state, id), fingerprint = intent(code, id, payload);
        if (code > 1 && row.pending && (row.pending.operation !== code || row.pending.intent !== fingerprint)) throw new Error('NATIVE_TRANSITION_CONFLICT');
      });
      const versions = ids.map(function(id) {
        const row = subject(state, id); row.generation++;
        if (!Number.isSafeInteger(row.generation)) throw new Error('AUTH_CAPACITY');
        if (code < 2) row.denied = true;
        row.pending = {operation:code,version:row.generation,intent:intent(code,id,payload)};
        return row.generation;
      });
      const receipt = Object.freeze({operation:code,ids:ids,versions:versions});
      receipts.add(receipt); return receipt;
    });
  }
  function complete(receipt) {
    if (!receipts.has(receipt)) throw new Error('NATIVE_RECEIPT_REQUIRED');
    store.transaction(function(state) {
      receipt.ids.forEach(function(id,index) {
        const row = state.subjects[id];
        if (!row || !row.pending || row.pending.operation !== receipt.operation ||
            row.pending.version !== receipt.versions[index] || row.generation !== receipt.versions[index]) throw new Error('NATIVE_TRANSITION_REQUIRED');
      });
      receipt.ids.forEach(function(id) {
        const row = state.subjects[id]; row.generation++;
        if (!Number.isSafeInteger(row.generation)) throw new Error('AUTH_CAPACITY');
        if (receipt.operation === 1) row.denied = false;
        row.pending = null;
      });
    });
    receipts.delete(receipt);
  }
  function assertNativeEntry(operation, args) {
    const payload = args[0] || {}, reads = ['privateDashboardAccess','kpiCalcAccess','privateDashboardRequestBinding','privateDashboardRequestStatus',
      'privateDashboardRecordLogin_','phoneStockTrustedUser_','phoneStockAuthorizeRead_','phoneStockAuthorizePublish_','threecAuthorizeRead_','privateDashboardThreecRead_','departmentGoldAuthorizedUser_'];
    let id = reads.indexOf(operation) >= 0 ? operation === 'privateDashboardRecordLogin_' ? payload : payload.employeeId : null;
    if (operation === 'kpiCalcSetupSelf') id = privateDashboardProperties().getProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID');
    if (operation === 'privateDashboardAdminApprove') {
      privateDashboardAdminAuthorized(payload);
      const requests = privateDashboardRows(privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS),PRIVATE_DASHBOARD_REQUEST_HEADERS);
      const request = requests.filter(function(r) { return r.request_id === payload.requestId; })[0];
      id = request && request.employee_id;
    }
    if (id) assertEmployee(canonical(id));
  }
  function capture(employee) {
    const id = canonical(employee);
    return privateDashboardRosterTransaction_(function() {
      assertEmployee(id);
      const user = privateDashboardUserByEmployeeId(id).user;
      if (user && user.status !== 'active') throw new Error('NATIVE_ELIGIBILITY_DENIED');
      const snapshot = store.read(function(state) { return Object.freeze({employee:id,generation:(state.subjects[id] || {}).generation || 0}); });
      snapshots.add(snapshot); return snapshot;
    });
  }
  function commit(snapshot, run) {
    if (!snapshots.has(snapshot) || typeof run !== 'function') throw new Error('AUTH_SNAPSHOT_REQUIRED');
    return privateDashboardRosterTransaction_(function() {
      assertEmployee(snapshot.employee);
      const user = privateDashboardUserByEmployeeId(snapshot.employee).user;
      if (user && user.status !== 'active') throw new Error('NATIVE_ELIGIBILITY_DENIED');
      return store.read(function(state) {
        if (((state.subjects[snapshot.employee] || {}).generation || 0) !== snapshot.generation) throw new Error('AUTH_GENERATION_CHANGED');
        const result = run();
        if (result && typeof result.then === 'function') throw new Error('AUTH_ASYNC_TRANSACTION_FORBIDDEN');
        return result;
      });
    });
  }
  return Object.freeze({assertNativeEntry:assertNativeEntry,begin:begin,complete:complete,
    canResume:function(operation,id) { return operation === mutations[1] && store.read(function(state) {
      const row = state.subjects[canonical(id)];return Boolean(row && row.denied && row.pending && row.pending.operation === 1);
    }); },
    capture:capture,commit:commit,withEligibility:function(id,run) { return commit(capture(id),run); },
    // Host-only source for the existing verifier/session core. It cannot be
    // selected, overridden or supplied as a generation by an RPC caller.
    currentGeneration:function(employee) { const id=canonical(employee);return store.read(function(state) { return (state.subjects[id] || {}).generation || 0; }); },
    eligibilityStatus:function(employee) { const id=canonical(employee);return privateDashboardRosterTransaction_(function() {
      return store.read(function(state) {
        const row=state.subjects[id],user=privateDashboardUserByEmployeeId(id).user;
        return row && (row.denied || row.pending) || user && user.status !== 'active' ? 'blocked' : 'allowed';
      });
    }); }
  });
}
