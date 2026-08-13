const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { patrolSummaryResponse } = require('./fixtures/patrol-summary-response.cjs');

const APP_URL = `file://${path.resolve(__dirname, '../app.html')}`;
const PREVIEW_URL = `${APP_URL}?preview=1`;

test.use({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });

test('App 1.3 preview shows yesterday follow-up and store manager semantics without overflow', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto(PREVIEW_URL);

  await expect(page.locator('#yesterdayFollowUpHome')).toBeVisible();
  await expect(page.locator('#yesterdayFollowUpHome')).toContainText('昨日待追蹤');
  await expect(page.locator('#yesterdayFollowUpHome button')).toHaveCSS('min-height','64px');
  await page.locator('#yesterdayFollowUpHome button').click();
  await expect(page.locator('#yesterdayFollowUpPanel')).toBeVisible();
  await expect(page.locator('#yesterdayFollowUp')).toContainText('零報原因');

  await page.locator('.bottom-nav [data-nav="battle"]').click();
  await page.locator('[data-battle-kind="personal"]').click();
  await page.locator('[data-battle-scope="store"]').click();
  await page.locator('#battleStoreSelect').selectOption('永吉');
  await expect(page.locator('.manager-store-panel')).toContainText('店長管理資訊');
  await expect(page.locator('.manager-store-panel')).toContainText('店 KPI');
  await expect(page.locator('.manager-store-panel')).toContainText('公司排名');
  await expect(page.locator('.manager-store-panel')).toContainText('AQ');
  await expect(page.locator('.manager-store-panel')).not.toContainText('總績效');
  await expect(page.locator('.manager-store-panel')).not.toContainText('個人排名');
  await expect(page.locator('.personal-performance-panel').nth(1)).toContainText('店點人員');

  const layout=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    newControlHeights:Array.from(document.querySelectorAll('#battleStoreSelect')).map(node=>node.getBoundingClientRect().height)
  }));
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.newControlHeights.every(height=>height>=44)).toBe(true);
  expect(errors).toEqual([]);
});

test('native cold launch exchanges an approved device assertion for the existing patrol session', async ({ page }) => {
  const actions=[];
  await page.addInitScript(()=>{
    localStorage.setItem('north12b_private_dashboard_employee_id','TEST01');
    localStorage.setItem('north12b_private_dashboard_device_id','approved-device-1');
  });
  await page.route('https://script.google.com/**', async route=>{
    const request=route.request();
    if(request.method()==='POST'){
      const payload=JSON.parse(request.postData()||'{}');
      actions.push(payload.action);
      if(payload.action==='private_access') return route.fulfill({json:{status:'ok',profile:{maskedName:'測＊員'},snapshot:{}}});
      if(payload.action==='private_patrol_assertion') return route.fulfill({json:{status:'ok',assertion:'one-time-device-assertion'}});
      if(payload.action==='ptauth_device') return route.fulfill({json:{status:'ok',token:'short-patrol-session',expiresIn:1800}});
      if(payload.action==='ptsummary') return route.fulfill({json:patrolSummaryResponse('2026-08')});
      if(payload.action==='kpicalc_access') return route.fulfill({json:{status:'ok',data:{}}});
      if(payload.action==='read') return route.fulfill({json:{status:'ok',data:{},summary:{semantics:'formal-index-summary-v1',completedStores:0,totalStores:9,missingStores:[],metrics:{}}}});
      if(payload.action==='pread') return route.fulfill({json:{status:'ok',data:{}}});
      return route.fulfill({json:{status:'error',message:`unexpected POST ${payload.action}`}});
    }
    const action=new URL(request.url()).searchParams.get('action');
    actions.push(action);
    if(action==='sread') return route.fulfill({json:{status:'ok',schedule:{month:'2026-08',stores:[]}}});
    if(action==='ptvisit_read') return route.fulfill({json:{status:'ok',events:[]}});
    if(action==='hread') return route.fulfill({json:{status:'ok',rows:[]}});
    return route.fulfill({json:{status:'error',message:`unexpected GET ${action}`}});
  });

  await page.goto(`${APP_URL}?native=1#me`);
  await expect(page.locator('#patrolAccessForm')).toBeHidden();
  await expect(page.locator('#privateDeviceStatus')).toHaveText('此 iPhone App 裝置已核准');
  await expect(page.locator('#patrolAccessMessage')).toContainText('Approved Device 已自動驗證');
  expect(actions).toContain('private_access');
  expect(actions).toContain('private_patrol_assertion');
  expect(actions).toContain('ptauth_device');
  expect(actions).not.toContain('ptauth');
  const session=await page.evaluate(()=>sessionStorage.getItem('bei12b_pt_session_token'));
  expect(session).toBe('short-patrol-session');
});

test('regular website keeps the existing patrol passcode form and never auto-runs the device bridge', async ({ page }) => {
  const actions=[];
  await page.route('https://script.google.com/**', async route=>{
    const payload=JSON.parse(route.request().postData()||'{}');
    actions.push(payload.action);
    await route.fulfill({json:{status:'error',message:'not used'}});
  });
  await page.goto(`${APP_URL}#me`);
  await expect(page.locator('#patrolAccessForm')).toBeVisible();
  await expect(page.locator('#patrolPasscode')).toBeVisible();
  expect(actions).not.toContain('private_patrol_assertion');
  expect(actions).not.toContain('ptauth_device');
});
