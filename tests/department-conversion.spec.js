'use strict';
const {test,expect}=require('@playwright/test');
const X=require('../assets/vendor/xlsx.full.min.js'),O=require('../north12-officer-core.js'),P=require('../conversion-publication-core.js');
const {source}=require('./helpers/renewal-detail-workbook.cjs'),{runtime,fixture}=require('./helpers/readonly-conversion-runtime.cjs');
async function setup(page,{cross=false}={}){
 const backend=runtime({post:true}),requests=[],errors=[],origin=new URL(process.env.TEST_BASE_URL).origin;
 const data=O.parseWorkbook(source({days:11}),X,{sha256:'a'.repeat(64),source_name:'synthetic-department.xlsx',source_bytes:1234});
 if(cross){data.renewalDetail={...data.renewalDetail,tiers:[],coverage:{...data.renewalDetail.coverage,tiers:false,cross:true},cross:data.records.filter(row=>row.rt_d>0).map(row=>({store:row.store,date:row.date,tier:'A',plan:'合成專案 <標準>',tariff:'129',visitors:row.rt_d,renewals:row.rt_n,unrenewed:row.rt_d-row.rt_n}))};}
 const control={mode:'ok'};
 const publish=snapshot=>{const preview=backend.call('Preview',{snapshot});return backend.call('Publish',{previewToken:preview.token,confirm:true});};
 const published=publish(P.fromOfficer(data));
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());if(url.origin===origin)return route.continue();
  if(url.hostname!=='script.google.com')return route.abort();
  const body=req.postDataJSON();requests.push(body);
  if(control.mode==='network')return route.abort('failed');
  if(control.mode==='denied')return route.fulfill({json:{status:'error',message:'管理者驗證失敗'},headers:{'access-control-allow-origin':origin}});
  await route.fulfill({json:backend.post(body),headers:{'access-control-allow-origin':origin}});
 });
 await page.goto(new URL('department-conversion.html',process.env.TEST_BASE_URL).href);
 return {backend,data,publish,published,requests,errors,control};
}
async function login(page,backend){await page.locator('#employee').fill(backend.auth.employeeId);await page.locator('#secret').fill(backend.auth.adminSecret);await page.locator('#login').click();await expect(page.locator('#workspace')).toBeVisible();}
test('single published pointer loads department, regions, stores and weekly trends without another upload',async({page},info)=>{
 const s=await setup(page);expect(s.requests).toHaveLength(0);await login(page,s.backend);
 await expect(page.locator('#coverage')).toContainText('正式版本 '+s.published.live.revision);
 await expect(page.locator('#coverage')).toContainText('北一二A');await expect(page.locator('#coverage')).toContainText('北一二D');
 const frame=page.frameLocator('#report');await expect(frame.locator('#view')).toBeVisible();await expect(frame.locator('#files')).toHaveCount(0);
 await expect(frame.locator('#content')).toContainText('每週趨勢');await expect(frame.locator('#content')).toContainText('北一處均值來源尚未納入');
 await frame.locator('#region').selectOption('北一二B');await frame.locator('#store').selectOption('DNB10440');await expect(frame.locator('#source')).toContainText('目前選取 1 店');
 await frame.locator('[data-tab="insights"]').click();await expect(frame.locator('#content')).toContainText('每週 Tier × 原資費／專案');await expect(frame.locator('#content')).toContainText('同源交叉缺少或重複 Tier');
 await page.screenshot({path:info.outputPath('department-single-store.png')});
 expect(s.requests.every(r=>r.action==='readonly_conversion_department_read')).toBe(true);
 expect(await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage]))).not.toContain('synthetic-admin-proof');
 await page.locator('#logout').click();await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#report')).toHaveAttribute('srcdoc','');
 expect(s.errors).toEqual([]);
});
test('B-only newer source preserves regional provenance and blocks a mixed-period department comparison',async({page})=>{
 const s=await setup(page);s.publish(P.migrate(fixture({days:12,hash:'b'})));await login(page,s.backend);
 await expect(page.locator('#message')).toContainText('四區截止不同');await expect(page.locator('#coverage')).toContainText('北一二A：2026-10-11');await expect(page.locator('#coverage')).toContainText('北一二B：2026-10-12');
 await page.locator('#region').selectOption('北一二A');await expect(page.frameLocator('#report').locator('#source')).toContainText('2026-10-11');
 await page.locator('#region').selectOption('北一二B');await expect(page.frameLocator('#report').locator('#source')).toContainText('2026-10-12');
 expect(s.errors).toEqual([]);
});
test('bad owner proof cannot access the department report or keep a stale frame',async({page})=>{
 const s=await setup(page);await page.locator('#employee').fill('SYN002');await page.locator('#secret').fill(s.backend.auth.adminSecret);await page.locator('#login').click();await expect(page.locator('#message')).toContainText('未被授權');await expect(page.locator('#workspace')).toBeHidden();
 await login(page,s.backend);await expect(page.frameLocator('#report').locator('#view')).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await expect(page.locator('#report')).toHaveAttribute('srcdoc','');await expect(page.locator('#secret')).toHaveValue('');expect(s.errors).toEqual([]);
});
test('transient refresh keeps the last verified report, while a denied refresh clears it',async({page})=>{
 const s=await setup(page);await login(page,s.backend);await expect(page.frameLocator('#report').locator('#view')).toBeVisible();
 const previous=await page.locator('#report').getAttribute('srcdoc');s.control.mode='network';await page.locator('#refresh').click();await expect(page.locator('#message')).toContainText('保留前次已驗證畫面');await expect(page.locator('#report')).toHaveAttribute('srcdoc',previous);
 s.control.mode='denied';await page.locator('#refresh').click();await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#report')).toHaveAttribute('srcdoc','');expect(s.errors).toEqual([]);
});
test('weekly joint counts drill down with dates and escaped original plan names',async({page},info)=>{
 const s=await setup(page,{cross:true});await login(page,s.backend);const frame=page.frameLocator('#report');await expect(frame.locator('#view')).toBeVisible();
 await frame.locator('#region').selectOption('北一二B');await frame.locator('#store').selectOption('DNB10440');await frame.locator('#start').fill('2026-10-06');await frame.locator('[data-tab="insights"]').click();
 const table=frame.locator('.insight-panel').last();await expect(table).toContainText('10-06（二）～10-11（日）');await expect(table).toContainText('180');await expect(table).toContainText('129');await expect(table).toContainText('28.3%');await expect(table).toContainText('129');await expect(table).toContainText('合成專案 <標準>');
 await expect(frame.locator('#content script')).toHaveCount(0);await page.screenshot({path:info.outputPath('weekly-joint-counts.png')});
 await page.evaluate(()=>window.dispatchEvent(new Event('portal-before-logout')));await expect(page.locator('#report')).toHaveAttribute('srcdoc','');expect(s.errors).toEqual([]);
});
