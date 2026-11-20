import test from 'node:test';
import assert from 'node:assert/strict';
import {createNorth12BReadonlyGateway} from '../north12b-readonly-20261111/readonly-gateway.mjs';
const time=Date.parse('2026-11-11T01:00:00Z');
function fixture(){
 const identity={source:'B_LOCKED_SESSION',accountKind:'employee',active:true,employeeId:'QA10001',store:'三創',sessionEpoch:'qa-session',expiresAt:time+60000};
 const mapping={schema:'north12b-gold-employee-map/v1',revision:1,entries:[{employeeId:identity.employeeId,personKey:'qa-person-001',store:'三創',alias:'合成甲',validFrom:'2026-11-01',validUntil:'2026-11-30',evidenceId:'qa-confirmation-001',status:'confirmed'}]};
 const ledger={schema:'north12b-daily-gold/v1',region:'北一二B',updatedAt:'2026-11-10T13:00:00Z',settlements:[{date:'2026-11-10',status:'confirmed',source:'qa-readonly-source',recordedAt:'2026-11-10T13:00:00Z',rows:[{personKey:'qa-person-001',store:'三創',alias:'合成甲',balance:23,reason:'合成資料',exemption:''}]}]};
 return {identity,mapping,ledger};
}
test('gateway returns only verified owner projection and rejects target IDs before any read',async()=>{
 const f=fixture();let reads=0;
 const g=createNorth12BReadonlyGateway({verifyOwner:async()=>f.identity,readLedger:async()=>{reads++;return structuredClone(f.ledger);},readMapping:async()=>f.mapping,now:()=>time});
 await assert.rejects(g.read({}, {employeeId:'OTHER'}),/FIELDS_INVALID/);assert.equal(reads,0);
 const r=await g.read({});assert.equal(r.balance,23);assert.equal(r.readOnly,true);assert.equal(r.exchangeEnabled,false);
 assert.equal(reads,2);assert.equal(r.employeeId,'QA10001');
});
test('revocation and owner change during source reads deny result',async()=>{
 for(const change of [{active:false},{employeeId:'QA10002'},{sessionEpoch:'changed'}]){
  const f=fixture();let n=0;
  const g=createNorth12BReadonlyGateway({verifyOwner:async()=>++n===1?f.identity:{...f.identity,...change},readLedger:async()=>f.ledger,readMapping:async()=>f.mapping,now:()=>time});
  await assert.rejects(g.read({}),/FORMAL_OWNER_REQUIRED|OWNER_CHANGED/);
 }
});
test('source correction with same date and source label denies mixed read',async()=>{
 const f=fixture();let n=0;
 const g=createNorth12BReadonlyGateway({verifyOwner:async()=>f.identity,readLedger:async()=>{const l=structuredClone(f.ledger);if(++n>1)l.settlements[0].rows[0].balance=24;return l;},readMapping:async()=>f.mapping,now:()=>time});
 await assert.rejects(g.read({}),/SOURCE_CHANGED_DURING_READ/);
});
