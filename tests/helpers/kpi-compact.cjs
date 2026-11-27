'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const Conversion=require('../../readonly-dashboard-core.js');
const root=path.join(__dirname,'../..'),origin='https://kpi-compact.test';
const names=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
const keys=['AQ V+D 999 (含)以上','AQ V+D 1399 (含)以上','好速案銷售點數','RT V+D 999 (含)以上','RT V+D 1399 (含)以上','RT上線點數','5G銷售數','TTL AQ上線點數','預付卡開卡面額','特殊維繫用戶續約數','高高特維用戶續約數','自退數','解約後NP OUT','解約後NP OUT(督導績)','Device專案銷售數','重點Device銷售量','換約淨新增金額','空機、3C、物聯網及門市購營收','配件及其他營收','包膜與保貼營收','手機保險服務點數','HBO Max&Disney+&Prime Video銷售數','Netflix多享組銷售數','MyVideo&KKBOX','Apple&Google服務及雜誌週刊開通數'];
async function start(page,{ttl=25*60*1000,battleView=false,failInitial=false,unknown=false,missingMetric=false,conversion}={}){
 const calls=[],errors=[],control={fail:failInitial,denied:false,delay:false},expiresAt=Date.now()+ttl;
 page.on('pageerror',error=>errors.push(error.message));
 const kpi={meta:{month:'2026-11',snapshotDay:8,monthDays:30,period:'2026/11/01 ~ 11/08',sourceFile:'1109.xlsx'},
  items:keys.map(key=>({key})),aggregateRates:Object.fromEntries(keys.map(key=>[key,1.23])),
  stores:names.map((name,i)=>({code:'DNB'+i,name:'台北'+name,official:1.3-i*.05,items:Object.fromEntries(keys.map((key,j)=>[key,{a:7+i,t:101+j,reportRate:1.23+i*.01}]))})),persons:[]};
 const snapshot={report_date:'2026-11-08',data_as_of_date:'2026-11-08',source_file:'1109.xlsx',source_date_range:'2026/11/01 ~ 11/08',
  aggregate:{overall_kpi:1.1,overall_kpi_dod:.015,company_rank:20,company_rank_dod:2,addon_score:12.34,addon_score_dod:.25,insurance_attach_rate:.42,insurance_attach_rate_dod:-.02},
  stores:names.map((name,i)=>({store:'台北'+name,company_rank:40+i,overall_kpi_dod:.01,addon_score:10+i,addon_score_dod:-.1,insurance_attach_rate:[.5,.499,null,0,.6,.8,.49,.4,.7][i]})),personal:[]};
 if(unknown){kpi.items.push({key:'來源新增待分類'});for(const store of kpi.stores)store.items['來源新增待分類']={a:9,t:12,reportRate:.75};}
 if(missingMetric)delete kpi.stores[7].items['AQ V+D 1399 (含)以上'];
 await page.context().route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin){
   const name=path.basename(url.pathname),file=path.join(root,name);
   if(!fs.existsSync(file)||!['.html','.js','.mjs','.css'].includes(path.extname(name)))return route.abort();
   return route.fulfill({contentType:name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});
  }
  if(url.hostname!=='script.google.com')return route.abort();
  const {action}=request.postDataJSON();calls.push(action);
  if(action==='employee_dashboard_read'){
   if(control.delay)await new Promise(resolve=>setTimeout(resolve,400));
   if(control.fail)return route.fulfill({status:503,body:'synthetic unavailable'});
   if(control.denied)return route.fulfill({json:{status:'error',code:'B_AUTH_DENIED'}});
  }
  const proof={profile:{role:'employee',isTrusted:false},trustSource:'password-bound'};
  const result=action==='employee_status'?{status:'ok',enabled:true,passwordAvailable:true}
   :action==='employee_login'?{status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt,battleViewAvailable:battleView,trustSource:'password-bound'}
   :action==='employee_dashboard_read'?{status:'ok',expiresAt,...(battleView && request.postDataJSON().battleView?{battleExpiresAt:expiresAt-1800000+86400000}:{}),trustSource:'password-bound',phoneEligible:false,privateResult:{status:'ok',...proof,snapshot:{kpiBattle:snapshot,...conversion}},kpiResult:{status:'ok',...proof,data:kpi}}:{status:'ok'};
  return route.fulfill({json:result});
 });
 await page.goto(origin+'/kpi-battle.html');
 await page.locator('[data-b-employee]').fill('SYNTHETIC');await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
 await page.locator('[data-b-submit]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state',failInitial?'pending':'active');
 return {calls,control,errors,kpi,snapshot};
}
async function update(page){await page.locator('#kpiBattleContentReadStatus [data-private-dashboard-action="refresh"]').click();}

for(const width of [1920,1366,1180,1024,390,320])test(width+'px approved matrix, real target fields and store controls',async({page},info)=>{
 await page.setViewportSize({width,height:828});const f=await start(page);
 await expect(page.locator('.compact-summary .sc-label')).toHaveText(['全區 KPI','公司排名','附掛得分','保險搭售']);
 await expect(page.locator('.compact-summary')).toContainText('+1.5 pp');await expect(page.locator('.compact-summary')).toContainText('+0.25 分');
 await expect(page.locator('.compact-matrix tbody tr')).toHaveCount(10);
 await expect(page.locator('.compact-matrix thead th')).toHaveText(['店點／區內標示','公司排名','KPI總達成','AQ 來客數','締結率尚無正式資料','DOD（較前日）','附掛得分','保險搭售率','A999','A1399','好速','RT','R1399']);
 await expect(page.locator('.compact-matrix [data-aq-visitors]')).toHaveText(Array(10).fill('—'));
 await expect(page.locator('.compact-matrix [data-conversion-rate]')).toHaveText(Array(10).fill('—'));
 await expect(page.locator('.compact-matrix tbody .rank-top')).toHaveCount(3);await expect(page.locator('.compact-matrix tbody .rank-bottom')).toHaveCount(3);
 await expect(page.locator('.compact-matrix tbody .rank-icon')).toHaveCount(6);
 await expect(page.locator('.compact-matrix tbody .rank-top svg').first()).toHaveAttribute('aria-hidden','true');
 await expect(page.locator('.compact-overview summary')).toHaveCount(0);
 await expect(page.locator('.compact-overview')).not.toContainText('KPI 未達 100% 門市');
 const insurance=page.locator('.compact-matrix tbody tr:not(.compact-district) [data-insurance-rate]');
 await expect(insurance).toHaveText(['50.0%','49.9%','—','0.0%','60.0%','80.0%','49.0%','40.0%','70.0%']);
 await expect(insurance.nth(0)).toHaveClass('insurance-met');await expect(insurance.nth(1)).toHaveClass('insurance-low');await expect(insurance.nth(2)).toHaveClass('');
 await expect(page.locator('.compact-matrix [data-overall-kpi].kpi-attention')).toHaveCount(2);
 expect(await insurance.nth(0).evaluate(e=>getComputedStyle(e).color)).not.toBe(await insurance.nth(1).evaluate(e=>getComputedStyle(e).color));
 await page.screenshot({path:info.outputPath('SYNTHETIC-first-'+width+'.png')});
 const first=page.locator('.compact-matrix tbody tr').first();expect((await first.boundingBox()).y).toBeLessThan(width<700?600:400);
 if(width>=700){const last=page.locator('.compact-matrix tbody tr').last(),box=await last.boundingBox();expect(box.y+box.height).toBeLessThan(780);}
 await expect(page.locator('.b-lease')).toContainText('登入至');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const coreGroup=page.locator('[data-kpi-group="core"]'),addonGroup=page.locator('[data-kpi-group="addon"]');
 await expect(addonGroup.locator('h4')).toHaveText('DEVICE／加掛');
 await expect(page.locator('#kpiBattleDailyCoverage')).toContainText('完整日目標資料 9/9 店');
 await expect(coreGroup.locator('[data-kpi-metric="AQ V+D 999 (含)以上"] [data-daily-target]')).toHaveText('36件／日');
 const left=await coreGroup.boundingBox(),right=await addonGroup.boundingBox();
 if(width>=1180){
  expect(right.y).toBe(left.y);
  expect(right.x).toBeGreaterThan(left.x+left.width);
  for(const group of [coreGroup,addonGroup])expect(await group.locator('.table-wrap').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 }else{
  expect(right.x).toBe(left.x);
  expect(right.y).toBeGreaterThan(left.y+left.height);
 }
 expect((await coreGroup.locator('[data-kpi-metric="5G銷售數"]').boundingBox()).height).toBeLessThan(35);
 await expect(page.locator('[data-daily-target-rule]')).toContainText('2026-11 全月 30 天');
 await page.locator('#kpiBattleStoreSelect').selectOption('台北三創');
 await expect(page.locator('#kpiBattleDailyCoverage')).toHaveCount(0);
 let row=page.locator('[data-kpi-group="core"] [data-kpi-metric="AQ V+D 999 (含)以上"]');
 await expect(row.locator('td')).toHaveText(['101','14','130.0%','4件／日']); // source rate intentionally differs from actual/target
 await expect(page.locator('[data-kpi-group="core"] [data-kpi-metric]')).toHaveCount(14);
 await expect(page.locator('[data-kpi-group="addon"] [data-kpi-metric]')).toHaveCount(11);
 const rendered=await page.locator('.compact-metric-group [data-kpi-metric]').evaluateAll(rows=>rows.map(row=>({key:row.dataset.kpiMetric,values:[...row.querySelectorAll('td')].map(td=>td.textContent)})));
 expect(rendered.map(row=>row.key).sort()).toEqual([...keys].sort());
 for(const row of rendered){const i=keys.indexOf(row.key);expect(row.values).toEqual([String(101+i),'14','130.0%',String(Math.ceil((101+i)/30))+(row.key.includes('點數')?'點／日':['預付卡開卡面額','換約淨新增金額','空機、3C、物聯網及門市購營收','配件及其他營收','包膜與保貼營收'].includes(row.key)?'金額原單位／日':'件／日')]);}
 const coreWrap=page.locator('[data-kpi-group="core"] .table-wrap');
 await coreWrap.evaluate(element=>element.scrollLeft=element.scrollWidth);
 await page.locator('[data-kpi-group="core"]').screenshot({path:info.outputPath('SYNTHETIC-daily-target-'+width+'.png')});
 await page.locator('[data-kpi-detail-tab="addon"]').click();await expect(page.locator('[data-kpi-group="addon"]')).toContainText('Netflix多享組銷售數');
 await expect(page.locator('[data-kpi-group="core"]')).toHaveCount(0);await expect(page.locator('#kpiBattleMetricGroup')).toHaveValue('addon');
 if(width>=1180)expect((await addonGroup.boundingBox()).width).toBeGreaterThan(right.width);
 await page.locator('#kpiBattleMetricGroup').selectOption('core');await expect(page.locator('[data-kpi-group="core"]')).toContainText('RT達成率');
 await expect(page.locator('[data-kpi-group="addon"]')).toHaveCount(0);
 await page.locator('[data-kpi-detail-tab="all"]').click();
 await expect(page.locator('#kpiBattleContent')).not.toContainText('進度達成率（不打折目標）');
 const details=page.locator('#kpiBattleSourceNote details');await expect(details).not.toHaveAttribute('open','');await details.locator('summary').click();
 await expect(details).toContainText('1109.xlsx');
 await details.locator('summary').click();await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:info.outputPath('SYNTHETIC-kpi-'+width+'.png'),fullPage:true});
 expect(f.errors).toEqual([]);
});

test('AQ／RT uses the published cutoff and version, weights all nine stores and refreshes after upload return',async({page})=>{
 const conversion={
  conversionStatus:{status:'verified',revision:7},
  conversionBattle:{schema:Conversion.SCHEMA,sha256:'a'.repeat(64),period_start:'2026-11-01',cutoff:'2026-11-01',
   records:Conversion.STORES.map(({id},i)=>({store:id,date:'2026-11-01',aq_n:i===0?1:0,aq_d:i===0?2:10,rt_n:i===0?0:1,rt_d:i===0?0:4}))}
 };
 const f=await start(page,{conversion});
 await expect(page.locator('.compact-matrix .compact-district [data-aq-visitors]')).toHaveText('82');
 await expect(page.locator('.compact-matrix tr').filter({hasText:'台北酒泉'}).locator('[data-aq-visitors]')).toHaveText('2');
 await expect(page.locator('.compact-matrix tr').filter({hasText:'台北三創'}).locator('[data-aq-visitors]')).toHaveText('10');
 await expect(page.locator('.compact-matrix .compact-district [data-conversion-rate]')).toHaveText('AQ 1.22%RT 25.00%');
 await expect(page.locator('.compact-matrix tr').filter({hasText:'台北酒泉'}).locator('[data-conversion-rate]')).toHaveText('AQ 50.00%RT —（分母 0）');
 await expect(page.locator('.compact-matrix tr').filter({hasText:'台北三創'}).locator('[data-conversion-rate]')).toHaveText('AQ 0.00%RT 25.00%');
 await expect(page.locator('[data-conversion-version]')).toContainText('2026-11-01');
 await expect(page.locator('[data-conversion-version]')).toContainText('版本 7');

 conversion.conversionStatus.revision=8;
 const before=f.calls.length;
 await page.goto(origin+'/kpi-battle.html?refresh=conversion#kpi');
 await expect(page.locator('[data-conversion-version]')).toContainText('版本 8');
 expect(f.calls.slice(before)).toEqual(['employee_dashboard_read']);

 conversion.conversionBattle.records[1].aq_d=0;
 await update(page);
 await expect(page.locator('.compact-matrix .compact-district [data-aq-visitors]')).toHaveText('72');
 await expect(page.locator('.compact-matrix tr').filter({hasText:'台北永吉'}).locator('[data-aq-visitors]')).toHaveText('0');
 conversion.conversionBattle.records.pop();
 await update(page);
 await expect(page.locator('[data-conversion-version]')).toHaveText('資料未通過核對');
 await expect(page.locator('[data-aq-visitors]')).toHaveText(Array(10).fill('—'));
 await expect(page.locator('[data-conversion-rate]')).toHaveText(Array(10).fill('—'));
 expect(f.errors).toEqual([]);
});

test('source item without a metric stays present as dashes; unknown source fields stay unclassified',async({page})=>{
 const f=await start(page,{unknown:true,missingMetric:true});await page.locator('#kpiBattleStoreSelect').selectOption('台北三創');
 await expect(page.locator('[data-kpi-group="core"] [data-kpi-metric="AQ V+D 1399 (含)以上"] td')).toHaveText(['—','—','—','—月目標未提供']);
 await expect(page.locator('[data-kpi-group="other"]')).toContainText('來源新增待分類');
 await expect(page.locator('[data-kpi-group="other"] [data-daily-target]')).toHaveText('—不適用');
 await expect(page.locator('.compact-metric-group [data-kpi-metric]')).toHaveCount(26);
 await page.locator('#kpiBattleMetricGroup').selectOption('other');
 await expect(page.locator('[data-kpi-group="other"] [data-kpi-metric]')).toHaveCount(1);
 const full=page.locator('.compact-store-details>.compact-disclosure');await full.locator('summary').click();
 await expect(full.locator('[data-kpi-metric]')).toHaveCount(26);
 await expect(full.locator('[data-kpi-metric="AQ V+D 1399 (含)以上"] td')).toHaveText(['—','—','—','—月目標未提供']);
 f.kpi.items=f.kpi.items.filter(item=>item.key!=='來源新增待分類');
 await update(page);await expect(page.locator('#kpiBattleMetricGroup')).toHaveValue('all');
 await expect(page.locator('.compact-metric-group [data-kpi-metric]')).toHaveCount(25);
 expect(f.errors).toEqual([]);
});

for(const width of [1920,390])test(width+'px daily target source edges, partial district coverage and leap-month switching',async({page},info)=>{
 await page.setViewportSize({width,height:828});const f=await start(page),key=keys[0];
 const values=[null,'',0,.01,true,101,101,61,89];
 f.kpi.stores.forEach((store,i)=>store.items[key].t=values[i]);await update(page);
 const cell=()=>page.locator('[data-kpi-group="core"] [data-kpi-metric="'+key+'"] [data-daily-target]');
 await expect(cell()).toHaveAttribute('data-daily-target','partial');
 await expect(cell()).toHaveText('15件／日部分合計；目標資料 6/9 店；1 店月目標為 0');
 for(const [i,status,text] of [[0,'missing','—月目標未提供'],[1,'missing','—月目標未提供'],[2,'no-target','—無月目標（來源為 0）'],[3,'ok','1件／日'],[4,'invalid-target','—月目標無效'],[7,'ok','3件／日']]){
  await page.locator('#kpiBattleStoreSelect').selectOption('台北'+names[i]);
  await expect(cell()).toHaveAttribute('data-daily-target',status);await expect(cell()).toHaveText(text);
 }
 await page.locator('#kpiBattleStoreSelect').selectOption('北一二B整體');
 await page.locator('[data-kpi-group="core"] .table-wrap').evaluate(element=>element.scrollLeft=element.scrollWidth);
 await page.locator('[data-kpi-group="core"]').screenshot({path:info.outputPath('SYNTHETIC-partial-district-'+width+'.png')});
 for(const store of f.kpi.stores)store.items[key].t=29;
 for(const [month,days,value] of [['2027-02',28,18],['2028-02',29,9],['2026-12',31,9]]){
  Object.assign(f.kpi.meta,{month,monthDays:days});await update(page);
  await expect(page.locator('[data-daily-target-rule]')).toContainText(month+' 全月 '+days+' 天');
  await expect(cell()).toHaveText(value+'件／日');
  await page.locator('#kpiBattleStoreSelect').selectOption('台北三創');
  await expect(cell()).toHaveText(Math.ceil(29/days)+'件／日');
  await expect(page.locator('[data-kpi-group="core"] [data-kpi-metric="'+key+'"] td').nth(2)).toHaveText('130.0%');
  await page.locator('#kpiBattleStoreSelect').selectOption('北一二B整體');
 }
 f.kpi.meta.monthDays=30;await update(page);
 await expect(cell()).toHaveText('—來源月份／天數待確認');
 expect(f.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('repeated view/lifecycle changes do not fetch or erase; failed manual update retains exact matrix',async({page})=>{
 const f=await start(page),before=f.calls.length;
 await page.locator('.compact-matrix').evaluate(node=>window.__matrix=node);
 for(let i=0;i<5;i++){
  await page.locator('[data-b-module="awards"]').click();await page.locator('[data-b-module="kpi"]').click();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
 }
 expect(f.calls.length).toBe(before);expect(await page.evaluate(()=>window.__matrix===document.querySelector('.compact-matrix'))).toBe(true);
 f.control.fail=true;f.control.delay=true;await update(page);
 await expect(page.locator('[data-b-message]')).toContainText('仍顯示上次載入資料');
 await expect(page.locator('.b-more summary')).toHaveText('更新未完成');
 await expect(page.locator('.compact-matrix')).toBeVisible();expect(await page.evaluate(()=>window.__matrix===document.querySelector('.compact-matrix'))).toBe(true);
 expect(f.calls.slice(before)).toEqual(['employee_dashboard_read']);
 f.control.fail=false;await update(page);await expect.poll(()=>f.calls.length).toBe(before+2);await expect(page.locator('[data-b-message]')).toContainText('上次讀取');
 f.control.denied=true;await update(page);await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');
 await expect(page.locator('.compact-matrix')).toHaveCount(0);expect(f.errors).toEqual([]);
});

test('initial read failure stays empty and can retry without a new login',async({page})=>{
 const f=await start(page,{failInitial:true});await expect(page.locator('.compact-matrix')).toHaveCount(0);
 f.control.fail=false;await page.locator('.b-more summary').click();await page.locator('[data-b-refresh]').click();
 await expect(page.locator('.compact-matrix')).toBeVisible();expect(f.calls.filter(action=>action==='employee_login')).toHaveLength(1);
});

test('real lease expiry clears protected data and displays the exact expiry reason',async({page})=>{
 await page.clock.install();await start(page,{ttl:60000});await expect(page.locator('.compact-matrix')).toBeVisible();
 await page.clock.fastForward(61000);await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');
 await expect(page.locator('.compact-matrix')).toHaveCount(0);await expect(page.locator('#kpiCompactCutoff')).toContainText('登入已到期');
 expect(await page.evaluate(()=>sessionStorage.getItem('north12b_password_data_v1'))).toBeNull();
});

test('logout during a delayed update cannot restore protected data',async({page})=>{
 const f=await start(page);f.control.delay=true;await update(page);
 await page.locator('.b-more summary').click();await page.locator('[data-b-logout]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');await expect(page.locator('.compact-matrix')).toHaveCount(0);
 await page.waitForTimeout(500);await expect(page.locator('.compact-matrix')).toHaveCount(0);
 expect(await page.evaluate(()=>sessionStorage.getItem('north12b_password_session_v1'))).toBeNull();
});

test('four battle panels retain the verified view through the day and lock at the fixed deadline',async({page})=>{
 await page.clock.install();
 const f=await start(page,{ttl:1800000,battleView:true});
 const requests=f.calls.length;
 await page.clock.fastForward(23*60*60*1000);
 for(const module of ['awards','personal','op','kpi','op']){
  await page.locator('[data-b-module="'+module+'"]').click();
  await expect(page).toHaveURL(new RegExp('#'+module+'$'));
 }
 await expect(page.locator('#panel-op-series iframe')).toBeVisible();
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await page.reload();
 await expect(page.locator('#panel-op-series iframe')).toBeVisible();
 expect(f.calls).toHaveLength(requests);
 await page.locator('[data-b-module="kpi"]').click();
 await update(page);
 await expect.poll(()=>f.calls.length).toBe(requests+1);
 await expect(page.locator('.compact-matrix')).toBeVisible();
 await page.clock.fastForward(60*60*1000+1000);
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');
 await expect(page.locator('#panel-op-series iframe, .compact-matrix')).toHaveCount(0);
});

test('focus tasks use the verified session, distinguish missing staff and filter both ends of the slider',async({page})=>{
 const f=await start(page,{ttl:1800000,battleView:true});
 await expect(page.locator('[data-b-module="op"] + button')).toHaveText('重點任務進度');
 await page.evaluate(()=>{
  const token=JSON.parse(sessionStorage.getItem('north12b_password_session_v1')).token;
  const progress={actual:[3,1,0,0,0],targets:[3,1,null,2,1],rates:[1,1,null,0]};
  const inventory=Object.fromEntries(['i17','i18','mac','S26','pixel10','pixel11'].map(k=>[k,[1,0,0]]));
  const stores=['測試一店','測試二店'].map((name,i)=>({...progress,name,code:'TEST'+i,x500Met:false,inventory}));
  const people=[1,3,4].map((idle,i)=>({name:'測＊'+i,code:'TEST0',idle,iphone:1,actual:[1,0,0,0,0]}));
  const report={area:{...progress,x500Missing:2},dates:['2026-11-01','2026-11-02'],stores,people};
  sessionStorage.setItem('north12b.focus-tasks.v1',JSON.stringify({token,report}));
 });
 await page.locator('[data-b-module="focus-tasks"]').click();
 const frame=page.frameLocator('#panel-focus-tasks iframe'), slider=frame.getByRole('slider');
 await expect(frame.locator('#people tr')).toHaveCount(3);
 await slider.press('End');await expect(frame.locator('#people tr')).toHaveCount(1);
 await expect(frame.locator('#people tr')).toContainText('優異');
 await slider.press('Home');await expect(frame.locator('#people tr')).toHaveCount(1);
 await expect(frame.locator('#people tr')).toContainText('落後');
 await frame.locator('#store').selectOption('TEST1');
 await expect(frame.locator('#people')).toContainText('個人表未列');
 await page.locator('[data-b-module="op"]').click();
 await page.locator('[data-b-module="focus-tasks"]').click();
 await expect(frame.locator('#store')).toHaveValue('TEST1');
 await page.reload();await expect(frame.locator('#people tr')).toHaveCount(3);
 await page.locator('.b-more summary').click();await page.locator('[data-b-logout]').click();
 await expect(page.locator('#panel-focus-tasks iframe')).toHaveCount(0);
 expect(await page.evaluate(()=>sessionStorage.getItem('north12b.focus-tasks.v1'))).toBeNull();
 expect(f.errors).toEqual([]);
});

test('KPI 締結率報表離頁後還原，保留有效批次及匯出範圍',async({page})=>{
 await page.route('**/assets/vendor/xlsx.full.min.js',route=>route.fulfill({
  contentType:'text/javascript',body:fs.readFileSync(path.join(root,'assets/vendor/xlsx.full.min.js'))
 }));
 await page.clock.install();
 const {calls}=await start(page,{ttl:1800000,battleView:true});
 const entry=page.getByRole('button',{name:'締結率',exact:true});
 await expect(page.locator('[data-b-module="kpi"] + button')).toHaveText('締結率');
 const requestCount=calls.length;
 await entry.click();
 const report=page.frameLocator('#panel-conversion iframe');
 await expect(page).toHaveURL(/#conversion$/);
 await expect(report.locator('#back')).toBeHidden();
 await expect(report.locator('#status')).toContainText('查看北一二B與各店表現');
 const XLSX=require('../../assets/vendor/xlsx.full.min.js'),book=XLSX.utils.book_new();
 const rows=[['資料起日','截止日','區別','店碼','店名','AQ上線數','AQ來客數','RT續約數','RT合格來客數'],
  ['2026-11-01','2026-11-03','北一二B','DNB10001','示範店',54,120,4,10],
  ['2026-11-01','2026-11-03','北一二A','DNB10002','跨區驗收店',5,5,5,5]];
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'部區月累計');
 const previous = {
  name:'previous.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  buffer:require('./readonly-conversion-workbook.cjs').workbook({month:'2026-10'})
 };
 const file={name:'sample.xlsx',mimeType:previous.mimeType,buffer:Buffer.from(XLSX.write(book,{type:'array',bookType:'xlsx'}))};
 await expect(report.locator('#files')).toBeEnabled();
 await report.locator('#files').setInputFiles([file,previous]);
 await expect(report.locator('#status')).toContainText('sample.xlsx');
 await expect(report.locator('#full')).toBeVisible();
 await expect(report.locator('#region option')).toHaveText(['北一二B']);
 await expect(report.locator('#store option')).toHaveText(['全部門市','北一二B／示範店']);
 const download=page.waitForEvent('download');
 await report.getByRole('button',{name:'匯出所選範圍 HTML'}).click();
 const html=fs.readFileSync(await (await download).path(),'utf8');
 const snapshot=JSON.parse(html.match(/id="report-snapshot">([\s\S]*?)<\/script>/)[1]);
 expect(snapshot.models.map(m=>m.scope)).toEqual(['北一二B','DNB10001']);
 expect(JSON.stringify(snapshot)).not.toContain('跨區驗收店');
 await page.locator('[data-b-module="kpi"]').click();
 await entry.click();
 await expect(report.locator('#overview')).toContainText('45.00%');
 expect(calls.length).toBe(requestCount);

 const batch = await report.locator('#status').textContent();
 await page.getByRole('link',{name:'返回智慧營運中心'}).click();
 await expect(page).toHaveURL(/\/home\.html$/);
 // The ordinary portal login has expired. The battle lease remains valid.
 await page.clock.fastForward(23*60*60*1000);
 await page.locator('.quick-card[href="kpi-battle.html"]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
 await entry.click();
 await expect(report.locator('#status')).toHaveText(batch);
 await expect(report.locator('#overview')).toContainText('45.00%');
 await expect(report.locator('#month option')).toHaveText(['2026-11','2026-10']);
 expect(calls.filter(action=>action==='employee_login')).toHaveLength(1);
 expect(calls.filter(action=>action==='employee_dashboard_read')).toHaveLength(1);

 const invalid={name:'invalid.xlsx',mimeType:previous.mimeType,buffer:Buffer.from('invalid')};
 await report.locator('#files').setInputFiles([previous,invalid]);
 await expect(report.locator('#status')).toContainText('匯入失敗');
 await expect(report.locator('#overview')).toContainText('45.00%');
 await page.reload();
 await expect(report.locator('#status')).toHaveText(batch);

 rows[1][5]=60;
 book.Sheets['部區月累計']=XLSX.utils.aoa_to_sheet(rows);
 const corrected={name:'corrected.xlsx',mimeType:previous.mimeType,buffer:Buffer.from(XLSX.write(book,{type:'array',bookType:'xlsx'}))};
 await report.locator('#files').setInputFiles(corrected);
 await expect(report.locator('#status')).toContainText('corrected.xlsx');
 await page.reload();
 await expect(report.locator('#status')).toContainText('corrected.xlsx');
 await expect(report.locator('#overview')).toContainText('50.00%');
 await expect(report.locator('#month option')).toHaveText(['2026-11','2026-10']);

 await report.locator('#clear').click();
 await expect(report.locator('#view')).toBeHidden();
 await page.getByRole('link',{name:'返回智慧營運中心'}).click();
 await page.locator('.quick-card[href="kpi-battle.html"]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
 await entry.click();
 await expect(report.locator('#status')).toContainText('請選取本機');
 await expect(report.locator('#export')).toBeDisabled();
});

for(const end of ['戰情到期','首頁登出'])test('締結率報表在'+end+'後不會跨次登入還原',async({page})=>{
 await page.route('**/assets/vendor/xlsx.full.min.js',route=>route.fulfill({
  contentType:'text/javascript',body:fs.readFileSync(path.join(root,'assets/vendor/xlsx.full.min.js'))
 }));
 await page.clock.install();
 await start(page,{ttl:1800000,battleView:true});
 const access=page.locator('#dashboard-b-access'),entry=page.getByRole('button',{name:'締結率',exact:true});
 const report=page.frameLocator('#panel-conversion iframe');
 await entry.click();
 await expect(report.locator('#status')).toContainText('查看北一二B與各店表現');
 await expect(report.locator('#files')).toBeEnabled();
 const buffer=require('./readonly-conversion-workbook.cjs').workbook({month:'2026-11'});
 await report.locator('#files').setInputFiles({name:'verified.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
 await expect(report.locator('#status')).toContainText('verified.xlsx');
 await expect(report.locator('#view')).toBeVisible();
 if(end==='戰情到期'){
  await page.clock.fastForward(24*60*60*1000+5000);
  await expect(access).toHaveAttribute('data-state','locked');
  await expect(page.locator('#panel-conversion iframe')).toHaveCount(0);
 }else{
  await page.getByRole('link',{name:'返回智慧營運中心'}).click();
  await expect(page).toHaveURL(/\/home\.html$/);
  page.once('dialog', dialog=>dialog.accept());
  const reloaded=page.waitForEvent('load');
  await page.getByRole('button',{name:'登出營運中心網頁'}).click();
  await reloaded;
 }
 expect(await page.evaluate(()=>sessionStorage.getItem('north12b.conversion-report.v1'))).toBeNull();
 await page.goto(origin+'/kpi-battle.html#conversion');
 await expect(access).toHaveAttribute('data-state','locked');
 await expect(page.locator('#panel-conversion iframe')).toHaveCount(0);
 if(end==='首頁登出'){
  await page.locator('[data-b-employee]').fill('SYNTHETIC');
  await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
  await page.locator('[data-b-submit]').click();
  await expect(access).toHaveAttribute('data-state','active');
  await expect(report.locator('#status')).toContainText('請選取本機');
 }
});
