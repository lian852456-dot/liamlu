const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const C=require('../department-gold-monthly-core.js'),X=require('../assets/vendor/xlsx.full.min.js');
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');
const record=(medal=10,extra={})=>({employeeId:'DEMO001',employeeName:'示*甲',region:'北一二A',storeCode:'SYN-A',store:'合成一店',role:'合成職稱',medal,sourceRow:8,sourceFields:[{column:'Q',header:'活動金牌',value:999}],...extra});
const month=(key='2026-09',medal=10,extra={})=>C.validateMonth({schema:C.SCHEMA,monthKey:key,sheetName:'動員(全員)',sourceName:'synthetic.xlsx',sourceHash:hash(key+medal),dateRange:{start:key+'-01',end:key+'-28',cutoff:key+'-28'},settlementStatus:'provisional',records:[record(medal)],validation:{sourceTotal:medal},...extra});
function workbook({medal=10,total=10,shift=0,duplicate=false,formula=false}={}){
  const pad=r=>Array(shift).fill(null).concat(r);
  const rows=[pad(['資料日期 : 2026/09/01~09/28',...Array(13).fill(null),'SPE加分總計','金牌']),pad(['Y26/9_北一二(全員)']),pad(['部','區域','區域','督導區','營業店點代碼','服務中心','店內職稱','員編','員工姓名','職級','正/派','9M(含)以上','其他','店型',null,null,'活動金牌']),pad(['北一區','北一二','北一二區','北一二A','SYN-A','合成一店','合成職稱','DEMO001','示*甲',null,null,null,null,null,500,medal,999])];
  if(duplicate)rows.push(rows[3]);
  rows.push(pad(['北一區','北一二','北一二區','北一二',null,'統計',null,null,null,null,null,null,null,null,500,total]));
  const sheet=X.utils.aoa_to_sheet(rows);if(formula)sheet[X.utils.encode_cell({r:3,c:15+shift})].f='1+9';
  return {SheetNames:['動員(全員)','PK賽'],Sheets:{'動員(全員)':sheet,'PK賽':X.utils.aoa_to_sheet([['不納入',1000]])}};
}
test('semantic main gold follows shifted headers and ignores SPE, PK and activity gold',()=>{
  for(const shift of [0,3]){const [m]=C.parseWorkbook(workbook({shift}),X,{sourceName:'synthetic.xlsx',sourceHash:hash('source')});assert.equal(m.records[0].medal,10);assert.equal(m.validation.total,10);assert.equal(m.settlementStatus,'provisional');assert.equal(m.records[0].employeeId,'DEMO001');assert.ok(m.records[0].sourceFields.some(f=>f.value===999));}
});
test('rejects bad totals, duplicate IDs, invalid dates and cached primary formulas',()=>{
  for(const [opts,code] of [[{total:11},'SOURCE_TOTAL_MISMATCH'],[{duplicate:true,total:20},'EMPLOYEE_DUPLICATE'],[{formula:true},'PRIMARY_GOLD_FORMULA']])assert.throws(()=>C.parseWorkbook(workbook(opts),X,{sourceName:'synthetic.xlsx',sourceHash:hash('source')}),new RegExp(code));
  assert.throws(()=>C.date('2026-02-30'),/DATE_INVALID/);assert.throws(()=>month('2026-09',10,{settlementStatus:'final'}),/FINAL_CONFIRMATION_REQUIRED/);
});
test('employee ID retains leading zeros; missing month stays null; region filter keeps full person quarter',()=>{
  const months=[month('2026-07',40,{records:[record(40,{employeeId:'00001'})]}),month('2026-09',-5,{records:[record(-5,{employeeId:'00001',region:'北一二B',storeCode:'SYN-B',store:'合成二店'})]})];
  const [p]=C.aggregate(months,C.quarterMonths('2026-Q3'),{region:'北一二A'});assert.equal(p.employeeId,'00001');assert.equal(p.total,35);assert.equal(p.months['2026-08'],null);assert.equal(p.placements['2026-07'].region,'北一二A');assert.equal(p.placements['2026-09'].region,'北一二B');assert.equal(C.quarterStatus(months,C.quarterMonths('2026-Q3')),'provisional');
  assert.throws(()=>C.aggregate([months[0],months[0]],C.quarterMonths('2026-Q3'),{}),/MONTH_DUPLICATE/);
});
test('diff includes removed staff rather than inventing zero balances',()=>{const d=C.diff(month(),{records:[]});assert.equal(d[0].type,'removed');assert.equal(d[0].delta,null);assert.equal(d[0].after,null);});

function runtime(){
  const files=new Map();let counter=0,now=100,failReadback=false,corruptRead=null;const owner={getEmail:()=> 'owner@synthetic.test'};
  const folder={getId:()=> 'fixture-folder',getSharingAccess:()=> 'private',getOwner:()=>owner,getEditors:()=>[],getViewers:()=>[],getFilesByName:name=>iterator([...files.values()].filter(f=>f.name===name)),createFile(name,text){const f=file(name,text);files.set(f.id,f);return f;}};
  function iterator(items){let i=0;return {hasNext:()=>i<items.length,next:()=>items[i++]};}
  function file(name,text){const f={id:'file-'+(++counter),name,text,getId(){return this.id;},getName(){return this.name;},getSharingAccess:()=> 'private',getOwner:()=>owner,getEditors:()=>[],getViewers:()=>[],getParents:()=>iterator([folder]),getBlob(){return {getDataAsString:()=>{if(corruptRead===this.id){corruptRead=null;return 'wrong';}return this.text;}};},setContent(t){this.text=t;if(failReadback){corruptRead=this.id;failReadback=false;}return this;}};f.initial=text;return f;}
  const q2={monthKey:'2026-06',sheetName:'已呈報',dateRange:{start:'2026-06-01',end:'2026-06-30',cutoff:'2026-06-30'},records:[record(80,{spe:9})]};
  const context=vm.createContext({DepartmentGoldMonthlyCore:C,departmentOpsFolder_:()=>folder,departmentOpsLatestSnapshot_:()=>({version:1,months:[q2]}),ptHashHex_:hash,ptSessionNowSeconds_:()=>now,ptSessionSigningKey_:()=> 'synthetic-secret',ptBase64UrlEncode_:v=>Buffer.from(v).toString('base64url'),ptBase64UrlDecodeText_:v=>Buffer.from(v,'base64url').toString(),ptConstantTimeEqual_:(a,b)=>a===b,DriveApp:{Access:{PRIVATE:'private'},getFileById:id=>{if(!files.has(id))throw new Error('missing fixture');return files.get(id);}},MimeType:{PLAIN_TEXT:'text/plain'},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},Utilities:{getUuid:()=>crypto.randomUUID(),base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),computeHmacSha256Signature:(v,k)=>crypto.createHmac('sha256',k).update(v).digest()}});
  vm.runInContext(fs.readFileSync(require.resolve('../gas/DepartmentGoldMonthly.gs'),'utf8'),context);
  const read=()=>context.departmentGoldMonthlyRead_({});
  const base=(months=[month()])=>({contract:'north12-monthly-write/v2',mode:'plan',operationId:crypto.randomUUID(),expectedRevision:read().monthly.revision,token:'synthetic-session',months});
  const preview=p=>context.departmentGoldMonthlyPublish_(p);
  const commit=(p,receipt,extra={})=>context.departmentGoldMonthlyPublish_({...p,mode:p.mode==='restore-plan'?'restore':'commit',confirm:true,planReceipt:receipt,...extra});
  return {files,folder,q2,read,base,preview,commit,expire:()=>{now=10000;},failReadback:()=>{failReadback=true;}};
}
test('server preview is read only; commit keeps Q2 and unrelated months, and opens from saved versions',()=>{
  const r=runtime(),p=r.base([month('2026-07',30),month('2026-08',-4),month('2026-09',10)]),a=r.preview(p);assert.equal(r.files.size,0);assert.equal(a.result,'preview');
  const saved=r.commit(p,a.planReceipt);assert.equal(saved.result,'committed');assert.equal(saved.gold.months.length,4);assert.equal(JSON.stringify(saved.gold.months[0].records),JSON.stringify(r.q2.records));
  const next=r.base([month('2026-09',15)]),b=r.preview(next);r.commit(next,b.planReceipt);const data=r.read().gold.months;assert.equal(data.find(m=>m.monthKey==='2026-07').records[0].medal,30);assert.equal(data.find(m=>m.monthKey==='2026-08').records[0].medal,-4);assert.equal(data.find(m=>m.monthKey==='2026-09').records[0].medal,15);assert.equal(JSON.stringify(data[0].records),JSON.stringify(r.q2.records));
});
test('same month/file is a no-op, operation retry is idempotent and changed source hash cannot masquerade as the same raw file',()=>{
  const r=runtime(),p=r.base(),a=r.preview(p);r.commit(p,a.planReceipt);const count=r.files.size;assert.equal(r.commit(p,a.planReceipt).result,'already-committed');assert.equal(r.files.size,count);
  const p2=r.base(),b=r.preview(p2);assert.equal(r.commit(p2,b.planReceipt).result,'unchanged');assert.equal(r.files.size,count);
  const conflict=r.base([month('2026-09',15,{sourceHash:month().sourceHash})]);assert.throws(()=>r.preview(conflict),/GOLD_SOURCE_HASH_CONFLICT/);
});
test('rejects stale preview, changed candidate, expired receipt, missing confirmation and reported Q2 updates',()=>{
  const r=runtime(),p=r.base(),a=r.preview(p);assert.throws(()=>r.commit({...p,months:[month('2026-09',11)]},a.planReceipt),/GOLD_PREVIEW_CHANGED/);
  assert.throws(()=>r.commit(p,a.planReceipt,{confirm:false}),/GOLD_CONFIRMATION_REQUIRED/);r.expire();assert.throws(()=>r.commit(p,a.planReceipt),/GOLD_PREVIEW_EXPIRED/);
  assert.throws(()=>r.preview(r.base([month('2026-06')])),/GOLD_REPORTED_HISTORY_LOCKED/);
  const s=runtime(),old=s.base(),receipt=s.preview(old),other=s.base([month('2026-09',20)]),o=s.preview(other);s.commit(other,o.planReceipt);assert.throws(()=>s.commit(old,receipt.planReceipt),/GOLD_VERSION_CONFLICT/);
});
test('final requires explicit confirmation; final downgrade needs a separate regression confirmation',()=>{
  const r=runtime(),p=r.base([month('2026-09',10,{settlementStatus:'final',finalConfirmed:true})]),a=r.preview(p);r.commit(p,a.planReceipt);
  const next=r.base(),b=r.preview(next);assert.equal(b.changes[0].finalDowngrade,true);assert.throws(()=>r.commit(next,b.planReceipt),/GOLD_REGRESSION_CONFIRMATION_REQUIRED/);r.commit(next,b.planReceipt,{confirmRegression:true});assert.equal(r.read().gold.months[1].settlementStatus,'provisional');
});
test('restore switches only that month; history remains and readback failure restores previous registry',()=>{
  const r=runtime(),p=r.base(),a=r.preview(p);r.commit(p,a.planReceipt);const first=r.read().monthly.history['2026-09'][0].versionId;
  const next=r.base([month('2026-09',15)]),b=r.preview(next);r.commit(next,b.planReceipt);
  const restore={...r.base(),mode:'restore-plan',monthKey:'2026-09',versionId:first};delete restore.months;const c=r.preview(restore);r.commit(restore,c.planReceipt);assert.equal(r.read().gold.months[1].records[0].medal,10);assert.equal(r.read().monthly.history['2026-09'].length,2);
  const newer=r.base([month('2026-09',20)]),d=r.preview(newer);r.failReadback();assert.throws(()=>r.commit(newer,d.planReceipt),/GOLD_READBACK_FAILED_PREVIOUS_RESTORED/);assert.equal(r.read().gold.months[1].records[0].medal,10);
});
test('storage permissions fail closed without changing sharing',()=>{const r=runtime();r.folder.getViewers=()=>[{getEmail:()=> 'reader@synthetic.test'}];assert.throws(()=>r.read(),/GOLD_STORAGE_SHARED/);assert.equal(r.files.size,0);});
