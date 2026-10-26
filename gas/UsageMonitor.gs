/* Isolated candidate. Not installed into doPost, no production adapter or credentials.
 * Every enabled call requires server-owned verifiers and a transactional private store.
 * Never pass request-controlled claims/config/verifiers to this factory. */
function createPlatformUsageService(deps) {
  'use strict';
  deps=deps||{};
  const core=PlatformUsageCore, now=deps.now||Date.now;
  function denied(code) { return {status:'error',code:code||'USAGE_DENIED'}; }
  function config() {
    const c=deps.config && deps.config();
    if(!c || c.enabled!==true || c.noticeApproved!==true || c.retentionApproved!==true ||
      c.ownerVerificationApproved!==true || c.storageApproved!==true || !c.ownerSubject ||
      !Number.isSafeInteger(c.since) || c.since>now() || !c.features ||
      typeof deps.transaction!=='function')throw Error('USAGE_DISABLED');
    return c;
  }
  function audit(state,action,subject,allowed,requestId) {
    (state.audit||=[]).push({at:now(),action,subject:subject||'unverified',allowed,requestId});
  }
  function read(request) {
    let c;
    try{c=config();}catch{return denied('USAGE_DISABLED');}
    // A fresh server-side verifier call for every read, including repeated/filter requests.
    let identity=null, validRequest=false;
    try {
      core.shape(request,['action','proof','filters']);
      if(request.action!=='usage_read')throw Error('USAGE_DENIED');
      if(typeof request.proof!=='string'||request.proof.length>4096)throw Error('USAGE_DENIED');
      core.filters(request.filters,now());
      validRequest=true;
    } catch { validRequest=false; }
    const fingerprint=JSON.stringify(c);
    try {
      return deps.transaction(state=>{
        Object.assign(state,core.prune(state,now()));
        let allowed=false;
        try {
          if(validRequest && JSON.stringify(config())===fingerprint) {
            identity=deps.verifyOwner?.(request.proof);
            allowed=!!identity && identity.method==='independent-owner' && identity.subject===c.ownerSubject &&
              identity.scope==='usage:read' && identity.revoked===false && Number.isSafeInteger(identity.expiresAt) && identity.expiresAt>now();
          }
        } catch {allowed=false;}
        const requestId=deps.uuid();
        // Denials must also be auditable. No caller-supplied names, query results, credentials or raw error text.
        audit(state,'read',allowed?identity.subject:null,allowed,requestId);
        if(!allowed)return denied();
        const report=core.aggregate(state.events||[],state.roster,{filters:request.filters,now:now(),since:c.since,availableFrom:Math.max(c.since,now()-30*core.DAY),features:c.features});
        report.quality={...state.quality};
        return {status:'ok',report,expiresAt:identity.expiresAt};
      });
    } catch { return denied('USAGE_UNAVAILABLE'); }
  }
  function ingest(request) {
    let c;try{c=config();}catch{return denied('USAGE_DISABLED');}
    try {
      core.shape(request,['action','proof','lease','events']);
      if(request.action!=='usage_ingest'||typeof request.proof!=='string'||request.proof.length>4096||typeof request.lease!=='string'||request.lease.length>2048||!Array.isArray(request.events)||request.events.length<1||request.events.length>20||JSON.stringify(request).length>16000)throw Error();
      const fingerprint=JSON.stringify(c);
      return deps.transaction(state=>{
        if(JSON.stringify(config())!==fingerprint)throw Error();
        // Validate after transaction admission so a lock wait cannot retain old eligibility.
        const identity=deps.verifyEmployee(request.proof), lease=deps.verifyLease(request.lease),time=now();
        if(!identity || identity.level!=='verified-account' || !identity.actor || !identity.session || identity.revoked!==false ||
          !Number.isSafeInteger(identity.expiresAt)||identity.expiresAt<=time ||
          !lease || lease.actor!==identity.actor || lease.session!==identity.session || lease.revoked!==false ||
          !Number.isSafeInteger(lease.from)||!Number.isSafeInteger(lease.until)||lease.until<=time||lease.from>time||
          lease.from<c.since || lease.until-lease.from>1800000)throw Error();
        const clean=core.prune(state,time);Object.assign(state,clean);
        state.quality||={duplicate:0,rejected:0,accepted:0};state.events||=[];state.rates||={};
        const key=identity.actor+':'+Math.floor(time/60000);
        // A private adapter must enforce transaction and size/rate admission without using the business auth lock.
        state.rates=Object.fromEntries(Object.entries(state.rates).filter(([k])=>Number(k.split(':').at(-1))>=Math.floor(time/60000)-1));
        if((state.rates[key]||0)>=4)return denied('USAGE_RATE_LIMIT');state.rates[key]=(state.rates[key]||0)+1;
        const ack={accepted:[],duplicate:[],rejected:[]};
        request.events.forEach(input=>{
          let row,member;try{
            row=core.event(input,time,lease);if(row.at<c.since||c.features[row.feature]!=='connected')throw Error();
            member=deps.rosterAt(identity.actor,row.at);
            if(!member||member.actor!==identity.actor||typeof member.store!=='string'||!member.store||
              !Number.isSafeInteger(member.from)||!Number.isSafeInteger(member.until)||
              member.from>(row.start??row.at)||member.until<=row.at||!Array.isArray(member.features)||!member.features.includes(row.feature))throw Error();
          }
          catch { state.quality.rejected++;ack.rejected.push(typeof input?.id==='string'&&/^[a-f0-9-]{36}$/.test(input.id)?input.id:null);return; }
          // Identity participates in idempotency. One account cannot claim another account's event ID.
          if(state.events.some(x=>x.id===row.id&&x.actor===identity.actor)){state.quality.duplicate++;ack.duplicate.push(row.id);return;}
          state.events.push({...row,actor:identity.actor,store:member.store,receivedAt:time,identity:'verified-account',metricVersion:'engaged-v1'});
          state.quality.accepted++;ack.accepted.push(row.id);
        });
        return {status:'ok',ack};
      });
    } catch {return denied();}
  }
  return Object.freeze({
    read,ingest,
    export:function(){return denied('USAGE_EXPORT_DISABLED');},
    // No default route can fall through to legacy supervisor/admin credentials.
    handle:function(request){
      if(request?.action==='usage_read')return read(request);
      if(request?.action==='usage_ingest')return ingest(request);
      if(request?.action==='usage_export')return denied('USAGE_EXPORT_DISABLED');
      return denied();
    }
  });
}
