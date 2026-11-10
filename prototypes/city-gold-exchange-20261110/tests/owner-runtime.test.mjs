import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {buildOwnerRepair} from '../north12b-readonly-20261111/build-owner-repair.mjs';
import {createOwnerPolicyProvider} from '../north12b-readonly-20261111/owner-policy-provider.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const runtime=`function cityEmployeeBridgeRuntime_() {
 return CityEmployeeBridge.create({properties:privateDashboardProperties(),now:function(){return Date.now();},
 sha:privateDashboardGasAuthDigest_,assertDeployment:function(){},withLock:privateDashboardRosterTransaction_,verifyBinding:function(){throw Error('NO_SESSION');}});
}`;
test('production runtime derives lifetime from existing authority, never renews it',async()=>{
 const props=new Map(),time=Date.now(),authority={version:12,sourceHash:'a'.repeat(64),effectiveAt:time-1000,validUntil:time+60000};
 const context=vm.createContext({Date,privateDashboardCreateGasBStore_:()=>({config:()=>({authority})}),
  privateDashboardProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)}),
  privateDashboardGasAuthDigest_:sha,privateDashboardRosterTransaction_:f=>f()});
 vm.runInContext(buildOwnerRepair(runtime),context);
 const before=JSON.stringify(authority),result=context.cityEmployeeBridgeRuntime_().info();
 assert.equal(result.deadline,authority.validUntil);assert.equal(result.policy.generation,authority.version);
 assert.equal(result.maxLeaseMs,1800000);assert.equal(JSON.stringify(authority),before);
 const provider=createOwnerPolicyProvider({info:async()=>result});await provider.refresh();assert.equal(provider.read().validUntil,authority.validUntil);
 authority.validUntil=time-1;authority.version++;
 assert.throws(()=>context.cityEmployeeBridgeRuntime_().info(),/POLICY_INACTIVE/);
 assert.equal(authority.validUntil,time-1);
});
test('owner policy provider clears stale cached policy on denial; malformed replies fail closed',async()=>{
 let time=100000,calls=0,fail=false;
 const policy={schema:'city-owner-policy/v1',id:'north12b-owner-'+ 'a'.repeat(32),generation:1,enabled:true,notBefore:time-1,validUntil:time+60000};
 const result={status:'ok',schema:'city-employee-bridge/v1',audience:'north12b-city-formal-login',policy,
  policyId:policy.id+':1:'+sha(JSON.stringify([policy.id,1,true,policy.notBefore,policy.validUntil])),deadline:policy.validUntil,maxLeaseMs:1800000,originalTokensExported:false};
 const provider=createOwnerPolicyProvider({now:()=>time,info:async()=>{calls++;if(fail)throw Error('DENIED');return result;}});
 await Promise.all([provider.refresh(),provider.refresh()]);assert.equal(calls,1);
 time+=16000;fail=true;await assert.rejects(provider.refresh(),/DENIED/);assert.equal(provider.read(),null);
 for(const override of [{policyId:'forged'}, {maxLeaseMs:3600000},{audience:'other'},{originalTokensExported:true}]){
  const p=createOwnerPolicyProvider({now:()=>100000,info:async()=>({...result,...override})});
  await assert.rejects(p.refresh());assert.equal(p.read(),null);
 }
});
test('repair builder requires exact runtime anchor and policy hook stays readonly',()=>{
 assert.throws(()=>buildOwnerRepair('old missing source'),/RUNTIME_MISMATCH/);
 assert.throws(()=>buildOwnerRepair(runtime+runtime),/RUNTIME_MISMATCH/);
 const hook=fs.readFileSync(new URL('../north12b-readonly-20261111/OwnerPolicyRuntime.gs',import.meta.url),'utf8');
 assert.doesNotMatch(hook,/setProperty|writeFile|validUntil\s*[:=]\s*.*Date\.now/);
});
