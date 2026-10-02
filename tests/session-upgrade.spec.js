'use strict';
const {test,expect}=require('@playwright/test');
const BASE='http://127.0.0.1:8875/',CACHE='liam-supervisor-app-1-2-logout-20261002-v2';
test('controlled PWA upgrades cached old scripts and retains common logout on its first offline reload',async({page,context})=>{
 await page.goto(BASE+'home.html');
 await page.evaluate(async()=>{
  await new Promise((resolve,reject)=>{const request=indexedDB.open('bei12b-audit-drafts',1);request.onupgradeneeded=()=>request.result.createObjectStore('photos');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('photos','readwrite');tx.objectStore('photos').put(new Blob(['SYNTHETIC_PHOTO']),'synthetic');tx.oncomplete=()=>{db.close();resolve();};};});
  const cache=await caches.open('liam-supervisor-app-1-2-month-start-20261001-v2');
  await cache.put('/audit-report.js?v=20260821-p0-transport',new Response('/* SYNTHETIC_OLD_AUDIT */',{headers:{'Content-Type':'application/javascript'}}));
  await navigator.serviceWorker.register('/_session-test/old-worker.js',{scope:'/'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));
 });
 expect(await page.evaluate(async()=>await(await fetch('/audit-report.js?v=20260821-p0-transport')).text())).toContain('SYNTHETIC_OLD_AUDIT');
 await page.evaluate(async()=>{await navigator.serviceWorker.register('/service-worker.js?v=20261002-logout-2',{scope:'/',updateViaCache:'none'});});
 await expect.poll(()=>page.evaluate(async()=>await caches.keys())).toEqual([CACHE]);
 expect(await page.evaluate(async()=>await(await fetch('/audit-report.js?v=20260821-p0-transport')).text())).toContain('PortalLogout');
 expect(await page.evaluate(async()=>await(await fetch('/portal-logout.js?v=20261002-logout-2')).text())).toContain('auditTransportSource');
 await page.goto(BASE+'app.html?preview=1');await expect.poll(()=>page.evaluate(()=>Boolean(window.PortalLogout))).toBe(true);
 await page.evaluate(()=>{
  sessionStorage.setItem('north12b_private_dashboard_employee_id','SYNTHETIC_EMPLOYEE');
  localStorage.setItem('north12b_private_dashboard_device_id','SYNTHETIC_DEVICE');
  localStorage.setItem('bei12b_audit_draft_v1','SYNTHETIC_DRAFT');
  localStorage.setItem('bei12b_kpi_v1','SYNTHETIC_CALCULATION');
 });
 await context.setOffline(true);await page.reload();
 await expect.poll(()=>page.evaluate(()=>Boolean(window.PortalLogout))).toBe(true);
 await expect(page.locator('[data-portal-logout]')).toBeVisible();
 page.once('dialog',d=>d.accept());await page.locator('[data-portal-logout]').click();
 await expect(page.locator('#portal-session-note')).toContainText('已同步登出');
 expect(await page.evaluate(()=>[sessionStorage.getItem('north12b_private_dashboard_employee_id'),localStorage.getItem('north12b_private_dashboard_device_id'),localStorage.getItem('bei12b_audit_draft_v1'),localStorage.getItem('bei12b_kpi_v1')])).toEqual([null,'SYNTHETIC_DEVICE','SYNTHETIC_DRAFT','SYNTHETIC_CALCULATION']);
 expect(await page.evaluate(async()=>{const cache=await caches.open('liam-supervisor-app-1-2-logout-20261002-v2');return(await cache.keys()).some(r=>new URL(r.url).hostname==='script.google.com');})).toBe(false);
 expect(await page.evaluate(async()=>await new Promise((resolve,reject)=>{const request=indexedDB.open('bei12b-audit-drafts',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('photos'),get=tx.objectStore('photos').get('synthetic');get.onsuccess=async()=>{resolve(await get.result.text());db.close();};};}))).toBe('SYNTHETIC_PHOTO');
 await context.setOffline(false);
});
