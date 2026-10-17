'use strict';
const {test,expect}=require('@playwright/test');
const {runtime}=require('./helpers/readonly-conversion-runtime.cjs'),{workbook}=require('./helpers/readonly-conversion-workbook.cjs');
const {fixture:businessFixture}=require('./helpers/readonly-dashboard-fixture.cjs');
async function setup(page,{login=true,hold=null}={}){
  const b=runtime({post:true}),calls=[],errors=[],origin=new URL(process.env.TEST_BASE_URL).origin;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();
    if(url.hostname!=='script.google.com')return route.abort();
    const payload=request.postDataJSON();calls.push({name:payload.action,payload,method:request.method(),headers:request.headers()});
    if(hold)await hold.promise;
    const result=b.post(payload);
    await route.fulfill({headers:{'content-type':'application/json','access-control-allow-origin':origin},body:JSON.stringify(result)}).catch(()=>{});
  });
  await page.goto(new URL('readonly-conversion-upload.html',process.env.TEST_BASE_URL).href);
  if(login){await page.locator('#employeeId').fill(b.auth.employeeId);await page.locator('#adminSecret').fill(b.auth.adminSecret);await page.locator('#loginBtn').click();await expect(page.locator('#app')).toBeVisible();await expect(page.locator('#conversionPreviewBtn')).toBeEnabled();}
  return{b,calls,errors};
}
async function preview(page,options={}){
  await page.locator('#conversionFile').setInputFiles({name:'synthetic-conversion.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook(options)});
  await page.locator('#conversionPreviewBtn').click();
}
test('real XLSX parser → actual doPost/original admin guard → private readback → dashboard → rollback',async({page},info)=>{
  const s=await setup(page);await preview(page);await expect(page.locator('#conversionPreview')).toBeVisible();await expect(page.locator('#conversionPreviewText')).toContainText('27 店日');expect(s.b.files.size).toBe(0);
  await page.locator('#conversionConfirm').check();await page.locator('#conversionPublishBtn').click();await expect(page.locator('#conversionMessage')).toContainText('已完成私有版本讀回');expect(s.b.files.size).toBe(1);
  const sent=s.calls.find(c=>c.name==='readonly_conversion_preview').payload;expect(sent.snapshot.records).toHaveLength(27);expect(sent).not.toHaveProperty('fileBase64');expect(sent).not.toHaveProperty('fileBytes');expect(sent.snapshot.cutoff).toBe('2026-10-03');
  await page.screenshot({path:info.outputPath('conversion-published.png'),fullPage:true});
  const consumer=await page.context().newPage(),bundle=businessFixture(),expiresAt=Date.now()+1800000;
  bundle.privateResult.snapshot=s.b.context.readonlyConversionAttach_(bundle.privateResult.snapshot);
  await consumer.addInitScript(expiresAt=>{localStorage.setItem('north12b_private_dashboard_device_id','SYNTHETIC_DEVICE_123456');sessionStorage.setItem('north12b_password_session_v1',JSON.stringify({v:1,owner:'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',deviceId:'SYNTHETIC_DEVICE_123456',token:'B1_a_'+'a'.repeat(64),logoutEpoch:'',expiresAt}));},expiresAt);
  await consumer.route('**/*',route=>new URL(route.request().url()).origin===new URL(process.env.TEST_BASE_URL).origin?route.continue():route.fulfill({json:{status:'ok',trustSource:'password-bound',phoneEligible:false,expiresAt,...bundle}}));
  await consumer.goto(new URL('readonly-dashboard.html',process.env.TEST_BASE_URL).href);await expect(consumer.locator('#controls')).toBeVisible();await consumer.locator('[data-tab="traffic"]').click();await expect(consumer.locator('#source-note')).toContainText('2026-10-03');await expect(consumer.locator('#aq-chart circle')).toHaveCount(3);await expect(consumer.locator('#aq-chart rect')).toHaveCount(0);await consumer.close();
  await preview(page);await expect(page.locator('#conversionPreview')).toBeVisible();await page.locator('#conversionConfirm').check();await page.locator('#conversionPublishBtn').click();await expect(page.locator('#conversionMessage')).toContainText('未重複寫入或累加');expect(s.b.files.size).toBe(1);
  page.once('dialog',d=>d.accept());await page.locator('#conversionRollbackBtn').click();await expect(page.locator('#conversionMessage')).toContainText('已回復並完成');expect(s.b.state.active).toBeNull();expect(s.errors).toEqual([]);
  expect(s.calls.every(c=>c.method==='POST'&&c.headers['content-type'].startsWith('text/plain'))).toBe(true);
  expect(await page.evaluate(()=>Object.values(localStorage).concat(Object.values(sessionStorage)).some(v=>v.includes('synthetic-admin-proof')))).toBe(false);
});
test('incorrect total fails locally and never invokes private preview or publication',async({page})=>{
  const s=await setup(page);await preview(page,{bad:true});await expect(page.locator('#conversionMessage')).toContainText('TTL');expect(s.calls.some(c=>c.name==='readonly_conversion_preview'||c.name==='readonly_conversion_publish')).toBe(false);expect(s.b.state).toBeNull();await expect(page.locator('#conversionPublishBtn')).toBeDisabled();expect(s.errors).toEqual([]);
});
test('changed private revision invalidates a previously compared preview',async({page})=>{
  const s=await setup(page);await preview(page);await expect(page.locator('#conversionPreview')).toBeVisible();s.b.properties.set('READONLY_CONVERSION_STATE_V1',JSON.stringify({schema:1,revision:1,active:null,previous:null,canRollback:false}));
  await page.locator('#conversionConfirm').check();await page.locator('#conversionPublishBtn').click();await expect(page.locator('#conversionMessage')).toContainText('正式版本已變更');expect(s.b.files.size).toBe(0);await expect(page.locator('#conversionPublishBtn')).toBeDisabled();expect(s.errors).toEqual([]);
});
test('changing file or leaving clears the prior confirmation before publication',async({page})=>{
  const s=await setup(page);await preview(page);await expect(page.locator('#conversionPreview')).toBeVisible();await page.locator('#conversionConfirm').check();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#conversionPreview')).toBeHidden();await expect(page.locator('#conversionPublishBtn')).toBeDisabled();await expect(page.locator('#conversionFile')).toHaveValue('');expect(s.b.files.size).toBe(0);expect(s.errors).toEqual([]);
});
test('ordinary or missing admin proof is denied through the original POST guard',async({page})=>{
  const s=await setup(page,{login:false});await page.locator('#employeeId').fill('SYN002');await page.locator('#adminSecret').fill(s.b.auth.adminSecret);await page.locator('#loginBtn').click();await expect(page.locator('#authMessage')).toContainText('此員編未被授權');await expect(page.locator('#app')).toBeHidden();expect(s.b.files.size).toBe(0);expect(s.b.events.filter(e=>e==='folder')).toEqual([]);expect(s.errors).toEqual([]);
});
test('leaving during login cannot reopen the admin panel from a late response',async({page})=>{
  let release;const hold={promise:new Promise(resolve=>release=resolve)},s=await setup(page,{login:false,hold});await page.locator('#employeeId').fill(s.b.auth.employeeId);await page.locator('#adminSecret').fill(s.b.auth.adminSecret);await page.locator('#loginBtn').click();await expect.poll(()=>s.calls.length).toBe(1);await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));release();await expect(page.locator('#app')).toBeHidden();await expect(page.locator('#adminSecret')).toHaveValue('');expect(s.errors).toEqual([]);
});
for(const width of [320,390])test('update source and confirmation fit '+width+'px without private persistence',async({page},info)=>{
  await page.setViewportSize({width,height:844});const s=await setup(page);await preview(page);await expect(page.locator('#conversionPreview')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('conversion-preview-'+width+'.png'),fullPage:true});expect(s.errors).toEqual([]);
});
