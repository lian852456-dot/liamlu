const {test,expect}=require('@playwright/test');
const crypto=require('node:crypto');
const fs=require('node:fs');
const C=require('../department-gold-monthly-core.js');
const X=require('../assets/vendor/xlsx.full.min.js');
const baseURL=process.env.DEPARTMENT_GOLD_PREVIEW_URL||'http://127.0.0.1:8765';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const staff=(medal,extra={})=>({employeeId:'DEMO001',employeeName:'示*甲',region:'北一二A',storeCode:'SYN-A',store:'合成一店',role:'合成職稱',medal,sourceRow:4,sourceFields:[],...extra});
const month=(key,records,final=false)=>({...C.validateMonth({schema:C.SCHEMA,monthKey:key,sheetName:'動員(全員)',sourceName:'synthetic.xlsx',sourceHash:hash(key),dateRange:{start:key+'-01',end:key+'-28',cutoff:key+'-28'},settlementStatus:final?'final':'provisional',finalConfirmed:final,records,validation:{sourceTotal:records.reduce((s,r)=>s+r.medal,0)}}),versionId:'synthetic-'+key});
function replacement(monthNumber=9){
  const number=String(monthNumber).padStart(2,'0'),lastDay=monthNumber===9?30:31;
  const rows=[[`資料日期 : 2026/${number}/01~${number}/${lastDay}`,...Array(13).fill(null),'SPE加分總計','金牌'],[`Y26/${monthNumber}_北一二(全員)`],['部','區域','區域','督導區','營業店點代碼','服務中心','店內職稱','員編','員工姓名','職級','正/派','9M(含)以上','其他','店型',null,null,'活動金牌'],['北一區','北一二','北一二區','北一二B','SYN-B','合成二店','合成職稱','DEMO001','示*甲',null,null,null,null,null,999,20,999],['北一區','北一二','北一二區','北一二',null,'統計',null,null,null,null,null,null,null,null,999,20]];
  const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),'動員(全員)');return {name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(wb,{type:'buffer',bookType:'xlsx'}))};
}
async function setup(page,{empty=false,planRouteFailures=0,loseCommitResponse=false}={}){
  let revision='synthetic-r1',counter=0;
  const all=empty?[]:[month('2026-06',[staff(80)]),month('2026-07',[staff(40)],true),month('2026-08',[staff(70,{region:'北一二B',storeCode:'SYN-B',store:'合成二店'})],true),month('2026-09',[staff(10,{region:'北一二B',storeCode:'SYN-B',store:'合成二店'}),staff(2,{employeeId:'DEMO002',employeeName:'示*乙',storeCode:'SYN-C',store:'合成三店'})])];
  const versions=new Map(all.map(m=>[m.versionId,m])),history={},operations={},calls=[];
  for(const m of all)history[m.monthKey]=[{versionId:m.versionId,cutoff:m.dateRange.cutoff,total:m.validation.total,status:m.settlementStatus,sourceName:m.sourceName}];
  const read=operationId=>({available:all.length>0,gold:{type:'north12-monthly-v2',months:all.slice().sort((a,b)=>a.monthKey.localeCompare(b.monthKey))},monthly:{revision,history,operation:operations[operationId]||null}});
  await page.addInitScript(()=>{if(!localStorage.getItem('north12b_portal_logout_event_v1'))sessionStorage.setItem('bei12b_patrol_session_token_v2','synthetic-session');});
  await page.route(/https:\/\/script\.google\.com\/macros\//,async route=>{
    const p=JSON.parse(route.request().postData()||'{}');calls.push(p);let result;
    if(p.action==='ptauth')result={token:'synthetic-session'};
    else if(p.action==='ptlogout')result={loggedOut:true};
    else if(p.action==='department_ops_read')result=read(p.operationId);
    else if(p.action==='department_ops_publish'){
      if(p.mode.endsWith('plan')&&planRouteFailures>0){planRouteFailures--;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'error',message:'unknown patrol action'})});return;}
      const restoring=p.mode.startsWith('restore'),incoming=restoring?[versions.get(p.versionId)]:p.months;
      if(p.mode.endsWith('plan'))result={planReceipt:'synthetic-plan',changes:incoming.map(m=>{const old=all.find(s=>s.monthKey===m.monthKey);return {monthKey:m.monthKey,beforeTotal:old?.validation.total??null,total:m.validation.total,changedPeople:C.diff(old,m).length,older:!!old&&m.dateRange.cutoff<old.dateRange.cutoff,finalDowngrade:old?.settlementStatus==='final'&&m.settlementStatus!=='final'};}),differences:incoming.map(m=>({monthKey:m.monthKey,rows:C.diff(all.find(s=>s.monthKey===m.monthKey),m)}))};
      else {
        for(const m of incoming){const index=all.findIndex(x=>x.monthKey===m.monthKey),saved=restoring?m:{...m,versionId:'synthetic-new-'+(++counter)};if(index<0)all.push(saved);else all[index]=saved;versions.set(saved.versionId,saved);if(!restoring)(history[m.monthKey]||=[]).push({versionId:saved.versionId,cutoff:m.dateRange.cutoff,total:m.validation.total,status:m.settlementStatus,sourceName:m.sourceName});}
        revision='synthetic-r'+(++counter+1);operations[p.operationId]={revision,operationId:p.operationId};result={result:'committed',...read(p.operationId)};
        if(loseCommitResponse){loseCommitResponse=false;result={message:'unknown patrol action'};}
      }
    }else result={message:'unexpected fixture action'};
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({status:result.message?'error':'ok',...result})});
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL+'/department-ops.html');await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#goldMessage')).not.toContainText('正在');
  return {calls,errors,all,failNextPlan:()=>{planRouteFailures++;}};
}
test('July receipt recovery followed by an August route failure keeps writes single and preserves Q2',async({page})=>{
  const state=await setup(page,{loseCommitResponse:true});
  await page.locator('#goldFile').setInputFiles(replacement(7));await page.click('#goldImport');await page.click('#publishGold');await page.check('#monthlyRegression');await page.click('#monthlyCommit');
  await expect(page.locator('#publishMessage')).toContainText('已查到此次保存紀錄並完成逐值讀回');
  const july=JSON.stringify(state.all.find(m=>m.monthKey==='2026-07')),q2=JSON.stringify(state.all.find(m=>m.monthKey==='2026-06'));
  state.failNextPlan();await page.locator('#goldFile').setInputFiles(replacement(8));await page.click('#goldImport');await page.click('#publishGold');
  await expect(page.locator('#monthlyConfirm')).toBeVisible();await expect(page.locator('#publishMessage')).toContainText('正式版本尚未變更');
  const augustPlans=state.calls.filter(c=>c.action==='department_ops_publish'&&c.mode==='plan'&&c.months[0].monthKey==='2026-08');expect(augustPlans).toHaveLength(2);expect(augustPlans[0]).toEqual(augustPlans[1]);expect(state.calls.filter(c=>c.mode==='commit')).toHaveLength(1);
  await page.check('#monthlyRegression');await page.click('#monthlyCommit');await expect(page.locator('#publishMessage')).toContainText('月版本已保存並完成逐值讀回');
  expect(state.calls.filter(c=>c.mode==='commit')).toHaveLength(2);expect(JSON.stringify(state.all.find(m=>m.monthKey==='2026-07'))).toBe(july);expect(JSON.stringify(state.all.find(m=>m.monthKey==='2026-06'))).toBe(q2);expect(state.errors).toEqual([]);
});
test('login opens saved quarter without upload; missing month and historical placements remain explicit',async({page})=>{
  await page.setViewportSize({width:1440,height:1100});
  const state=await setup(page);await expect(page.locator('#peopleCount')).toHaveText('2 人');await expect(page.locator('#goldSummary')).toContainText('122');await expect(page.locator('#peopleBody')).toContainText('無來源');await expect(page.locator('#monthlyStatus')).toContainText('暫定');
  await page.selectOption('#regionFilter','北一二A');await expect(page.locator('#peopleBody')).toContainText('120');await expect(page.locator('#peopleBody')).toContainText('合成二店');await expect(page.locator('#publishGold')).toBeDisabled();
  expect(state.calls.filter(c=>c.action==='department_ops_publish')).toHaveLength(0);expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);expect(state.errors).toEqual([]);
  await page.screenshot({path:process.env.DEPARTMENT_GOLD_SCREENSHOT_DIR?process.env.DEPARTMENT_GOLD_SCREENSHOT_DIR+'/desktop.png':undefined});
});
test('upload is preview-only until confirmation; September 30 is provisional and reload keeps saved data',async({page})=>{
  const state=await setup(page);await page.locator('#goldFile').setInputFiles(replacement());await page.click('#goldImport');await expect(page.locator('#monthlyPreview')).toBeVisible();expect(state.calls.filter(c=>c.action==='department_ops_publish')).toHaveLength(0);
  await page.click('#monthlyCancel');await expect(page.locator('#goldSummary')).toContainText('122');
  await page.locator('#goldFile').setInputFiles(replacement());await page.click('#goldImport');await page.click('#publishGold');await expect(page.locator('#monthlyConfirm')).toBeVisible();expect(state.calls.filter(c=>c.mode==='commit')).toHaveLength(0);
  await page.click('#monthlyCommit');await expect(page.locator('#publishMessage')).toContainText('逐值讀回');await expect(page.locator('#goldSummary')).toContainText('130');await expect(page.locator('#monthlyStatus')).toContainText('暫定');expect(state.all.find(m=>m.monthKey==='2026-06').records[0].medal).toBe(80);expect(state.all.find(m=>m.monthKey==='2026-07').records[0].medal).toBe(40);
  await page.reload();await expect(page.locator('#goldSummary')).toContainText('130');await expect(page.locator('#goldFile')).toHaveValue('');expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);expect(state.errors).toEqual([]);
  await page.selectOption('#monthlyHistoryMonth','2026-09');await page.selectOption('#monthlyHistoryVersion','synthetic-2026-09');await page.click('#monthlyRestore');await expect(page.locator('#monthlyConfirm')).toBeVisible();await page.check('#monthlyRegression');await page.click('#monthlyCommit');await expect(page.locator('#publishMessage')).toContainText('逐值讀回');await expect(page.locator('#goldSummary')).toContainText('122');
});
test('first upload can be saved and history restore needs explicit confirmation; logout clears private DOM',async({page})=>{
  const state=await setup(page,{empty:true});await page.locator('#goldFile').setInputFiles(replacement());await page.click('#goldImport');await expect(page.locator('#publishGold')).toBeVisible();await page.click('#publishGold');await page.click('#monthlyCommit');await expect(page.locator('#publishMessage')).toContainText('逐值讀回');
  await page.selectOption('#monthlyHistoryMonth','2026-09');await page.locator('#monthlyHistoryVersion').selectOption({index:1});await page.click('#monthlyRestore');await expect(page.locator('#monthlyConfirm')).toBeVisible();expect(state.calls.filter(c=>c.mode==='restore')).toHaveLength(0);await page.click('#monthlyCommit');await expect(page.locator('#publishMessage')).toContainText('逐值讀回');
  page.once('dialog',dialog=>dialog.accept());await page.click('#monthlyLogout');await expect(page.locator('#authPanel')).toBeVisible();expect(await page.locator('body').textContent()).not.toContain('DEMO001');expect(await page.evaluate(()=>sessionStorage.getItem('bei12b_patrol_session_token_v2'))).toBeNull();expect(state.errors).toEqual([]);
});
test('phone layout keeps all sections within viewport and quarter export preserves missing sources',async({page})=>{
  await page.setViewportSize({width:390,height:844});const state=await setup(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const downloadPromise=page.waitForEvent('download');await page.click('#exportGold');const download=await downloadPromise;expect(download.suggestedFilename()).toContain('暫定');
  const wb=X.read(fs.readFileSync(await download.path()),{type:'buffer'}),rows=X.utils.sheet_to_json(wb.Sheets['每人月值'],{header:1});expect(rows.find(r=>r[1]==='DEMO002').slice(2,4)).toEqual(['無來源','無來源']);
  if(process.env.DEPARTMENT_GOLD_SCREENSHOT_DIR)await page.screenshot({path:process.env.DEPARTMENT_GOLD_SCREENSHOT_DIR+'/mobile.png',fullPage:true});expect(state.errors).toEqual([]);
});
test('missing monthly module stops reads and updates without falling back to the old cache',async({page})=>{
  await page.route('**/department-gold-monthly-ui.js*',route=>route.abort());
  const state=await setup(page);await expect(page.locator('#goldMessage')).toContainText('元件未完整載入');await expect(page.locator('#goldImport')).toBeDisabled();expect(state.calls.filter(c=>c.action==='department_ops_read'||c.action==='department_ops_publish')).toHaveLength(0);expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
});
