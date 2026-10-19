// Short-lived B sessions; optional primary-owner phone grant. Passwords are never saved.
function createDashboardBClient(ownerExecUrl, options={}) {
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(ownerExecUrl))throw new Error('OWNER_ENDPOINT_REQUIRED');
  const storage=options.storage,storageKey='north12b_password_session_v1';
  const phoneStorage=options.phoneStorage,phoneKey='north12b_owner_phone_v1',phoneTtl=90*24*60*60*1000;
  let session=null,generation=0,expiresAt=0,lastDeviceId='',lastPhoneToken='';
  function removeSaved(){try{storage?.removeItem(storageKey);}catch{}}
  function sessionState(name){try{options.onSessionState?.(name);}catch{}}
  function savedSession(deviceId){
    let reason='invalid';
    try {
      const value=JSON.parse(storage?.getItem(storageKey)||'null');
      if(!value){sessionState('missing');return null;}
      if(value.logoutEpoch!==(options.logoutEpoch?.()||'')){reason='epoch';throw Error('B_AUTH_DENIED');}
      if(value.deviceId!==deviceId){reason='device';throw Error('B_AUTH_DENIED');}
      if(Number.isSafeInteger(value.expiresAt)&&value.expiresAt<=Date.now()){reason='expired';throw Error('B_AUTH_DENIED');}
      if(value.v!==1 || value.owner!==ownerExecUrl || value.logoutEpoch!==(options.logoutEpoch?.()||'') || value.deviceId!==deviceId ||
        !/^B1_[a-f0-9]_[a-f0-9]{64}$/.test(value.token) || !Number.isSafeInteger(value.expiresAt) ||
        value.expiresAt<=Date.now() || value.expiresAt>Date.now()+1800000)throw Error('B_AUTH_DENIED');
      sessionState('restored');return value;
    }catch{sessionState(reason);removeSaved();return null;}
  }
  const requests=new Set(),reads=new Map(),hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  function removePhone(){try{phoneStorage?.removeItem(phoneKey);}catch{}}
  function savedPhone(deviceId){
    try {
      const p=JSON.parse(phoneStorage?.getItem(phoneKey)||'null');if(!p)return null;
      if(p.v!==1 || p.owner!==ownerExecUrl || p.deviceId!==deviceId || p.logoutEpoch!==(options.logoutEpoch?.()||'') ||
        !/^BP1_[a-f0-9]{64}$/.test(p.phoneToken) || !Number.isSafeInteger(p.expiresAt) || p.expiresAt<=Date.now() || p.expiresAt>Date.now()+phoneTtl)throw Error('B_AUTH_DENIED');
      return p;
    }catch{removePhone();return null;}
  }
  function savePhone(p){if(!phoneStorage)throw Error('B_STORAGE_UNAVAILABLE');phoneStorage.setItem(phoneKey,JSON.stringify(p));}
  function saveLease(result,deviceId,expected){
    if(expected!==generation || !/^B1_[a-f0-9]_[a-f0-9]{64}$/.test(result.token) || !Number.isSafeInteger(result.expiresAt) || result.trustSource!=='password-bound' || result.expiresAt<=Date.now() || result.expiresAt>Date.now()+1800000)throw Error('B_AUTH_DENIED');
    session={deviceId,token:result.token};expiresAt=result.expiresAt;
    if(storage)storage.setItem(storageKey,JSON.stringify({v:1,owner:ownerExecUrl,logoutEpoch:options.logoutEpoch?.()||'',...session,expiresAt}));
    return {expiresAt,trustSource:result.trustSource};
  }
  function suspend(){generation++;session=null;expiresAt=0;reads.clear();for(const controller of requests)controller.abort();requests.clear();}
  function clear(){suspend();removeSaved();}
  async function post(payload,expected=generation,transport=fetch) {
    const clock=()=>typeof performance==='object'?performance.now():Date.now();
    const controller=new AbortController(),started=clock();let outcome='error';requests.add(controller);
    const timer=setTimeout(()=>controller.abort(),90000);
    try {
      let response;
      try{response=await transport(ownerExecUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),
        credentials:'omit',cache:'no-store',redirect:'follow',signal:controller.signal});}
      catch{throw new Error('B_NETWORK_UNAVAILABLE');}
      if(!response.ok)throw new Error('B_SERVICE_UNAVAILABLE');
      let value;try{value=await response.json();}catch{throw new Error('B_RESPONSE_INVALID');}
      if(expected!==generation)throw new Error('B_CONTEXT_CHANGED');
      if(controller.signal.aborted)throw new Error('B_TIMEOUT');
      if(!value || Array.isArray(value) || typeof value.status!=='string')throw new Error('B_RESPONSE_INVALID');
      if(value.status!=='ok')throw new Error('B_AUTH_DENIED');
      if(Array.isArray(value.serverTiming)&&value.serverTiming.length<=40){for(const row of value.serverTiming){
        if(row && /^(lockWait|flush|rosterLookup|privateDrive|kpiLocate|strictNative|resultValidation|kpiBlob|request)$/.test(row.name) &&
          Number.isFinite(row.ms)&&row.ms>=0&&row.ms<600000)try{options.onServerTiming?.({action:payload.action,name:row.name,ms:row.ms});}catch{}
      }}outcome='ok';return value;
    } catch(error){if(expected!==generation)throw new Error('B_CONTEXT_CHANGED');if(controller.signal.aborted)throw new Error('B_TIMEOUT');throw error;}
    finally {clearTimeout(timer);requests.delete(controller);try{options.onRequest?.({action:payload.action,ms:clock()-started,outcome});}catch{}}
  }
  function protectedPost(action,extra={}) {
    const key=action+JSON.stringify(extra);
    if(reads.has(key))return reads.get(key);
    const operation=protectedRead(action,extra);reads.set(key,operation);
    const done=()=>{if(reads.get(key)===operation)reads.delete(key);};operation.then(done,done);return operation;
  }
  async function protectedRead(action,extra) {
    if(!session || expiresAt<=Date.now()){clear();throw new Error('B_AUTH_DENIED');}const expected=generation,proof=session;
    // A failed read or an inconclusive server response must lock the view, but
    // the short lease can still be checked again without asking for a password.
    // The server verifies eligibility, revocation and device proof on every call.
    return post({action,...proof,...extra},expected);
  }
  return Object.freeze({
    status:()=>post({action:'employee_status'}),
    async login(employeeId,deviceId,password) {
      clear();lastDeviceId=deviceId;const expected=generation;
      const nonce=hex(crypto.getRandomValues(new Uint8Array(32))),idem=hex(crypto.getRandomValues(new Uint8Array(16)));
      const result=await post({action:'employee_login',employeeId,deviceId,track:'password-bound',password,sessionNonce:nonce,idempotencyKey:idem},expected);
      if(expected!==generation || !/^B1_[a-f0-9]_[a-f0-9]{64}$/.test(result.token)||!Number.isSafeInteger(result.expiresAt)||result.trustSource!=='password-bound')throw new Error('B_AUTH_DENIED');
      session={deviceId,token:result.token};expiresAt=result.expiresAt;
      if(expiresAt<=Date.now() || expiresAt>Date.now()+1800000){clear();throw Error('B_AUTH_DENIED');}
      if(storage){try{storage.setItem(storageKey,JSON.stringify({v:1,owner:ownerExecUrl,logoutEpoch:options.logoutEpoch?.()||'',...session,expiresAt}));}
        catch{try{await post({action:'employee_logout',...session});}finally{clear();}throw Error('B_STORAGE_UNAVAILABLE');}}
      return {expiresAt,trustSource:result.trustSource};
    },
    hasPhone(deviceId=lastDeviceId){return Boolean(savedPhone(deviceId));},
    async enrollPhone(){
      if(!session || !phoneStorage)throw Error('B_AUTH_DENIED');
      const expected=generation,proof=session;
      const result=await post({action:'employee_phone_enroll',...proof,phoneNonce:hex(crypto.getRandomValues(new Uint8Array(32)))},expected);
      if(!/^BP1_[a-f0-9]{64}$/.test(result.phoneToken) || !Number.isSafeInteger(result.expiresAt) || result.expiresAt<=Date.now() || result.expiresAt>Date.now()+phoneTtl)throw Error('B_AUTH_DENIED');
      try{savePhone({v:1,owner:ownerExecUrl,logoutEpoch:options.logoutEpoch?.()||'',deviceId:proof.deviceId,phoneToken:result.phoneToken,expiresAt:result.expiresAt});}
      catch{removePhone();await post({action:'employee_phone_forget',deviceId:proof.deviceId,phoneToken:result.phoneToken},expected);throw Error('B_STORAGE_UNAVAILABLE');}
      lastPhoneToken=result.phoneToken;return {expiresAt:result.expiresAt};
    },
    async resumePhone(deviceId){
      const p=savedPhone(deviceId);if(!p)return null;
      suspend();lastDeviceId=deviceId;lastPhoneToken=p.phoneToken;const expected=generation;
      // Reuse a lease request across app closures/tabs, avoiding extra server sessions.
      if(!p.request || p.request.until<=Date.now()) {
        p.request={sessionNonce:hex(crypto.getRandomValues(new Uint8Array(32))),idempotencyKey:hex(crypto.getRandomValues(new Uint8Array(16))),until:Date.now()+1800000};
        savePhone(p);
      }
      let result;
      try {result=await post({action:'employee_phone_resume',deviceId,phoneToken:p.phoneToken,sessionNonce:p.request.sessionNonce,idempotencyKey:p.request.idempotencyKey},expected);}
      catch(error){
        // A rejected grant cannot authorize another session. Discard only this
        // stale local proof so a fresh password login is not blocked while
        // trying to forget a grant the server no longer recognizes.
        if(error.message==='B_AUTH_DENIED'){removePhone();lastPhoneToken='';}
        throw error;
      }
      if(!Number.isSafeInteger(result.phoneExpiresAt) || result.phoneExpiresAt<=Date.now() || result.phoneExpiresAt>Date.now()+phoneTtl)throw Error('B_AUTH_DENIED');
      try{const lease=saveLease(result,deviceId,expected);p.expiresAt=result.phoneExpiresAt;p.request.until=lease.expiresAt;savePhone(p);return lease;}
      catch{clear();removePhone();try{await post({action:'employee_phone_forget',deviceId,phoneToken:p.phoneToken},generation);}finally{lastPhoneToken='';}throw Error('B_STORAGE_UNAVAILABLE');}
    },
    async read(kind) {if(!['private','kpi'].includes(kind))throw new Error('B_AUTH_DENIED');return protectedPost(kind==='private'?'employee_private_read':'employee_kpi_read');},
    async readBundle(includeReports=false) {
      const result=await protectedPost('employee_dashboard_read',includeReports===true?{includeReports:true}:{});
      if(result.expiresAt!==expiresAt || result.trustSource!=='password-bound' || typeof result.phoneEligible!=='boolean' ||
        result.privateResult?.status!=='ok' || result.kpiResult?.status!=='ok' ||
        includeReports===true && (result.reportsResult?.schema!=='daily-report-bundle-v1' || !Array.isArray(result.reportsResult.segments) || result.reportsResult.segments.length!==3))throw new Error('B_AUTH_DENIED');
      return result;
    },
    validate:()=>protectedPost('employee_session'),
    restore(deviceId){suspend();lastDeviceId=deviceId;const value=savedSession(deviceId);if(!value)return null;session={deviceId:value.deviceId,token:value.token};expiresAt=value.expiresAt;lastPhoneToken=savedPhone(deviceId)?.phoneToken||'';return {expiresAt};},
    suspend,
    async logout(transport=fetch) {const previous=session||savedSession(lastDeviceId),saved=savedPhone(lastDeviceId),phone=lastPhoneToken?{deviceId:lastDeviceId,phoneToken:lastPhoneToken}:null;clear();if(saved && saved.phoneToken===lastPhoneToken)removePhone();lastPhoneToken='';
      // Forget retires all phone leases and is idempotent if another tab already revoked it.
      if(phone)await post({action:'employee_phone_forget',deviceId:phone.deviceId,phoneToken:phone.phoneToken},generation,transport);
      else if(previous)await post({action:'employee_logout',deviceId:previous.deviceId,token:previous.token},generation,transport);
    },
    clear
  });
}
