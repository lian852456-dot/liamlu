const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Core=require('../gold-daily-core.js');
const row=(balance,personKey='test-person-01')=>({personKey,store:'三創',alias:'測試',balance,reason:'',exemption:''});
const day=(date,rows)=>({date,status:'confirmed',source:'測試確認總表',recordedAt:'2026-09-30T00:00:00Z',rows});
const ledger=(settlements)=>Core.validate({schema:Core.SCHEMA,region:'北一二B',updatedAt:'2026-09-30T00:00:00Z',settlements});
test('confirmed balances are snapshots; first date and gaps do not invent daily changes',()=>{
 const data=ledger([day('2026-09-29',[row(10)]),day('2026-09-30',[row(7)]),day('2026-10-02',[row(20)])]);
 assert.deepEqual(Core.changes(data).map(x=>x.delta),[null,-3,null]);
 assert.equal(Core.latest(data).rows[0].balance,20);
 assert.equal(Core.latest(data,'2026-09-30').rows[0].balance,7);
});
test('new people are not treated as starting from zero',()=>{
 const data=ledger([day('2026-09-29',[row(10)]),day('2026-09-30',[row(15,'test-person-02')])]);
 assert.equal(Core.changes(data)[1].delta,null);
});
test('rejects ambiguous dates, people, unconfirmed status and nonnumeric balances',()=>{
 for(const entries of [
   [day('2026-02-30',[row(1)])],
   [day('2026-09-29',[row(1),row(2)])],
   [day('2026-09-29',[row(1)]),day('2026-09-29',[row(2)])],
   [{...day('2026-09-29',[row(1)]),status:'draft'}],
   [day('2026-09-29',[{...row(1),balance:null}])]
 ]) assert.throws(()=>ledger(entries));
});
test('supervisor reader stays protected while store reader accepts anonymous read-only access',()=>{
 let reads=0;
 const context=vm.createContext({North12BGoldDaily:Core,ptRequireSession_:()=>{throw new Error('unauthorized')},departmentGoldAuthorizedUser_:()=>{throw new Error('device not approved')},departmentOpsFolder_:()=>{reads++;throw new Error('unexpected Drive read')}});
 vm.runInContext(fs.readFileSync(require.resolve('../gas/GoldDaily.gs'),'utf8'),context);
 const source=fs.readFileSync(require.resolve('../gas/Code.gs'),'utf8');
 const access=source.slice(source.indexOf('function departmentGoldAccess(payload) {'),source.indexOf('// ═',source.indexOf('function departmentGoldAccess(payload) {')));
 vm.runInContext(access,context);
 assert.throws(()=>context.north12bGoldDailyRead({}),/unauthorized/);
 assert.equal(reads,0);
 context.north12bGoldDailyLedger_=()=>({safe:'relay-aliases'});
 assert.equal(context.departmentGoldAccess({}).ledger.safe,'relay-aliases');
});
test('private ledger is validated and only safe fields reach the viewer',()=>{
 const data={schema:Core.SCHEMA,region:'北一二B',updatedAt:'2026-09-30T00:00:00Z',settlements:[day('2026-09-29',[{...row(20),employeeId:'PRIVATE-ID'}])]};
 const context=vm.createContext({North12BGoldDaily:Core,departmentOpsFolder_:()=>({getFilesByName:()=>{let read=false;return {hasNext:()=>!read,next:()=>{read=true;return {getLastUpdated:()=>new Date(),getBlob:()=>({getDataAsString:()=>JSON.stringify(data)})}}}}})});
 vm.runInContext(fs.readFileSync(require.resolve('../gas/GoldDaily.gs'),'utf8'),context);
 const result=context.north12bGoldDailyLedger_();
 assert.equal(result.settlements[0].rows[0].balance,20);
 assert.equal(result.settlements[0].rows[0].employeeId,undefined);
});
