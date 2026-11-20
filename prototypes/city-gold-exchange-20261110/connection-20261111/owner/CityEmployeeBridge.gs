// ISOLATED CANDIDATE. Requires a deployed server policy and normal B-session proof.
// City-only handoff. Original B tokens, passwords and device IDs never leave
// the existing owner service. The city keeps the redemption secret server-side.
var CityEmployeeBridge = (function () {
  var AUDIENCE='north12b-city-formal-login',PREFIX='CITY_EMPLOYEE_LINK_V1_',INDEX=PREFIX+'INDEX';
  // Candidate policy is server-owned; no policy value is accepted from browsers.
  var MAX_LEASE_MS=30*60*1000;
  var PILOTS={'5511180':'三創','5513075':'通化','5514420':'三創'};
  function check(test,code){if(!test)throw new Error(code);}
  function shape(value,keys){check(value&&typeof value==='object'&&!Array.isArray(value),'CITY_LINK_REQUEST');Object.keys(value).forEach(function(k){check(keys.indexOf(k)>=0,'CITY_LINK_FIELDS');});}
  function create(c){
    check(c&&c.properties&&typeof c.verifyBinding==='function'&&typeof c.withLock==='function','CITY_LINK_ADAPTER_REQUIRED');
    var props=c.properties,now=c.now||Date.now;
    function gate(){
      c.assertDeployment();
      var p=c.withLock(function(){
        var current=typeof c.readPolicy==='function'?c.readPolicy():null;
        var key=PREFIX+'POLICY_GUARD',seen=JSON.parse(props.getProperty(key)||'null');
        if(!current){if(seen){seen.revoked=true;props.setProperty(key,JSON.stringify(seen));}return null;}
        check(current.schema==='city-owner-policy/v1'&&typeof current.enabled==='boolean'&&/^[A-Za-z0-9_-]{8,80}$/.test(current.id)&&
          Number.isSafeInteger(current.generation)&&current.generation>0&&Number.isSafeInteger(current.notBefore)&&Number.isSafeInteger(current.validUntil),
          'CITY_LINK_POLICY_INVALID');
        var fp=c.sha(JSON.stringify([current.id,current.generation,current.enabled,current.notBefore,current.validUntil]));
        if(seen&&current.generation===seen.generation&&fp!==seen.fingerprint){seen.revoked=true;props.setProperty(key,JSON.stringify(seen));}
        check(!seen||current.generation>seen.generation||current.generation===seen.generation&&!seen.revoked&&fp===seen.fingerprint,'CITY_LINK_POLICY_ROLLBACK');
        if(!seen||current.generation>seen.generation){seen={generation:current.generation,fingerprint:fp,revoked:false};props.setProperty(key,JSON.stringify(seen));check(props.getProperty(key)===JSON.stringify(seen),'CITY_LINK_POLICY_PERSISTENCE');}
        return Object.assign({},current,{id:current.id+':'+current.generation+':'+fp});
      });
      check(p&&p.enabled&&p.notBefore<=now()&&now()<p.validUntil,'CITY_LINK_POLICY_INACTIVE');return p;
    }

    function digest(value){return c.sha(String(value));}
    function load(hash){var raw=props.getProperty(PREFIX+hash);return raw?JSON.parse(raw):null;}
    function save(hash,row){var bytes=JSON.stringify(row);check(bytes.length<8000,'CITY_LINK_CAPACITY');props.setProperty(PREFIX+hash,bytes);check(props.getProperty(PREFIX+hash)===bytes,'CITY_LINK_PERSISTENCE');}
    function prune(){var ids=JSON.parse(props.getProperty(INDEX)||'[]');check(Array.isArray(ids)&&ids.length<=64,'CITY_LINK_INDEX');ids=ids.filter(function(id){var row=load(id);if(!row||row.expiresAt<=now()){props.deleteProperty(PREFIX+id);return false;}return true;});return ids;}
    function principal(row){
      var policy=gate();check(row&&row.policyId===policy.id&&row.expiresAt>now()&&PILOTS[row.employeeId]===row.store,'CITY_LINK_DENIED');
      var who=c.verifyBinding(row.binding);
      check(who&&who.source==='B_LOCKED_SESSION'&&who.active===true&&who.employeeId===row.employeeId&&who.store===row.store&&
        who.sessionEpoch===row.sessionEpoch&&Number.isSafeInteger(who.expiresAt)&&who.expiresAt>now(),'CITY_LINK_SESSION_CHANGED');
      check(gate().id===policy.id,'CITY_LINK_POLICY_CHANGED');
      return {source:'B_LOCKED_SESSION',accountKind:'employee',active:true,employeeId:row.employeeId,store:row.store,
        sessionEpoch:row.sessionEpoch,expiresAt:Math.min(row.expiresAt,who.expiresAt,policy.validUntil),policyId:policy.id,audience:AUDIENCE,
        worldId:row.worldId,challengeId:row.challengeId,nonceHash:row.nonceHash,
        authorityReceipt:'city-owner:'+digest(JSON.stringify([row.employeeId,row.sessionEpoch,row.challengeId,row.nonceHash,row.expiresAt]))};
    }
    // Called only inside the unchanged B-session authorization transaction.
    function issueVerified(verified,input){
      var policy=gate();shape(input,['challengeId','nonceHash','audience','worldId']);
      check(input.audience===AUDIENCE&&/^[A-Za-z0-9_-]{24,100}$/.test(input.challengeId)&&/^[a-f0-9]{64}$/.test(input.nonceHash)&&
        ['current-guests','legacy-owners'].indexOf(input.worldId)>=0,'CITY_LINK_SCOPE');
      check(verified&&PILOTS[verified.employeeId]===verified.store&&verified.active===true&&verified.source==='B_LOCKED_SESSION'&&
        typeof verified.sessionEpoch==='string'&&verified.expiresAt>now()&&verified.binding,'CITY_LINK_EMPLOYEE_REQUIRED');
      var code='CH1_'+digest(JSON.stringify(['city-handoff/v1',policy.id,verified.binding,verified.sessionEpoch,input.challengeId,input.nonceHash,input.worldId])),codeHash=digest(code);
      var prior=load(codeHash),ids=prune();
      if(prior){check(prior.codeExpiresAt>now(),'CITY_LINK_PROOF');if(ids.indexOf(codeHash)<0){check(ids.length<64,'CITY_LINK_CAPACITY');ids.push(codeHash);props.setProperty(INDEX,JSON.stringify(ids));}return {status:'ok',schema:'city-employee-handoff/v1',code:code,challengeId:input.challengeId,expiresAt:prior.codeExpiresAt};}
      check(ids.length<64,'CITY_LINK_CAPACITY');
      var row={policyId:policy.id,employeeId:verified.employeeId,store:verified.store,sessionEpoch:verified.sessionEpoch,
        expiresAt:Math.min(verified.expiresAt,policy.validUntil,now()+MAX_LEASE_MS),codeExpiresAt:Math.min(now()+120000,verified.expiresAt,policy.validUntil),
        worldId:input.worldId,challengeId:input.challengeId,nonceHash:input.nonceHash,binding:verified.binding,consumed:false};
      ids.push(codeHash);props.setProperty(INDEX,JSON.stringify(ids));check(props.getProperty(INDEX)===JSON.stringify(ids),'CITY_LINK_PERSISTENCE');save(codeHash,row);
      return {status:'ok',schema:'city-employee-handoff/v1',code:code,challengeId:input.challengeId,expiresAt:row.codeExpiresAt};
    }
    function redeem(input){
      gate();shape(input,['code','redemptionNonce','challengeId','worldId']);
      check(/^CH1_[a-f0-9]{64}$/.test(input.code)&&/^[A-Za-z0-9_-]{40,100}$/.test(input.redemptionNonce),'CITY_LINK_PROOF');
      var hash=digest(input.code),row=load(hash);
      check(row&&row.codeExpiresAt>now()&&row.challengeId===input.challengeId&&row.worldId===input.worldId&&
        row.nonceHash===digest(input.redemptionNonce),'CITY_LINK_PROOF');
      principal(row);
      var token='CL1_'+hash+'_'+digest(input.code+':'+input.redemptionNonce),leaseHash=digest(token);
      c.withLock(function(){var fresh=load(hash);check(fresh&&JSON.stringify(fresh)===JSON.stringify(row),'CITY_LINK_CHANGED');
        if(fresh.consumed)check(fresh.leaseHash===leaseHash,'CITY_LINK_REPLAY');
        else{fresh.consumed=true;fresh.leaseHash=leaseHash;save(hash,fresh);}});
      var identity=principal(load(hash));
      return {status:'ok',schema:'city-employee-owner/v1',leaseToken:token,identity:identity};
    }
    function validate(input){
      gate();shape(input,['leaseToken','worldId']);check(/^CL1_[a-f0-9]{64}_[a-f0-9]{64}$/.test(input.leaseToken),'CITY_LINK_PROOF');
      var row=load(input.leaseToken.split('_')[1]);check(row&&row.consumed===true&&row.leaseHash===digest(input.leaseToken)&&row.worldId===input.worldId,'CITY_LINK_PROOF');
      return {status:'ok',schema:'city-employee-owner/v1',identity:principal(row)};
    }
    return {issueVerified:issueVerified,redeem:redeem,validate:validate,info:function(){var policy=gate();return {status:'ok',schema:'city-employee-bridge/v1',audience:AUDIENCE,policyId:policy.id,deadline:policy.validUntil,maxLeaseMs:MAX_LEASE_MS,originalTokensExported:false,serverTime:now()};}};
  }
  return {create:create,audience:AUDIENCE};
})();
