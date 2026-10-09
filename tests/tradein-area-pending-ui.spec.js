'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');
const Fixture=require('./threec-search-fixture.cjs');
let BASE,server;
test.beforeAll(async()=>{
 const root=path.resolve(__dirname,'..');server=http.createServer(async(req,res)=>{
  try{const f=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(path.relative(root,f).startsWith('..'))throw Error();
   const type={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css'}[path.extname(f)];if(!type)throw Error();
   res.writeHead(200,{'Content-Type':type+';charset=utf-8','Connection':'close'});res.end(await fs.readFile(f));
  }catch{res.writeHead(404);res.end();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));BASE=`http://127.0.0.1:${server.address().port}/`;
});
test.afterAll(async()=>{if(server)await new Promise(r=>server.close(r));});
async function isolate(page){
 const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===new URL(BASE).origin)return route.continue();
  if(url.hostname!=='script.google.com')return route.abort('blockedbyclient');
  const text=req.postData()||'{}';let payload;try{payload=JSON.parse(text);}catch{payload=JSON.parse(new URLSearchParams(text).get('payload')||'{}');}
  calls.push(payload);if(!['threec_snapshot_read','threec_changes_read'].includes(payload.action))return route.abort('blockedbyclient');
  const body=Fixture[payload.kind]();
  if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<script>window.top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body})+',"*")</script>'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });return {calls,errors};
}
for(const width of [1280,390,320])test(`${width}px recovery and goal tabs preserve pending region/store/person without fabricated units`,async({page},info)=>{
 const {calls,errors}=await isolate(page);await page.setViewportSize({width,height:900});
 await page.goto(BASE+'home.html');await page.locator('a.card[href="tradein-query.html"]').click();
 await expect(page.locator('.area-nav a')).toHaveText(['回收價查詢','目標進度']);
 await expect(page.locator('.area-nav a[href="threec-query.html"]')).toHaveCount(0);
 await expect(page.locator('#tradeinResults')).toContainText('示範回收');
 await page.locator('.area-nav a[href="tradein-progress.html"]').click();
 await expect(page.locator('h1')).toHaveText('舊換新專區');
 await expect(page.locator('nav.tabs a')).toHaveText(['回收價查詢','目標進度']);
 await expect(page.locator('#performancePending')).toContainText('尚未匯入／未驗證');
 await expect(page.locator('#pending-region')).toBeVisible();
 await expect(page.locator('#privateWorkspace')).toBeHidden();await expect(page.locator('#locked')).toBeHidden();
 for(const scope of ['region','store','person']){
  await page.locator('[data-progress-scope="'+scope+'"]').click();
  await expect(page.locator('#pending-'+scope)).toBeVisible();
  await expect(page.locator('#pending-'+scope)).toContainText('尚未匯入');
  await expect(page.locator('#performancePending')).not.toContainText(/0\s*[／/]\s*3|已達標|SYNTHETIC|員編/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`PENDING-${scope}-${width}.png`),fullPage:true});
 }
 await page.locator('#scope-person').press('ArrowRight');await expect(page.locator('#scope-region')).toBeFocused();
 await expect(page.locator('#pending-region')).toBeVisible();
 expect(calls.every(p=>p.action==='threec_snapshot_read')).toBe(true);
 await page.getByRole('link',{name:'回收價查詢',exact:true}).click();await expect(page.locator('#tradeinResults')).toContainText('示範回收');
 await page.locator('.home-link').click();await page.locator('a.card[href="threec-query.html"]').click();await expect(page.locator('h1')).toHaveText('手機專案價查詢');
 await page.goto(BASE+'app.html');await expect(page.getByRole('region',{name:'公開查價'}).getByRole('link',{name:'手機專案價查詢',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
test('saved identity cannot bypass pending gate or send performance/device/import actions',async({page})=>{
 const {calls,errors}=await isolate(page);
 await page.addInitScript(()=>{localStorage.setItem('north12b_private_dashboard_employee_id','SYNTH001');localStorage.setItem('north12b_private_dashboard_device_id','SYNTHETIC_DEVICE_ONLY');});
 await page.goto(BASE+'tradein-progress.html');await expect(page.locator('#performancePending')).toBeVisible();
 await expect(page.locator('#employeeId')).toHaveValue('');
 for(const id of ['employeeId','checkBinding','previewUpload','publishUpload','rollbackUpload','refreshData','sourceFile'])await expect(page.locator('#'+id)).toBeDisabled();
 await page.locator('#scope-store').click();await page.locator('#scope-person').click();
 await page.waitForTimeout(300);expect(calls).toEqual([]);expect(errors).toEqual([]);
 expect(await page.evaluate(()=>localStorage.getItem('north12b_private_dashboard_device_id'))).toBe('SYNTHETIC_DEVICE_ONLY');
 await expect(page.locator('#storeRows tr')).toHaveCount(0);await expect(page.locator('#staffRows tr')).toHaveCount(0);
});
