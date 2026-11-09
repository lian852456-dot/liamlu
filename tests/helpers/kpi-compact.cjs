'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..'),origin='https://kpi-compact.test';
const names=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
const keys=['AQ V+D 999 (含)以上','AQ V+D 1399 (含)以上','好速案銷售點數','RT V+D 999 (含)以上','RT V+D 1399 (含)以上','RT上線點數','Netflix'];
async function start(page,{ttl=25*60*1000,failInitial=false}={}){
 const calls=[],errors=[],control={fail:failInitial,denied:false,delay:false},expiresAt=Date.now()+ttl;
 page.on('pageerror',error=>errors.push(error.message));
 const kpi={meta:{month:'2026-11',snapshotDay:8,monthDays:30,period:'2026/11/01 ~ 11/08',sourceFile:'1109.xlsx'},
  items:keys.map(key=>({key})),aggregateRates:Object.fromEntries(keys.map(key=>[key,1.23])),
  stores:names.map((name,i)=>({code:'DNB'+i,name:'台北'+name,official:1.3-i*.05,items:Object.fromEntries(keys.map((key,j)=>[key,{a:7+i,t:101+j,reportRate:1.23+i*.01}]))})),persons:[]};
 const snapshot={report_date:'2026-11-08',data_as_of_date:'2026-11-08',source_file:'1109.xlsx',source_date_range:'2026/11/01 ~ 11/08',
  aggregate:{overall_kpi:1.1,overall_kpi_dod:.015,company_rank:20,company_rank_dod:2,addon_score:12.34,addon_score_dod:.25,insurance_attach_rate:.42,insurance_attach_rate_dod:-.02},
  stores:names.map((name,i)=>({store:'台北'+name,company_rank:40+i,overall_kpi_dod:.01,addon_score:10+i,addon_score_dod:-.1,insurance_attach_rate:.4})),personal:[]};
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
   :action==='employee_dashboard_read'?{status:'ok',expiresAt,trustSource:'password-bound',phoneEligible:false,privateResult:{status:'ok',...proof,snapshot:{kpiBattle:snapshot}},kpiResult:{status:'ok',...proof,data:kpi}}:{status:'ok'};
  return route.fulfill({json:result});
 });
 await page.goto(origin+'/kpi-battle.html');
 await page.locator('[data-b-employee]').fill('SYNTHETIC');await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
 await page.locator('[data-b-submit]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state',failInitial?'pending':'active');
 return {calls,control,errors};
}
async function update(page){await page.locator('#kpiBattleContentReadStatus [data-private-dashboard-action="refresh"]').click();}

for(const width of [1920,1024,390])test(width+'px approved matrix, real target fields and store controls',async({page},info)=>{
 await page.setViewportSize({width,height:828});const f=await start(page);
 await expect(page.locator('.compact-summary .sc-label')).toHaveText(['全區 KPI','公司排名','附掛得分','保險搭售']);
 await expect(page.locator('.compact-summary')).toContainText('+1.5 pp');await expect(page.locator('.compact-summary')).toContainText('+0.25 分');
 await expect(page.locator('.compact-matrix tbody tr')).toHaveCount(9);
 await expect(page.locator('.compact-matrix thead th')).toHaveText(['店點／區內標示','KPI','公司排名','DOD（較前日）','附掛得分','A999','A1399','好速','RT','R1399']);
 await expect(page.locator('.compact-matrix tbody .rank-top')).toHaveCount(3);await expect(page.locator('.compact-matrix tbody .rank-bottom')).toHaveCount(3);
 await page.screenshot({path:info.outputPath('SYNTHETIC-first-'+width+'.png')});
 const first=page.locator('.compact-matrix tbody tr').first();expect((await first.boundingBox()).y).toBeLessThan(width<700?600:400);
 if(width>=700){const last=page.locator('.compact-matrix tbody tr').last(),box=await last.boundingBox();expect(box.y+box.height).toBeLessThan(780);}
 await expect(page.locator('.b-lease')).toContainText('登入至');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#kpiBattleStoreSelect').selectOption('台北三創');
 let row=page.locator('.compact-details').first().locator('tbody tr').first();
 await expect(row.locator('td')).toHaveText(['101','14','130.0%','101']); // source rate intentionally differs from actual/target
 await page.locator('[data-kpi-detail-tab="addon"]').click();await expect(page.locator('.compact-details').first()).toContainText('Netflix');
 await page.locator('#kpiBattleMetricGroup').selectOption('core');await expect(page.locator('.compact-details').first()).toContainText('RT達成率');
 await expect(page.locator('#kpiBattleContent')).not.toContainText('進度達成率（不打折目標）');
 const details=page.locator('#kpiBattleSourceNote details');await expect(details).not.toHaveAttribute('open','');await details.locator('summary').click();
 await expect(details).toContainText('1109.xlsx');
 await details.locator('summary').click();await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:info.outputPath('SYNTHETIC-kpi-'+width+'.png'),fullPage:true});
 expect(f.errors).toEqual([]);
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
