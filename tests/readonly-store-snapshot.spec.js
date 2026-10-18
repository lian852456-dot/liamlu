const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const S=require('../readonly-store-snapshot.js'),A=require('../readonly-dashboard-adapter.js'),{fixture}=require('./helpers/readonly-dashboard-fixture.cjs');
const model=()=>A.fromBundle(fixture());
function writeSnapshot(info,value=model()){
 const file=info.outputPath('snapshot.html');fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,S.buildHtml(S.fromModel(value,{generatedAt:'2026-10-18T04:00:00Z',exampleLabel:'合成驗收資料，非正式營運數據'})));
 return pathToFileURL(file).href;
}
async function isolated(browser,info,{width=390,value=model(),javaScriptEnabled=true}={}){
 const context=await browser.newContext({viewport:{width,height:900},offline:true,javaScriptEnabled});
 const page=await context.newPage(),requests=[],errors=[];
 page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(writeSnapshot(info,value));return {page,context,requests,errors};
}
async function live(page,{auth=true,ttl=1800000}={}){
 const bundle=fixture(),calls=[],expiresAt=Date.now()+ttl;
 if(auth)await page.addInitScript(({expiresAt})=>{
  localStorage.setItem('north12b_private_dashboard_device_id','SYNTHETIC_DEVICE_123456');
  sessionStorage.setItem('north12b_password_session_v1',JSON.stringify({v:1,owner:'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',deviceId:'SYNTHETIC_DEVICE_123456',token:'B1_a_'+'a'.repeat(64),logoutEpoch:'',expiresAt}));
 },{expiresAt});
 await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname!=='script.google.com')return route.abort();
  const payload=route.request().postDataJSON();calls.push(payload.action);
  await route.fulfill({json:{status:'ok',trustSource:'password-bound',phoneEligible:false,expiresAt,...bundle}});
 });
 await page.goto(new URL('readonly-dashboard.html',process.env.TEST_BASE_URL).href);return {calls};
}

test('one click downloads an offline projection without a second API call and preserves supervisor tabs',async({page,browser},info)=>{
 const s=await live(page);await expect(page.locator('#store-export')).toBeEnabled();
 await page.locator('h1').evaluate(el=>{el.textContent='唯讀儀表板 · 隔離合成驗收';});
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.screenshot({path:info.outputPath('live-export-button-'+width+'-isolated.png'),fullPage:true});}
 const pending=page.waitForEvent('download');await page.locator('#store-export').click();const download=await pending;
 const file=info.outputPath(download.suggestedFilename());await download.saveAs(file);
 expect(s.calls).toEqual(['employee_dashboard_read']);await expect(page.locator('#export-status')).toContainText('不含個人資料或獎金');
 await page.locator('[data-tab="personal"]').click();await expect(page.locator('.person-table tbody tr')).toHaveCount(9);
 const context=await browser.newContext({offline:true}),offline=await context.newPage();const requests=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await offline.goto(pathToFileURL(file).href);await expect(offline.locator('#store')).toBeEnabled();
 await expect(offline.locator('[data-tab]')).toHaveCount(3);await expect(offline.locator('script[src],link[href],form,iframe,input[type="file"]')).toHaveCount(0);
 expect(await offline.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);expect(requests).toEqual([]);await context.close();
});
test('anonymous and expired original sessions cannot export',async({page})=>{
 const s=await live(page,{auth:false});await expect(page.locator('#store-export')).toBeDisabled();expect(s.calls).toEqual([]);
});
test('original expiry clears the export capability with the private presentation',async({page})=>{
 await page.clock.install();await live(page,{ttl:3000});await expect(page.locator('#store-export')).toBeEnabled();
 await page.clock.runFor(3100);await expect(page.locator('#store-export')).toBeDisabled();await expect(page.locator('#controls')).toBeHidden();
});
for(const width of [320,390,1280])test('offline filtering and all three layouts fit '+width+'px',async({browser},info)=>{
 const s=await isolated(browser,info,{width});
 for(const tab of ['kpi','conversion','traffic']){
  await s.page.locator('[data-tab="'+tab+'"]').click();await expect(s.page.locator('#snapshot-content')).toBeVisible();
  expect(await s.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  expect(await s.page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);return new Set(ids).size===ids.length;})).toBe(true);
  await s.page.screenshot({path:info.outputPath(tab+'-'+width+'.png'),fullPage:true});
 }
 await s.page.locator('#store').selectOption('DNB10062');await s.page.locator('[data-tab="kpi"]').click();
 await expect(s.page.locator('#snapshot-content .person-table tbody tr')).toHaveCount(1);
 await expect(s.page.locator('.snapshot-range')).toContainText('2026-10-13');await expect(s.page.locator('.snapshot-range')).toContainText('2026-10-11');
 expect(s.requests).toEqual([]);expect(s.errors).toEqual([]);await s.context.close();
});
test('offline MoM respects the original full period and never fabricates daily prior values',async({browser},info)=>{
 const s=await isolated(browser,info);await s.page.locator('[data-tab="traffic"]').click();
 await expect(s.page.locator('#snapshot-content .metrics')).toContainText('MoM +40.00%');
 await s.page.locator('[data-tab="conversion"]').click();await expect(s.page.locator('#snapshot-content .metrics')).toContainText('MoM +42.86%');
 await s.page.locator('#store').selectOption('DNB10062');await s.page.locator('[data-tab="traffic"]').click();await expect(s.page.locator('#snapshot-content .metrics')).toContainText('MoM 0.00%');await s.page.locator('#store').selectOption('all');
 await expect(s.page.locator('#snapshot-content #aq-mom-chart circle')).toHaveCount(2);
 await expect(s.page.locator('#snapshot-content #aq-chart circle')).toHaveCount(11);
 await expect(s.page.locator('#snapshot-content')).toContainText('未繪製上月逐日趨勢');
 await s.page.locator('#snapshot-content [data-start]').fill('2026-10-05');
 await expect(s.page.locator('#snapshot-content #aq-mom-chart')).toHaveCount(0);await expect(s.page.locator('#snapshot-content')).toContainText('無法計算MoM');
 await s.page.locator('#snapshot-content [data-end]').fill('');await expect(s.page.locator('#snapshot-content [data-start]')).toHaveValue('2026-10-01');
 await s.page.locator('#snapshot-content [data-mode="cumulative"]').click();const point=s.page.locator('#snapshot-content #aq-chart circle').last();
 await point.focus();await point.press('Enter');await expect(s.page.locator('#snapshot-content #aq-chart + .day-readout')).toContainText('自起日累計');
 expect(s.requests).toEqual([]);expect(s.errors).toEqual([]);await s.context.close();
});
test('missing source does not become zero-valued charts or an invented date',async({browser},info)=>{
 const value=model();value.conversion=null;value.kpi.data.aggregate.overall_kpi=null;
 const s=await isolated(browser,info,{value});await expect(s.page.locator('#snapshot-content .value').first()).toHaveText('—');
 await s.page.locator('[data-tab="traffic"]').click();await expect(s.page.locator('#snapshot-content')).toContainText('缺值不補零');await expect(s.page.locator('#snapshot-content svg')).toHaveCount(0);
 await expect(s.page.locator('.snapshot-range')).toContainText('未取得已核實來源');expect(s.errors).toEqual([]);await s.context.close();
});
test('malicious source labels stay text in the actual offline document',async({browser},info)=>{
 const value=model();value.kpi.sourceName='</script><img src=https://invalid.example/x onerror="window.__snapshotPwned=1">';
 value.kpi.version='<svg onload="window.__snapshotPwned=2">';
 const s=await isolated(browser,info,{value});await expect(s.page.locator('#snapshot-content .page-source')).toContainText('<img src=');
 expect(await s.page.evaluate(()=>window.__snapshotPwned)).toBeUndefined();await expect(s.page.locator('img,svg[onload],[onerror]')).toHaveCount(0);
 expect(s.requests).toEqual([]);expect(s.errors).toEqual([]);await s.context.close();
});
test('mail-style static preview still shows all observed tables when JavaScript is disabled',async({browser},info)=>{
 const s=await isolated(browser,info,{javaScriptEnabled:false});
 await expect(s.page.locator('#snapshot-content')).toContainText('125.0%');await expect(s.page.locator('.snapshot-fallback')).toBeVisible();
 await expect(s.page.locator('.snapshot-fallback')).toContainText('未繪製上月逐日趨勢');await expect(s.page.locator('#store')).toBeDisabled();
 expect(s.requests).toEqual([]);expect(s.errors).toEqual([]);await s.context.close();
});
