// Browser-native B transport. Memory-only proof, pinned owner, one POST, no retries.
function createDashboardBClient(ownerExecUrl) {
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(ownerExecUrl))throw new Error('OWNER_ENDPOINT_REQUIRED');
  let session=null,generation=0;
  const requests=new Set(),hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  function clear(){generation++;session=null;for(const controller of requests)controller.abort();requests.clear();}
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
    if(!session)throw new Error('B_AUTH_DENIED');const expected=generation,proof=session;
    try {return await post({action,...proof},expected);}
    catch(error){if(expected===generation)clear();throw error;}
  }
  return Object.freeze({
    status:()=>post({action:'employee_status'}),
    async login(employeeId,deviceId,password) {
      clear();const expected=generation;
      const nonce=hex(crypto.getRandomValues(new Uint8Array(32))),idem=hex(crypto.getRandomValues(new Uint8Array(16)));
      const result=await post({action:'employee_login',employeeId,deviceId,track:'password-bound',password,sessionNonce:nonce,idempotencyKey:idem},expected);
      if(expected!==generation || !/^B1_[a-f0-9]_[a-f0-9]{64}$/.test(result.token)||!Number.isSafeInteger(result.expiresAt)||result.trustSource!=='password-bound')throw new Error('B_AUTH_DENIED');
      session={deviceId,token:result.token};return {expiresAt:result.expiresAt,trustSource:result.trustSource};
    },
    async read(kind) {if(!['private','kpi'].includes(kind))throw new Error('B_AUTH_DENIED');return protectedPost(kind==='private'?'employee_private_read':'employee_kpi_read');},
    validate:()=>protectedPost('employee_session'),
    async logout(transport=fetch) {const previous=session;clear();if(previous)await post({action:'employee_logout',...previous},generation,transport);},
    clear
  });
}
