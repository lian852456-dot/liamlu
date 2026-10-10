// Browser-native B transport. Optional same-tab short-lived proof; no password persistence.
function createDashboardBClient(ownerExecUrl, options={}) {
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(ownerExecUrl))throw new Error('OWNER_ENDPOINT_REQUIRED');
  const storage=options.storage,storageKey='north12b_password_session_v1';
  let session=null,generation=0,expiresAt=0,lastDeviceId='';
  function removeSaved(){try{storage?.removeItem(storageKey);}catch{}}
  function savedSession(deviceId){
    try {
      const value=JSON.parse(storage?.getItem(storageKey)||'null');
      if(!value)return null;
      if(value.v!==1 || value.owner!==ownerExecUrl || value.logoutEpoch!==(options.logoutEpoch?.()||'') || value.deviceId!==deviceId ||
        !/^B1_[a-f0-9]_[a-f0-9]{64}$/.test(value.token) || !Number.isSafeInteger(value.expiresAt) ||
        value.expiresAt<=Date.now() || value.expiresAt>Date.now()+1800000)throw Error('B_AUTH_DENIED');
      return value;
    }catch{removeSaved();return null;}
  }
  const requests=new Set(),hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  function suspend(){generation++;session=null;expiresAt=0;for(const controller of requests)controller.abort();requests.clear();}
  function clear(){suspend();removeSaved();}
  async function post(payload,expected=generation,transport=fetch) {
    const controller=new AbortController();requests.add(controller);
    const timer=setTimeout(()=>controller.abort(),90000);
    try {
      const response=await transport(ownerExecUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),
        credentials:'omit',cache:'no-store',redirect:'follow',signal:controller.signal});
      if(!response.ok)throw new Error('B_AUTH_DENIED');const value=await response.json();
      if(expected!==generation)throw new Error('B_CONTEXT_CHANGED');
      if(controller.signal.aborted)throw new Error('B_TIMEOUT');
      if(!value || value.status!=='ok')throw new Error('B_AUTH_DENIED');return value;
    } catch(error){if(expected!==generation)throw new Error('B_CONTEXT_CHANGED');if(controller.signal.aborted)throw new Error('B_TIMEOUT');throw error;}
    finally {clearTimeout(timer);requests.delete(controller);}
  }
  async function protectedPost(action) {
    if(!session || expiresAt<=Date.now()){clear();throw new Error('B_AUTH_DENIED');}const expected=generation,proof=session;
    try {return await post({action,...proof},expected);}
    catch(error){if(expected===generation)clear();throw error;}
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
    async read(kind) {if(!['private','kpi'].includes(kind))throw new Error('B_AUTH_DENIED');return protectedPost(kind==='private'?'employee_private_read':'employee_kpi_read');},
    validate:()=>protectedPost('employee_session'),
    restore(deviceId){suspend();lastDeviceId=deviceId;const value=savedSession(deviceId);if(!value)return null;session={deviceId:value.deviceId,token:value.token};expiresAt=value.expiresAt;return {expiresAt};},
    suspend,
    async logout(transport=fetch) {const previous=session||savedSession(lastDeviceId);clear();if(previous)await post({action:'employee_logout',deviceId:previous.deviceId,token:previous.token},generation,transport);},
    clear
  });
}
