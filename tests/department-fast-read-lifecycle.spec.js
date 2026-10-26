'use strict';
const {test,expect}=require('@playwright/test');
const F=require('./helpers/department-readonly-synthetic.cjs'),S=require('../department-scores-core.js');
const RC=require('../department-readonly-core.js'),A=require('../department-readonly-assets.js');
const PAGE=new URL('department-ops.html',process.env.TEST_BASE_URL||'http://127.0.0.1:8772/').href,KEY='bei12b_patrol_session_token_v2';
const gate=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release};};
function sources(){
 const data=F.input();
 for(const slot of data.scores.months){
  for(const row of slot.month.records)for(const m of row.metrics)if(m.kind==='checkScore'){m.value=100;m.raw=100;}
  const r=slot.month.records[0];r.defects=1;r.source.defects.value=1;r.source.defects.raw=1;
  const defects=r.metrics.filter(m=>m.kind==='defect');defects[0].value=2;defects[0].raw=2;defects[2].value=null;defects[2].raw='#REF!';defects[2].status='error';
  const warning=r.metrics.find(m=>m.kind==='defect'&&m!==defects[0]&&m!==defects[2]);warning.kind='warning';warning.value=1;warning.raw=1;
  slot.month=S.validateMonth(slot.month);
 }
 return data;
}
async function setup(page,ttl=3600){
 const data=sources(),calls=[],errors=[],exp=Math.floor(Date.now()/1000)+ttl,token=Buffer.from(JSON.stringify({exp})).toString('base64url')+'.synthetic';
 const state={hold:null,fail:false,deny:false,version:1};
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(({key,token})=>sessionStorage.setItem(key,token),{key:KEY,token});
 await page.route('**/*',async route=>{
  const host=new URL(route.request().url()).hostname;if(host==='127.0.0.1')return route.continue();if(host!=='script.google.com')return route.abort();
  const p=route.request().postDataJSON();calls.push(p.action);let result;
  if(p.action==='ptauth')result={status:'ok',token:p.token||token,expiresAt:exp};
  else if(['department_ops_read','department_scores_read'].includes(p.action)){
   if(state.hold)await state.hold.promise;
   result=state.deny?{status:'error',message:'AUTH_SESSION_REVOKED'}:state.fail?{status:'error',message:'合成暫時錯誤'}:p.action==='department_ops_read'?{status:'ok',...data.gold,monthly:{...data.gold.monthly,revision:'gold-'+state.version}}:{status:'ok',...data.scores,generation:state.version};
  }else if(p.action==='department_store_rules_read')result={status:'ok',available:false,contract:'store-rule-reminders-v1',expiresAt:exp};
  else if(p.action==='ptlogout')result={status:'ok'};else return route.abort();
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 await page.goto(PAGE);await expect(page.locator('#goldDashboard')).toBeVisible();return {state,calls,errors};
}
async function store(page){await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreDashboard')).toBeVisible();}
const lifecycle=page=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.__hidden});window.__hidden=true;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pagehide'));window.__hidden=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('focus'));});
for(const domain of ['gold','store'])test(`${domain}: background and return keep dashboard and selection without network; refresh is explicit`,async({page})=>{
 const s=await setup(page);if(domain==='store'){await store(page);await page.locator('#scorePeriod').selectOption('2026-07');await page.locator('#scoreStore').selectOption('合成店A1');await page.locator('[data-score-detail]').click();}
 else await page.locator('#monthFilter').selectOption('2026-08');
 const dashboard=page.locator(domain==='gold'?'#goldDashboard':'#scoreDashboard'),before=s.calls.filter(x=>/department_(ops|scores)_read/.test(x)).length;
 for(let i=0;i<3;i++)await lifecycle(page);
 await expect(dashboard).toBeVisible();expect(s.calls.filter(x=>/department_(ops|scores)_read/.test(x))).toHaveLength(before);
 if(domain==='store'){await expect(page.locator('#scoreStore')).toHaveValue('合成店A1');await expect(page.locator('#scoreDetail')).toBeVisible();}else await expect(page.locator('#monthFilter')).toHaveValue('2026-08');
 await page.locator(domain==='gold'?'#monthlyReload':'#scoreRefresh').click();await expect.poll(()=>s.calls.filter(x=>/department_(ops|scores)_read/.test(x)).length).toBe(before+1);await expect(dashboard).toBeVisible();expect(s.errors).toEqual([]);
});
for(const domain of ['gold','store'])test(`${domain}: slow or failed manual refresh retains last loaded view with a clear error`,async({page})=>{
 const s=await setup(page);if(domain==='store')await store(page);const dashboard=page.locator(domain==='gold'?'#goldDashboard':'#scoreDashboard'),message=page.locator(domain==='gold'?'#goldMessage':'#scoreMessage');
 const body=page.locator(domain==='gold'?'#peopleBody':'#scoreBody'),before=await body.innerText();s.state.hold=gate();const held=s.state.hold;s.state.fail=true;
 await page.locator(domain==='gold'?'#monthlyReload':'#scoreRefresh').click();await expect(dashboard).toBeVisible();await lifecycle(page);await expect(dashboard).toBeVisible();held.release();
 await expect(message).toContainText('本次更新失敗，仍顯示上次載入資料');expect(await body.innerText()).toBe(before);await expect(dashboard).toBeVisible();
 s.state.hold=null;s.state.fail=false;await page.locator(domain==='gold'?'#monthlyReload':'#scoreRefresh').click();await expect(message).not.toContainText('更新失敗');expect(s.errors).toEqual([]);
});
for(const domain of ['gold','store'])test(`${domain}: explicit server denial on refresh still clears both private domains`,async({page})=>{
 const s=await setup(page);await store(page);if(domain==='gold')await page.locator('[data-tab="gold"]').click();s.state.deny=true;
 await page.locator(domain==='gold'?'#monthlyReload':'#scoreRefresh').click();await expect(page.locator('#authPanel')).toBeVisible();await expect(page.locator('#peopleBody')).toBeEmpty();await expect(page.locator('#scoreBody')).toBeEmpty();expect(s.errors).toEqual([]);
});
test('expiry clears data even while the document is hidden; focus cannot renew it',async({page})=>{
 await page.clock.install();const s=await setup(page,3);await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(3100);
 await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#peopleBody')).toBeEmpty();expect(s.calls.filter(x=>x==='ptauth')).toHaveLength(1);expect(s.errors).toEqual([]);
});
test('identity removal clears the old view on return',async({page})=>{
 await setup(page);await store(page);await page.evaluate(key=>sessionStorage.removeItem(key),KEY);await lifecycle(page);await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#scoreBody')).toBeEmpty();
});
test('loaded reminders and dashboards neither poll after a minute nor revalidate on return',async({page})=>{
 await page.clock.install();const s=await setup(page);await store(page);await expect(page.locator('#store-rules-status')).toContainText('尚未提供私有規則提醒');const before=s.calls.length;
 await page.clock.runFor(65000);await lifecycle(page);expect(s.calls).toHaveLength(before);await expect(page.locator('#scoreDashboard')).toBeVisible();expect(s.errors).toEqual([]);
});
async function assertColors(page){
 await page.locator('#scorePeriod').selectOption('2026-07');await page.locator('#scoreStore').selectOption('合成店A1');
 await expect(page.locator('[data-score-field="defects"]')).toHaveClass(/score-issue/);await expect(page.locator('[data-score-field="deduction"]')).toHaveClass(/score-issue/);
 await page.locator('[data-score-detail]').click();await expect(page.locator('#scoreDetail [data-metric-kind="rank"]')).toHaveCount(0);await expect(page.locator('#scoreDetail tbody')).not.toContainText('排名');
 await expect(page.locator('#scoreDetail tr.score-issue')).not.toHaveCount(0);await expect(page.locator('#scoreDetail tr.score-warning')).not.toHaveCount(0);await expect(page.locator('#scoreDetail tr.score-missing')).not.toHaveCount(0);
 const zero=page.locator('#scoreDetail tr[data-metric-kind="defect"]').filter({has:page.locator('td:nth-child(3)',{hasText:/^0$/})}).first();await expect(zero).not.toHaveClass(/score-issue/);
 const color=await page.locator('#scoreDetail tr.score-issue').first().evaluate(e=>getComputedStyle(e).color);expect(color).toBe('rgb(165, 29, 20)');
}
for(const width of [1440,390])test(`all issue values and details use color, zero stays neutral, category ranks hidden at ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height:1000});const s=await setup(page);await store(page);await assertColors(page);await page.screenshot({path:testInfo.outputPath('defect-detail.png')});expect(s.errors).toEqual([]);
});
test('new offline HTML uses the same defect colors and suppresses only category ranks',async({page})=>{
 await page.setContent(RC.createHTML(sources(),A));await assertColors(page);await expect(page.locator('#scoreHead')).toContainText('部內／全國名次');await expect(page.locator('form,input')).toHaveCount(0);
});
