const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const C=require('../tradein-performance-core.js');
const employee=(id,role='業務代表(I)',store='台北萬大')=>({employee_id:'55'+id,masked_name:'示＊人',store,role,status:'active'});
const record=(code,seller='12345',extra={})=>({store_code:'DNB10168',source_employee_id:seller,trade_date:'2026-10-02',cancel_date:null,project:'RT',recycle_code:code,order_number:'order-'+code,...extra});
const source=(records,extra={})=>({month:'2026-10',source_start:'2026-10-01',source_end:'2026-10-07',status_as_of_date:'2026-10-07',rule_id:C.RULE_ID,source_sha256:'a'.repeat(64),complete_nine_stores:true,records,...extra});
test('個人目標逐人計算，店長與代理免目標且保留實績',()=>{
  const s=C.build(source([record('a'),record('b'),record('c'),record('d'),record('e','12346'),record('f','12347')]),[employee('12345'),employee('12344'),employee('12346','店長'),employee('12347','代理店長')]);
  assert.equal(s.summary.total_units,6);assert.equal(s.summary.staff_target_units,6);assert.equal(s.summary.staff_gap_units,3);
  assert.equal(s.people[0].remaining_units,0);assert.equal(s.people[2].target_units,null);assert.equal(s.people[3].remaining_units,null);
});
test('資深業務代表仍為有月目標的同仁，不因職稱誤列待核',()=>{
  const s=C.build(source([record('senior')]),[employee('12345','資深業務代表')]);
  assert.equal(s.people[0].role,'同仁');assert.equal(s.people[0].target_units,3);
  assert.equal(s.people[0].remaining_units,2);assert.equal(s.summary.target_staff_count,1);
  assert.equal(s.stores.find(v=>v.store==='萬大').coverage,'complete');
});
test('九店全量來源的未列員工與門市為已核零；未確認範圍拒絕',()=>{
  const s=C.build(source([]),[employee('12345')]);assert.equal(s.people[0].actual_units,0);assert.equal(s.stores.length,9);assert.ok(s.stores.every(s=>s.total_units===0));
  assert.throws(()=>C.build(source([],{complete_nine_stores:false}),[]));
});
test('含單銷、相同回收碼去重，同單不同舊機分別計台數',()=>{
  const a=record('a','12345',{project:'單銷'}),b=record('b','12345',{order_number:a.order_number});
  const s=C.build(source([a,{...a},b]),[employee('12345')]);assert.equal(s.summary.total_units,2);assert.equal(s.summary.duplicate_rows,1);
});
test('跨月取消回沖原成交月，活動與取消重複列不雙計',()=>{
  const a=record('a'),cancel={...a,cancel_date:'2026-11-02'};
  const s=C.build(source([a,cancel],{source_end:'2026-10-31',status_as_of_date:'2026-11-03'}),[employee('12345')]);
  assert.equal(s.period_key,'2026-10');assert.equal(s.summary.total_units,0);assert.equal(s.summary.cancelled_units,1);
});
test('未知員編與跨店人員保留店台數及待核，不配到其他同仁',()=>{
  const s=C.build(source([record('a','54321'),record('b')]),[employee('12345','業務代表(I)','台北杭州南')]);
  assert.equal(s.summary.total_units,2);assert.equal(s.summary.assigned_units,0);assert.equal(s.summary.pending_identity_units,2);assert.equal(s.stores.find(v=>v.store==='萬大').coverage,'partial_identity');
  assert.equal(s.people[0].actual_units,null);assert.equal(s.people[0].remaining_units,null);assert.equal(s.summary.pending_staff_count,1);
});
test('衝突回收碼、未知店碼、跨期與格式問題停止整批',()=>{
  for(const records of [[record('a'),record('a','12346')],[record('a','12345',{store_code:'DNB99999'})],[record('a','12345',{trade_date:'2026-09-30'})],[record('a','12345',{project:'unknown'})]])assert.throws(()=>C.build(source(records),[employee('12345')]));
  assert.throws(()=>C.build(source([]),[employee('12345'),employee('12345')]));
});
test('私有保存投影不保留交易或客戶識別欄',()=>{
  const s=JSON.stringify(C.build(source([record('UNIQUE-RECYCLE','12345',{order_number:'UNIQUE-ORDER'})]),[employee('12345')]));
  assert.ok(!s.includes('UNIQUE-RECYCLE'));assert.ok(!s.includes('UNIQUE-ORDER'));assert.ok(!s.includes('recycle_code'));
});
function api(){
  const context={TradeinPerformanceCore:C,privateDashboardCleanEmployeeId:v=>v,privateDashboardCleanDeviceId:v=>{if(!v)throw new Error('device');return v;},
    privateDashboardIsTrustedEmployee:id=>id==='supervisor',privateDashboardUserByEmployeeId:id=>({user:({staff:{employee_id:'5512345',status:'active',device_id:'approved',store:'台北萬大',role:'業務代表(I)'},supervisor:{status:'active',store:'北一二B',role:'督導'}})[id]})};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../gas/TradeinPerformance.gs'),'utf8'),context);return context;
}
test('後端拒絕未登入、錯誤裝置，不接受前端role擴權',()=>{
  const a=api();assert.throws(()=>a.tradeinPerformanceAuthorize_({employeeId:'missing',deviceId:'approved'}));
  assert.throws(()=>a.tradeinPerformanceAuthorize_({employeeId:'staff',deviceId:'wrong'}));
  assert.equal(a.tradeinPerformanceAuthorize_({employeeId:'staff',deviceId:'approved',role:'督導'}).supervisor,false);
  assert.equal(a.tradeinPerformanceAuthorize_({employeeId:'supervisor',deviceId:'any-device'}).supervisor,true);
});
test('一般同仁與店長讀取只返回本人，督導九店；完全移除員編',()=>{
  const a=api(),s=C.build(source([record('a')]),[employee('12345'),employee('12346','店長')]);
  const p=a.tradeinPerformanceProjection_(s,{id:'5512345',supervisor:false});assert.equal(p.people.length,1);assert.equal(p.stores.length,0);assert.equal(p.summary,null);
  assert.ok(!JSON.stringify(p).includes('5512345'));assert.equal(a.tradeinPerformanceProjection_(s,{supervisor:true}).people.length,2);
});
test('正式匯出正確標示月份、零與免目標，不出現示意字樣',async()=>{
  const E=await import('../tradein-export-core.mjs');
  const rules={...E.rulesForMonth('2026-10'),isDemo:false};
  const model=E.buildExportModel({active:true,mode:'supervisor',people:[['萬大','示＊甲','同仁',0],['萬大','示＊乙','店長',2]],allowedStores:['萬大']},'all',rules);
  assert.equal(model.rows[0].remaining,3);assert.equal(model.rows[1].target,null);assert.ok(!E.reminderText(model).includes('示意'));
  assert.ok(!JSON.stringify(E.workbookRows(model)).includes('合成示意'));assert.equal(E.createXlsx(model)[0],0x50);
  assert.throws(()=>E.buildExportModel({active:true,mode:'self'},'all',rules));
});
test('其他月份匯出維持未知，不借用原月實績',async()=>{
  const E=await import('../tradein-export-core.mjs'),r={...E.rulesForMonth('2026-11'),isDemo:false};
  const p=E.describePerson(['萬大','示＊甲','同仁',4],r);assert.equal(p.actual,null);assert.equal(p.remaining,null);
});
function storageApi(){
  const crypto=require('node:crypto'),a=api(),files=new Map();let counter=0;
  const file=(id,name,text)=>({getId:()=>id,getBlob:()=>({getDataAsString:()=>text}),setContent:t=>{text=t;},getName:()=>name,getParents:()=>{let available=true;return {hasNext:()=>available,next:()=>{available=false;return folder;}};}});
  const folder={getId:()=> 'private-folder',getSharingAccess:()=> 'PRIVATE',getSharingPermission:()=> 'NONE',getFilesByName:name=>{const f=[...files.values()].filter(f=>f.getName()===name);return {hasNext:()=>f.length>0,next:()=>f.shift()};},createFile:(name,text)=>{const id='f'+(++counter),f=file(id,name,text);files.set(id,f);return f;}};
  Object.assign(a,{privateDashboardHash:v=>crypto.createHash('sha256').update(v).digest('hex'),privateDashboardNow:()=> '2026-10-08T12:00:00+08:00',
    reportUploadAuthorize_:p=>{if(p.adminSecret!=='secret')throw new Error('管理員驗證失敗');return 'operator';},
    privateDashboardFolder:()=>folder,DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},getFileById:id=>files.get(id)},MimeType:{PLAIN_TEXT:'text'},
    Utilities:{formatDate:(_d,_t,format)=>format==='yyyy-MM'?'2026-10':'2026-11-10'},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})}});
  a.tradeinPerformanceRoster_=()=>[employee('12345')];return {a,files,folder};
}
test('預覽不寫檔；同源no-op；同月取代不累加；歷史月份隔離與回復核對',()=>{
  const {a,files}=storageApi();
  const preview=s=>a.tradeinPerformancePreview({source:s,adminSecret:'secret'});
  const publish=(s,p)=>a.tradeinPerformancePublish({source:s,adminSecret:'secret',rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash});
  const first=source([record('a')]),p=preview(first);assert.equal(files.size,0);
  const v=publish(first,p);assert.equal(v.status,'published');assert.equal(v.snapshot.summary.total_units,1);
  assert.equal(publish(first,preview(first)).status,'unchanged');
  const second=source([record('b'),record('c')],{source_sha256:'b'.repeat(64)}),next=publish(second,preview(second));
  assert.equal(next.snapshot.summary.total_units,2);assert.throws(()=>publish(first,p),/版本已變更/);
  const november=source([],{month:'2026-11',source_start:'2026-11-01',source_end:'2026-11-07',status_as_of_date:'2026-11-07',source_sha256:'c'.repeat(64)});
  a.Utilities.formatDate=(_d,_t,format)=>format==='yyyy-MM'?'2026-11':'2026-11-10';
  publish(november,preview(november));
  assert.equal(a.tradeinPerformanceRegistry_().months['2026-11'].active.source_sha256,'c'.repeat(64));
  a.tradeinPerformanceRoster_=()=>[employee('12346')];
  assert.equal(a.tradeinPerformanceMonthRoster_('2026-10')[0].employee_id,'5512345');
  a.tradeinPerformanceRollback({adminSecret:'secret',month:'2026-10',expectedActiveHash:next.snapshotHash});
  assert.equal(a.tradeinPerformanceRegistry_().months['2026-10'].active.snapshot_hash,v.snapshotHash);
  assert.equal(a.tradeinPerformanceRegistry_().months['2026-11'].active.source_sha256,'c'.repeat(64));
});
test('管理者密碼、變更名冊、公開資料夾與未來資料在寫入前拒絕',()=>{
  const {a,files,folder}=storageApi(),s=source([record('a')]);
  assert.throws(()=>a.tradeinPerformancePreview({source:s,adminSecret:'wrong'}));assert.equal(files.size,0);
  const p=a.tradeinPerformancePreview({source:s,adminSecret:'secret'});
  a.tradeinPerformanceRoster_=()=>[employee('12346')];
  assert.throws(()=>a.tradeinPerformancePublish({source:s,adminSecret:'secret',rosterHash:p.rosterHash,expectedActiveHash:null}),/名冊已變更/);assert.equal(files.size,0);
  folder.getSharingAccess=()=> 'ANYONE';assert.throws(()=>a.tradeinPerformanceRegistry_(),/必須維持私有/);
  assert.throws(()=>a.tradeinPerformanceBuild_(source([],{source_end:'2026-12-01'}),[]),/不可晚於今天/);
});
test('私有快照遭改動時讀取拒絕',()=>{
  const {a,files}=storageApi(),s=source([record('a')]),p=a.tradeinPerformancePreview({source:s,adminSecret:'secret'});
  a.tradeinPerformancePublish({source:s,adminSecret:'secret',rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:null});
  const entry=a.tradeinPerformanceRegistry_().months['2026-10'].active;
  files.get(entry.file_id).setContent('{"schema_version":"tradein-performance/v1","rule_id":"'+C.RULE_ID+'"}');
  assert.throws(()=>a.tradeinPerformanceSnapshot_(entry),/雜湊核對失敗/);
});
test('預覽後來源被改動，在寫入任何檔案前停止',()=>{
  const {a,files}=storageApi(),s=source([record('a')]),p=a.tradeinPerformancePreview({source:s,adminSecret:'secret'});
  assert.throws(()=>a.tradeinPerformancePublish({source:{...s,records:[record('a'),record('b')]},adminSecret:'secret',rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:null}),/與預覽不同/);
  assert.equal(files.size,0);
});
test('不讀取指定私有資料夾外的快照',()=>{
  const {a,files}=storageApi(),s=source([record('a')]),p=a.tradeinPerformancePreview({source:s,adminSecret:'secret'});
  a.tradeinPerformancePublish({source:s,adminSecret:'secret',rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:null});
  const entry=a.tradeinPerformanceRegistry_().months['2026-10'].active;
  files.get(entry.file_id).getParents=()=>({hasNext:()=>false});
  assert.throws(()=>a.tradeinPerformanceSnapshot_(entry),/不屬於指定私有資料夾/);
});
test('SAR74 嚴格辨識欄位、民國期間、取消核對日及全九店確認',()=>{
  const header=Array(30).fill('');Object.assign(header,{0:'序號',1:'店點代碼',3:'區域別',4:'日期',6:'專案類別',11:'回收代碼/IMEI',18:'銷貨單號',24:'員工編號',27:'取消交易日期'});
  const row=Array(30).fill('');Object.assign(row,{0:'1',1:'DNB10168',3:'北一二B',4:'1151002',6:'單銷',11:'RECYCLE',18:'ORDER',24:'12345'});
  const text='日期 :,115/10/01 - 115/10/07,列印日期 :,26年11月03日 11:23\n'+header.join(',')+'\n'+row.join(',');
  const parsed=C.parseSar74(text);assert.equal(parsed.source_end,'2026-10-07');assert.equal(parsed.status_as_of_date,'2026-11-03');assert.equal(parsed.complete_nine_stores,false);
  assert.throws(()=>C.build({...parsed,source_sha256:'a'.repeat(64)},[employee('12345')]),/涵蓋/);
  assert.equal(C.build({...parsed,source_sha256:'a'.repeat(64),complete_nine_stores:true},[employee('12345')]).summary.total_units,1);
  assert.throws(()=>C.parseSar74(text.replace('回收代碼/IMEI','other')),/欄位/);
});
test('相同來源雜湊但明細改變，不冒稱同源或覆寫版本',()=>{
  const {a,files}=storageApi(),s=source([record('a')]);
  const publish=(s,p)=>a.tradeinPerformancePublish({source:s,adminSecret:'secret',rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash});
  const first=publish(s,a.tradeinPerformancePreview({source:s,adminSecret:'secret'})),count=files.size;
  const changed={...s,records:[record('b'),record('c')]};
  assert.throws(()=>publish(changed,a.tradeinPerformancePreview({source:changed,adminSecret:'secret'})),/相同來源雜湊/);
  assert.equal(files.size,count);assert.equal(a.tradeinPerformanceRegistry_().months['2026-10'].active.snapshot_hash,first.snapshotHash);
});
