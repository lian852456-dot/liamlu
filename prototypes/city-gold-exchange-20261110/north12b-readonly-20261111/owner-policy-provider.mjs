import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function createOwnerPolicyProvider({info,now=Date.now}) {
  if(typeof info!=='function')throw Error('OWNER_INFO_REQUIRED');
  let current=null,pending=null,readAt=0;
  function validate(r){
    const p=r?.policy;
    if(r?.status!=='ok'||r.schema!=='city-employee-bridge/v1'||r.audience!=='north12b-city-formal-login'||
      !p||p.schema!=='city-owner-policy/v1'||p.enabled!==true||!/^north12b-owner-[a-f0-9]{32}$/.test(p.id)||
      !Number.isSafeInteger(p.generation)||p.generation<1||!Number.isSafeInteger(p.notBefore)||
      !Number.isSafeInteger(p.validUntil)||p.notBefore>now()||p.validUntil<=now()||
      r.deadline!==p.validUntil||r.maxLeaseMs!==1800000||r.originalTokensExported!==false)
      throw Error('OWNER_POLICY_UNAVAILABLE');
    const fp=sha(JSON.stringify([p.id,p.generation,p.enabled,p.notBefore,p.validUntil]));
    if(r.policyId!==p.id+':'+p.generation+':'+fp)throw Error('OWNER_POLICY_MISMATCH');
    return Object.freeze({...p});
  }
  return Object.freeze({
    read:()=>current,
    async refresh(){
      if(current&&now()-readAt<15000&&current.validUntil>now())return current;
      if(pending)return pending;
      pending=(async()=>{try{current=validate(await info());readAt=now();return current;}
        catch(e){current=null;throw Object.assign(Error(e.message||'OWNER_SERVICE_UNAVAILABLE'),{code:'OWNER_SERVICE_UNAVAILABLE',status:503});}finally{pending=null;}})();
      return pending;
    }
  });
}
