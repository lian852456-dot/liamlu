'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const F=require('./helpers/department-scores-synthetic.cjs'),Scores=require('../department-scores-core.js'),Gold=require('../department-gold-monthly-core.js');
const PAGE=(process.env.TEST_BASE_URL||'http://127.0.0.1:8772/')+'department-ops.html';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const months=Array.from({length:6},(_,i)=>({month:F.month({month:i+2}),active:{revision:'synthetic-'+i},history:[]}));
const scoreResult={status:'ok',contract:Scores.CONTRACT,available:true,generation:1,months};
const goldMonths=[7,8,9].map(n=>{const key='2026-'+String(n).padStart(2,'0');return Gold.validateMonth({schema:Gold.SCHEMA,monthKey:key,sheetName:'動員(全員)',sourceName:'synthetic.xlsx',sourceHash:hash(key),dateRange:{start:key+'-01',end:key+'-28',cutoff:key+'-28'},settlementStatus:'provisional',finalConfirmed:false,records:Array.from({length:12},(_,i)=>({employeeId:'DEMO'+String(i).padStart(3,'0'),employeeName:'示*'+String.fromCharCode(65+i),region:'北一二'+String.fromCharCode(65+i%4),storeCode:'SYN-'+i,store:i===0?'合成長名稱示範門市二十三字測試店':'合成門市'+i,role:'合成職稱',medal:40-i+n,sourceRow:i+4,sourceFields:[]})),validation:{sourceTotal:Array.from({length:12},(_,i)=>40-i+n).reduce((a,b)=>a+b,0)}});});
async function setup(page,{routeFailures=0,readError=false,rulesError=true,slowMs=0,rulesTimeout=false}={}){
 const calls=[],urls=[],errors=[];let fail=readError;
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({slowMs,rulesTimeout})=>{
  sessionStorage.setItem('bei12b_patrol_session_token_v2','synthetic-session');
  if(slowMs||rulesTimeout){window.syntheticScoresDelay=slowMs;const original=window.fetch;window.fetch=async(url,options)=>{let p;try{p=JSON.parse(options?.body||'{}');}catch{}const delay=p?.action==='department_scores_read'?window.syntheticScoresDelay:p?.action==='department_store_rules_read'&&rulesTimeout?200000:0;if(delay)await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,delay);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Aborted','AbortError'));},{once:true});});return original(url,options);};}
 },{slowMs,rulesTimeout});
 await page.route('https://script.google.com/**',async route=>{
  const p=route.request().postDataJSON();calls.push(p);let result;
  if(p.action==='ptauth')result={status:'ok',token:'synthetic-session',expiresAt:Math.floor(Date.now()/1000)+3600};
  else if(p.action==='department_ops_read')result={status:'ok',available:true,gold:{months:goldMonths},monthly:{revision:'synthetic-gold-r1',history:{}}};
  else if(p.action==='department_scores_read'){urls.push(route.request().url());result=routeFailures-->0?{status:'error',message:'unknown patrol action'}:fail?{status:'error',message:'合成讀取失敗'}:scoreResult;}
  else if(p.action==='department_store_rules_read')result=rulesError?{status:'error',message:'合成提醒失敗'}:{status:'ok',contract:'store-rule-reminders-v1',available:false,expiresAt:Math.floor(Date.now()/1000)+3600};
  else if(p.action==='ptlogout')result={status:'ok'};
  else return route.abort('blockedbyclient');
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto(PAGE);await expect(page.locator('#workspace')).toBeVisible();
 return {calls,urls,errors,recover:()=>{fail=false;}};
}
test('read route mismatch retries with a distinct transport URL and no writes',async({page})=>{
 const s=await setup(page,{routeFailures:2});await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreDashboard')).toBeVisible();expect(s.urls).toHaveLength(3);expect(new Set(s.urls).size).toBe(3);expect(s.calls.filter(p=>/publish|restore/.test(p.action))).toEqual([]);expect(s.errors).toEqual([]);
});
test('a failed first read recovers when returning to the store tab without a file',async({page})=>{
 const s=await setup(page,{readError:true});await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreMessage')).toContainText('合成讀取失敗');s.recover();await page.locator('[data-tab="gold"]').click();await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);await expect(page.locator('#scoreFile')).toHaveValue('');expect(s.errors).toEqual([]);
});
test('slow valid saved data gets enough time without duplicate reads',async({page})=>{
 await page.clock.install();const s=await setup(page,{slowMs:30000});await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreMessage')).toContainText('正在');await page.clock.runFor(30010);await expect(page.locator('#scoreDashboard')).toBeVisible();expect(s.urls).toHaveLength(1);expect(s.errors).toEqual([]);
});
test('timeout has a readable terminal error, re-enables refresh, and refresh recovers',async({page})=>{
 await page.clock.install();await setup(page,{slowMs:200000});await page.locator('[data-tab="store"]').click();await page.clock.runFor(80000);await expect(page.locator('#scoreMessage')).toContainText('逾時');await expect(page.locator('#scoreMessage')).not.toContainText('正在');await expect(page.locator('#scoreRefresh')).toBeEnabled();await expect(page.locator('#scoreDashboard')).toBeHidden();await page.evaluate(()=>{window.syntheticScoresDelay=0;});await page.locator('#scoreRefresh').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);await expect(page.locator('#scoreFile')).toHaveValue('');
});
test('reminders timeout cannot delay, clear, or disable saved scores',async({page})=>{
 await page.clock.install();const s=await setup(page,{rulesTimeout:true});await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);await page.clock.runFor(20010);await expect(page.locator('#store-rules-status')).toContainText('逾時');await expect(page.locator('#scoreDashboard')).toBeVisible();await expect(page.locator('#scoreRefresh')).toBeEnabled();expect(s.errors).toEqual([]);
});
for(const width of [1440,390])test(`saved data, reminders failure, fresh reload, filters and readable type at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});const s=await setup(page);await expect(page.locator('#peopleBody tr')).toHaveCount(12);
 const sizes=await page.evaluate(()=>({name:parseFloat(getComputedStyle(document.querySelector('#peopleBody td')).fontSize),number:parseFloat(getComputedStyle(document.querySelector('#peopleBody .number')).fontSize),placement:parseFloat(getComputedStyle(document.querySelector('.month-placement')).fontSize),heading:parseFloat(getComputedStyle(document.querySelector('#peopleHead th')).fontSize)}));
 expect(sizes.name).toBeGreaterThanOrEqual(19);expect(sizes.number).toBeGreaterThanOrEqual(21);expect(sizes.placement).toBeGreaterThanOrEqual(16);expect(sizes.heading).toBeGreaterThanOrEqual(16);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('#peopleBody').evaluate(e=>e.closest('.table-scroll').clientWidth<e.closest('table').scrollWidth)).toBe(width===390);
 const dir=path.resolve(__dirname,'../../evidence');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(dir,`gold-${width}.png`),fullPage:true});await page.evaluate(()=>window.scrollTo(0,document.querySelector('#goldSummary').offsetTop-70));await page.screenshot({path:path.join(dir,`gold-table-${width}.png`)});if(width===390){await page.locator('#peopleBody').evaluate(e=>{e.closest('.table-scroll').scrollLeft=document.querySelector('#peopleHead th:nth-child(2)').offsetWidth;});await page.screenshot({path:path.join(dir,'gold-table-scroll-390.png')});}
 await page.locator('[data-tab="store"]').click();await expect(page.locator('#store-rules-status')).toContainText('提醒服務');await expect(page.locator('#scoreBody tr')).toHaveCount(9);await expect(page.locator('#scoreSourceMeta')).toContainText('完整（6/6月）');await expect(page.locator('#scoreFile')).toHaveValue('');
 await page.locator('#scorePeriod').selectOption('2026-07');await page.locator('#scoreRegion').selectOption('北一二D');await expect(page.locator('#scoreBody tr')).toHaveCount(3);await page.locator('#scoreStore').selectOption('合成店D1');await expect(page.locator('#scoreBody tr')).toHaveCount(1);await page.locator('[data-score-detail]').click();await expect(page.locator('#scoreDetail')).toContainText('7月!G');
 await page.locator('#scoreRefresh').click();await expect(page.locator('#scoreMessage')).not.toContainText('正在');await expect(page.locator('#scoreRegion')).toHaveValue('北一二D');await expect(page.locator('#scoreStore')).toHaveValue('合成店D1');
 await page.locator('[data-tab="gold"]').click();await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(1);await page.reload();await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);await expect(page.locator('#scoreFile')).toHaveValue('');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(dir,`store-${width}.png`),fullPage:true});expect(s.errors).toEqual([]);expect(s.calls.filter(p=>/publish|restore/.test(p.action))).toEqual([]);fs.writeFileSync(path.join(dir,`metrics-${width}.json`),JSON.stringify({viewport:width,sizes,readCalls:s.urls.length,noWrites:true,noFile:true,errors:s.errors},null,2));
});
