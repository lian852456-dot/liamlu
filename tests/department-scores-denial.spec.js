'use strict';
const {test,expect}=require('@playwright/test');
const Scores=require('../department-scores-core.js'),Gold=require('../department-gold-monthly-core.js'),XLSX=require('../assets/vendor/xlsx.full.min.js'),F=require('./helpers/department-scores-synthetic.cjs');
const PAGE=(process.env.TEST_BASE_URL||'http://127.0.0.1:8772/')+'department-ops.html',KEY='bei12b_patrol_session_token_v2',DRAFT='synthetic-unrelated-draft';
const token=id=>Buffer.from(JSON.stringify({id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
const revoked={status:'error',message:'unauthorized',reason:'AUTH_SESSION_REVOKED',auth:{reason:'AUTH_SESSION_REVOKED',action:'department_scores_read',sessionContract:'patrol-session-v2'}};
const active={revision:'synthetic-active',sourceName:'synthetic.xlsx',publishedAt:'2026-10-03T00:00:00Z'};
const historical={...active,revision:'synthetic-history'};
const saved={status:'ok',contract:Scores.CONTRACT,available:true,generation:1,months:[6,7].map(month=>({month:F.month({month}),active,history:[historical]}))};
const goldMonth=Gold.validateMonth({schema:Gold.SCHEMA,monthKey:'2026-09',sheetName:'動員(全員)',sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64),dateRange:{start:'2026-09-01',end:'2026-09-28',cutoff:'2026-09-28'},settlementStatus:'provisional',finalConfirmed:false,records:[{employeeId:'SYN001',employeeName:'合成同仁',region:'北一二B',storeCode:'SYN-B',store:'合成金牌店',role:'合成職稱',medal:12,sourceRow:4,sourceFields:[]}],validation:{sourceTotal:12}});
async function setup(page){
 const a=token('A'),b=token('B'),calls=[],errors=[],state={reply:null,action:'department_scores_read'};
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,a,draft})=>{sessionStorage.setItem(key,a);localStorage.setItem(draft,'保留的其他工作');},{key:KEY,a,draft:DRAFT});
 await page.route('**/*',async route=>{
  const req=route.request(),host=new URL(req.url()).hostname;if(host==='127.0.0.1')return route.continue();if(host!=='script.google.com')return route.abort('blockedbyclient');
  const p=req.postDataJSON();calls.push(p);let result;
  if(p.action===state.action&&state.reply)return route.fulfill({status:state.reply.status||200,contentType:state.reply.html?'text/html':'application/json',body:state.reply.html||JSON.stringify(state.reply.body)});
  if(p.action==='ptauth')result={status:'ok',token:p.key?b:p.token,expiresAt:Math.floor(Date.now()/1000)+3600};
  else if(p.action==='department_ops_read')result={status:'ok',available:true,gold:{months:[goldMonth]},monthly:{revision:'synthetic',history:{}}};
  else if(p.action==='department_scores_read')result=saved;
  else if(p.action==='department_scores_history_read')result={status:'ok',contract:Scores.CONTRACT,generation:1,month:F.month({month:Number(p.monthKey.slice(5))}),active:historical};
  else if(p.action==='department_store_rules_read')result={status:'ok',available:false,contract:'store-rule-reminders-v1',expiresAt:Math.floor(Date.now()/1000)+3600};
  else if(p.action==='ptlogout')result={status:'ok'};
  else return route.abort('blockedbyclient');
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto(PAGE);await expect(page.locator('#peopleBody tr')).toHaveCount(1);
 await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);
 await expect(page.locator('#scoreFile')).toHaveValue('');
 return {a,b,state,calls,errors,reads:()=>calls.filter(p=>p.action==='department_scores_read')};
}
async function locked(page,s){
 await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#authPanel')).toBeVisible();
 for(const id of ['scoreBody','scoreSummary','scoreDetail','scoreHistory','scoreDiff','scoreRestoreDiff','scoreRestoreMeta','scorePreviewMeta','scoreMonthChoices','scoreErrors','scoreSourceMeta','scoreHead','scoreWarnings','peopleBody'])await expect(page.locator('#'+id)).toBeEmpty();
 await expect(page.locator('#scoreFile')).toHaveValue('');await expect(page.locator('#scorePreview')).toBeHidden();await expect(page.locator('#scoreRestorePreview')).toBeHidden();
 expect(await page.evaluate(({key,draft})=>({token:sessionStorage.getItem(key),draft:localStorage.getItem(draft),work:DepartmentScoresWorkState()}),{key:KEY,draft:DRAFT})).toEqual({token:null,draft:'保留的其他工作',work:{busy:false,unsaved:false}});
 expect(s.calls.filter(p=>/publish|restore$/.test(p.action))).toEqual([]);expect(s.errors).toEqual([]);
}
async function retained(page,s){
 await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#peopleBody tr')).toHaveCount(1);
 expect(await page.evaluate(({key,draft})=>({token:sessionStorage.getItem(key),draft:localStorage.getItem(draft)}),{key:KEY,draft:DRAFT})).toEqual({token:s.a,draft:'保留的其他工作'});expect(s.errors).toEqual([]);
}
const authCodes=['AUTH_TOKEN_MISSING','AUTH_TOKEN_INVALID','AUTH_SESSION_NOT_FOUND','AUTH_SESSION_EXPIRED','AUTH_SESSION_REVOKED','AUTH_DEPLOYMENT_MISMATCH','AUTH_CREDENTIAL_INVALID'];
const securityCodes=['SCORES_OWNER_DOMAIN_UNVERIFIED','SCORES_PROTECTED_FOLDER','SCORES_FOLDER_NOT_PRIVATE','SCORES_REVISION_OUTSIDE_PRIVATE_DOMAIN'];
for(const code of [...authCodes,...securityCodes])test(`explicit ${code} message locks once`,async({page})=>{
 const s=await setup(page);s.state.reply={body:{status:'error',message:code}};await page.locator('#scoreRefresh').click();await locked(page,s);expect(s.reads()).toHaveLength(2);
});
for(const [field,body] of [
 ['code',{status:'error',code:'AUTH_SESSION_REVOKED',message:'權限拒絕'}],
 ['reason',{status:'error',reason:'AUTH_SESSION_EXPIRED',message:'權限拒絕'}],
 ['auth.reason',{status:'error',auth:{reason:'AUTH_DEPLOYMENT_MISMATCH'},message:'權限拒絕'}],
 ['authReason',{status:'error',authReason:'AUTH_SESSION_NOT_FOUND',message:'權限拒絕'}],
 ['bare unauthorized',{status:'error',message:'unauthorized'}],
 ['denied status',{status:'denied',message:'權限拒絕'}],
 ['forbidden status',{status:'forbidden',message:'權限拒絕'}],
 ['normalized code',{status:'error',code:' auth_session_revoked ',message:'權限拒絕'}]
])test(`${field} denial clears shared private data`,async({page})=>{
 const s=await setup(page);s.state.reply={body};await page.locator('#scoreRefresh').click();await locked(page,s);expect(s.reads()).toHaveLength(2);
});
for(const status of [200,401,403,503])test(`actual Patrol revocation body over HTTP ${status} clears private data without retry`,async({page})=>{
 const s=await setup(page);s.state.reply={status,body:revoked};await page.locator('#scoreRefresh').click();await locked(page,s);expect(s.reads()).toHaveLength(2);
});
for(const [name,body] of [
 ['cache diagnostic',{status:'error',code:'AUTH_CACHE_MISS',message:'服務暫時失敗'}],
 ['unknown auth code',{status:'error',reason:'AUTH_SERVICE_UNAVAILABLE',message:'服務暫時失敗'}],
 ['token text',{status:'error',message:'token metadata unavailable'}],
 ['session text',{status:'error',message:'SESSION read failed'}],
 ['format error',{status:'error',code:'SCORES_MANIFEST_INVALID',message:'資料格式錯誤'}],
 ['non-string denial-like field',{status:'error',code:{reason:'AUTH_SESSION_REVOKED'},message:'資料格式錯誤'}]
])test(`${name} retains session and unrelated work`,async({page})=>{
 const s=await setup(page);s.state.reply={body};await page.locator('#scoreRefresh').click();await expect(page.locator('#scoreMessage')).toContainText(body.message);await retained(page,s);expect(s.reads()).toHaveLength(2);
 s.state.reply=null;await page.locator('#scoreRefresh').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);await expect(page.locator('#scoreFile')).toHaveValue('');
});
for(const status of [401,403,503])test(`HTTP ${status} without explicit denial retains session`,async({page})=>{
 await page.clock.install();const s=await setup(page);s.state.reply={status,html:'<html>synthetic gateway unavailable</html>'};await page.locator('#scoreRefresh').click();await page.clock.runFor(3000);await expect(page.locator('#scoreMessage')).toContainText('HTTP '+status);await retained(page,s);expect(s.reads()).toHaveLength(status===503?4:2);
});
test('unknown route retries remain bounded and preserve month/filter with no source file',async({page})=>{
 await page.clock.install();const s=await setup(page);await page.locator('#scorePeriod').selectOption('2026-07');await page.locator('#scoreRegion').selectOption('北一二D');await page.locator('#scoreStore').selectOption('合成店D1');
 s.state.reply={body:{status:'error',message:'unknown patrol action'}};await page.locator('#scoreRefresh').click();await page.clock.runFor(3000);await expect(page.locator('#scoreMessage')).toContainText('未對應此次讀取');await retained(page,s);expect(s.reads()).toHaveLength(4);
 s.state.reply=null;await page.locator('#scoreRefresh').click();await expect(page.locator('#scoreBody tr')).toHaveCount(1);await expect(page.locator('#scorePeriod')).toHaveValue('2026-07');await expect(page.locator('#scoreRegion')).toHaveValue('北一二D');await expect(page.locator('#scoreStore')).toHaveValue('合成店D1');await expect(page.locator('#scoreFile')).toHaveValue('');
});
for(const failure of ['network','timeout'])test(`${failure} terminates without revoking store session`,async({page})=>{
 await page.clock.install();const s=await setup(page);
 await page.evaluate(failure=>{const original=window.fetch;window.__failedReads=0;window.fetch=(u,o)=>{if(JSON.parse(o?.body||'{}').action!=='department_scores_read')return original(u,o);window.__failedReads++;if(failure==='network')return Promise.reject(new TypeError('synthetic offline'));return new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('synthetic timeout','AbortError')),{once:true}));};},failure);
 await page.locator('#scoreRefresh').click();await page.clock.runFor(failure==='timeout'?76000:3000);await expect(page.locator('#scoreMessage')).not.toContainText('正在');await expect(page.locator('#scoreRefresh')).toBeEnabled();await retained(page,s);expect(await page.evaluate(()=>__failedReads)).toBe(failure==='timeout'?2:3);
});
for(const status of [200,403])test(`late A denial over HTTP ${status} cannot revoke newly logged in B`,async({page})=>{
 const s=await setup(page);await page.evaluate(status=>{const original=window.fetch;window.__lateReads=0;window.fetch=(u,o)=>{if(JSON.parse(o?.body||'{}').action!=='department_scores_read')return original(u,o);window.__lateReads++;return new Promise(resolve=>{window.__settleRead=()=>{window.fetch=original;resolve(new Response(JSON.stringify({status:'error',message:'unauthorized',auth:{reason:'AUTH_SESSION_REVOKED'}}),{status,headers:{'Content-Type':'application/json'}}));};});};},status);
 await page.locator('#scoreRefresh').click();await expect.poll(()=>page.evaluate(()=>__lateReads)).toBe(1);await page.locator('[data-tab="gold"]').click();await page.evaluate(()=>window.dispatchEvent(new Event('department-session-cleared')));
 await page.locator('#passcode').fill('synthetic-passcode');await page.locator('#authForm button').click();await expect(page.locator('#peopleBody tr')).toHaveCount(1);await page.evaluate(()=>__settleRead());await expect(page.locator('#scoreRefresh')).toBeEnabled();await expect(page.locator('#workspace')).toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),KEY)).toBe(s.b);
 await expect(page.locator('#scoreBody')).toBeEmpty();await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);expect(s.reads().at(-1).token).toBe(s.b);expect(s.errors).toEqual([]);
});
test('history denial clears import preview and closes an existing private print popup',async({page})=>{
 const s=await setup(page),file=Buffer.from(XLSX.write(F.workbook({month:7}),{type:'array',bookType:'xlsx'}));
 await page.locator('#scoreFile').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:file});await page.locator('#scoreImport').click();await expect(page.locator('#scorePreview')).toBeVisible();
 const popupEvent=page.waitForEvent('popup');await page.locator('#scorePrintPdf').click();const popup=await popupEvent;await expect(popup.locator('body')).toContainText('合成店A1');expect(popup.isClosed()).toBe(false);
 s.state.action='department_scores_history_read';s.state.reply={body:revoked};await page.locator('#scoreHistory').selectOption('2026-07|synthetic-history');await page.locator('#scoreHistoryPreview').click();await locked(page,s);await expect.poll(()=>popup.isClosed()).toBe(true);expect(s.calls.filter(p=>p.action==='department_scores_history_read')).toHaveLength(1);
});
test('history denial invalidates a pending private PPT download',async({page})=>{
 const s=await setup(page),downloads=[];page.on('download',d=>downloads.push(d));
 await page.evaluate(async()=>{const P=await DepartmentStorePresentationBrowser.loadVendor();window.pptxgen=class extends P{write(){return new Promise(resolve=>{window.__releasePpt=()=>resolve(new Blob(['synthetic'.repeat(200)],{type:'application/octet-stream'}));});}};});
 await page.locator('#scorePptx').click();await expect.poll(()=>page.evaluate(()=>typeof __releasePpt)).toBe('function');s.state.action='department_scores_history_read';s.state.reply={body:revoked};await page.locator('#scoreHistory').selectOption('2026-07|synthetic-history');await page.locator('#scoreHistoryPreview').click();await locked(page,s);
 await page.evaluate(()=>__releasePpt());await expect(page.locator('#scoreMessage')).toContainText('取消匯出');expect(downloads).toEqual([]);
});
