'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const Conversion=require('../../readonly-dashboard-core.js');
const root=path.join(__dirname,'../..'),origin='https://kpi-compact.test';
const names=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
const keys=['AQ V+D 999 (含)以上','AQ V+D 1399 (含)以上','好速案銷售點數','RT V+D 999 (含)以上','RT V+D 1399 (含)以上','RT上線點數','5G銷售數','TTL AQ上線點數','預付卡開卡面額','特殊維繫用戶續約數','高高特維用戶續約數','自退數','解約後NP OUT','解約後NP OUT(督導績)','Device專案銷售數','重點Device銷售量','換約淨新增金額','空機、3C、物聯網及門市購營收','配件及其他營收','包膜與保貼營收','手機保險服務點數','HBO Max&Disney+&Prime Video銷售數','Netflix多享組銷售數','MyVideo&KKBOX','Apple&Google服務及雜誌週刊開通數'];
async function start(page,{ttl=25*60*1000,failInitial=false,unknown=false,missingMetric=false,conversion}={}){
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
   if(!fs.existsSync(file)||!['.html','.js','.css'].includes(path.extname(name)))return route.abort();
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
   :action==='employee_login'?{status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt,trustSource:'password-bound'}
   :action==='employee_dashboard_read'?{status:'ok',expiresAt,trustSource:'password-bound',phoneEligible:false,privateResult:{status:'ok',...proof,snapshot:{kpiBattle:snapshot,...conversion}},kpiResult:{status:'ok',...proof,data:kpi}}:{status:'ok'};
  return route.fulfill({json:result});
 });
 await page.goto(origin+'/kpi-battle.html');
 await page.locator('[data-b-employee]').fill('SYNTHETIC');await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
 await page.locator('[data-b-submit]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state',failInitial?'pending':'active');
 return {calls,control,errors,kpi,snapshot};
}
async function update(page){await page.locator('#kpiBattleContentReadStatus [data-private-dashboard-action="refresh"]').click();}

for(const width of [1920,1024,390,320])test(width+'px approved matrix, real target fields and store controls',async({page},info)=>{
 await page.setViewportSize({width,height:828});const f=await start(page);
 await expect(page.locator('.compact-summary .sc-label')).toHaveText(['全區 KPI','公司排名','附掛得分','保險搭售']);
 await expect(page.locator('.compact-summary')).toContainText('+1.5 pp');await expect(page.locator('.compact-summary')).toContainText('+0.25 分');
 await expect(page.locator('.compact-matrix tbody tr')).toHaveCount(10);
 await expect(page.locator('.compact-matrix thead th')).toHaveText(['店點／區內標示','KPI總達成','締結率尚無正式資料','公司排名','DOD（較前日）','附掛得分','保險搭售率','A999','A1399','好速','RT','R1399']);
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
 await expect(page.locator('[data-kpi-group="core"] [data-kpi-metric="AQ V+D 999 (含)以上"] [data-daily-target]')).toHaveText('36件／日目標資料 9/9 店');
 await expect(page.locator('[data-daily-target-rule]')).toContainText('2026-11 全月 30 天');
 await page.locator('#kpiBattleStoreSelect').selectOption('台北三創');
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

 conversion.conversionBattle.records.pop();
 await update(page);
 await expect(page.locator('[data-conversion-version]')).toHaveText('資料未通過核對');
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
  await expect(cell()).toHaveText(value+'件／日目標資料 9/9 店');
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
