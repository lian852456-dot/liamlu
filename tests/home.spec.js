'use strict';

const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs/promises');
const Model = require('../home-reminder-model.js');
const Questions = require('../patrol-question-versions.js');

const PAGE_URL = process.env.TEST_BASE_URL
  ? new URL('home.html', process.env.TEST_BASE_URL).href
  : 'file://' + path.resolve(__dirname, '../home.html');
const LOCAL_ORIGIN = new URL(PAGE_URL).origin;
const NOW = '2026-09-30T07:00:00.000Z';
const CONTEXT = Model.dateContext(NOW);
const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';
const DEVICE_KEY = 'north12b_private_dashboard_device_id';
const SESSION_KEY = 'bei12b_patrol_session_token_v2';
// Deliberately synthetic, non-working credentials; no production requests occur.
const KEYS = { employeeId:'SYNTHETIC_EMPLOYEE', deviceId:'SYNTHETIC_DEVICE', token:'SYNTHETIC_SESSION' };
const STORE_INSPECTION_URL = 'https://twm-store-inspection.liamlu245.chatgpt.site/';
const UPLOAD_URL = 'https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec';
const EXPECTED_HREFS = [
  'kpi-battle.html', 'awards-battle.html', 'index.html', 'gold-medal.html',
  'kpi.html', 'kpitry.html', 'gold-medal.html', 'audit-report.html', STORE_INSPECTION_URL, 'threec-query.html', 'tradein-progress.html',
  'access-management.html', 'department-ops.html', 'patrol.html',
  'daily-log-dashboard.html', 'live-battle.html', UPLOAD_URL,
  'phone-stock-dashboard.html'
];
const DAILY_API = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
const PATROL_API = 'https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
const SCREENSHOTS = path.resolve(__dirname, '../test-results/homepage');

function salesFixture() {
  return { status:'ok', summary:{
    semantics:'formal-index-summary-v1', date:CONTEXT.yesterday, segment:21,
    totalStores:9, completedStores:9, missingStores:[], updatedAt:'21:40:00',
    stores:Model.STORES.map((store, index) => ({ name:store.name, reported:true, reportedAt:'21:40:00', metrics:{
      A999:{value:index === 0 ? 0 : 1, unit:'count', sourceField:'aq999'},
      '好速':{value:index === 1 ? 0 : 0.5, unit:'points', sourceField:'haosu'}
    } }))
  } };
}
function patrolFixture({ complete = false } = {}) {
  const stores = Model.STORES.map(store => ({name:store.name === '台北三創' ? store.name : `台北${store.name}`,code:store.code}));
  const rows = [];
  stores.forEach((store, index) => {
    // In the warning fixture, 通化 has zero visits and 酒泉 has one visit.
    if (!complete && index === 0) return;
    for (let item = 2; item <= 25; item += 1) rows.push({store:store.name, code:store.code, month:CONTEXT.month, fillTime:'2026-09-01 10:00', arriveTime:'2026-09-01 09:00', item, result:'v'});
    if (complete || index !== 1) rows.push({store:store.name, code:store.code, month:CONTEXT.month, fillTime:'2026-09-08 10:00', arriveTime:'2026-09-08 09:00', item:2,result:'v'});
  });
  return { status:'ok', contract:'patrol-dashboard-sep25-v1', version:1, month:CONTEXT.month,
    months:Questions.bimWindow(CONTEXT.month).months.filter(value => value <= CONTEXT.month), stores, storeCount:9,
    rowCount:rows.length, sourceRowCount:rows.length, maxRows:5000,
    summary:Questions.overview(rows, stores, CONTEXT.month), sourceVersion:'SYNTHETIC_TEST_ONLY_v1',
    sourceUpdatedAt:'2026-09-08T10:00:00+08:00', generatedAt:NOW
  };
}
const successful = payload => payload.action === 'private_access' ? {status:'ok'}
  : payload.action === 'ptauth' ? {status:'ok',token:payload.token,expiresIn:1800}
  : payload.action === 'read' ? salesFixture() : patrolFixture();
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function start(page, { keys = {}, reply = successful, reducedMotion = 'no-preference', viewport = {width:1280,height:1300}, now = NOW } = {}) {
  const calls = [];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize(viewport);
  await page.emulateMedia({ reducedMotion });
  await page.clock.install({ time:new Date(now) });
  await page.clock.pauseAt(new Date(now));
  await page.addInitScript(({ keys, EMPLOYEE_KEY, DEVICE_KEY, SESSION_KEY }) => {
    if (keys.employeeId) sessionStorage.setItem(EMPLOYEE_KEY, keys.employeeId);
    if (keys.legacyEmployeeId) localStorage.setItem(EMPLOYEE_KEY, keys.legacyEmployeeId);
    if (keys.deviceId) localStorage.setItem(DEVICE_KEY, keys.deviceId);
    if (keys.token) sessionStorage.setItem(SESSION_KEY, keys.token);
  }, { keys, EMPLOYEE_KEY, DEVICE_KEY, SESSION_KEY });
  // No external request can escape interception, including unexpected endpoints.
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === LOCAL_ORIGIN || url.protocol === 'file:') return route.continue();
    let payload;
    try { payload = request.postDataJSON(); } catch { payload = null; }
    const entry = { url:request.url(), method:request.method(), payload };
    calls.push(entry);
    if (url.hostname !== 'script.google.com' || !payload || !['private_access','read','ptauth','ptdashboard'].includes(payload.action)) return route.abort('blockedbyclient');
    const body = await reply(payload, entry, calls);
    if (body === 'NETWORK_ERROR') return route.abort('failed');
    await route.fulfill({ status:200, contentType:'application/json', body:typeof body === 'string' ? body : JSON.stringify(body) });
  });
  await page.goto(PAGE_URL);
  await expect(page.locator('#reminder-count')).toContainText(' / ');
  return { calls, errors };
}
async function ready(page) { await expect(page.locator('#reminder-refresh')).toBeEnabled(); }
async function next(page) { await page.locator('#reminder-next').click(); }
async function readSlides(page) {
  const count = Number((await page.locator('#reminder-count').innerText()).split('/')[1]);
  const result = [];
  for (let i = 0; i < count; i += 1) {
    result.push({ title:await page.locator('#reminder-title').innerText(), text:await page.locator('#reminder-text').innerText(), status:await page.locator('#reminder-status').getAttribute('data-status'), period:await page.locator('#reminder-period').innerText() });
    await next(page);
  }
  return result;
}
async function noOverflow(page) {
  const result = await page.evaluate(() => ({ width:innerWidth, body:document.body.scrollWidth, html:document.documentElement.scrollWidth,
    overflowing:[...document.querySelectorAll('a.card,.reminder,.brand,.search-box,.section-nav')].filter(element => element.getBoundingClientRect().right > innerWidth + 1 || element.getBoundingClientRect().left < -1).map(element => element.className) }));
  expect(result.body).toBeLessThanOrEqual(result.width);
  expect(result.html).toBeLessThanOrEqual(result.width);
  expect(result.overflowing).toEqual([]);
}
async function changeKeys(page, keys) {
  await page.evaluate(({ keys, EMPLOYEE_KEY, DEVICE_KEY, SESSION_KEY }) => {
    if (keys.employeeId) sessionStorage.setItem(EMPLOYEE_KEY,keys.employeeId); else sessionStorage.removeItem(EMPLOYEE_KEY);
    if (keys.deviceId) localStorage.setItem(DEVICE_KEY,keys.deviceId); else localStorage.removeItem(DEVICE_KEY);
    if (keys.token) sessionStorage.setItem(SESSION_KEY,keys.token); else sessionStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new StorageEvent('storage', {key:EMPLOYEE_KEY}));
  }, {keys,EMPLOYEE_KEY,DEVICE_KEY,SESSION_KEY});
}

test('首頁保留 PR179 個績入口與 PR181 測試入口移除，逐一核對實際連結', async ({page}) => {
  const {calls,errors} = await start(page);
  await ready(page);
  await expect(page.locator('[aria-label="常用入口"] .card')).toHaveCount(4);
  await expect(page.locator('[aria-label="同仁大廳"] .card')).toHaveCount(7);
  await expect(page.locator('[aria-label="督導專區"] .card')).toHaveCount(7);
  expect(await page.locator('a.card').evaluateAll(cards => cards.map(card => card.getAttribute('href')))).toEqual(EXPECTED_HREFS);
  await expect(page.locator('.quick-card').first()).toHaveAttribute('href','kpi-battle.html');
  await expect(page.locator('.quick-card').first()).toContainText('KPI 戰情');
  await expect(page.locator(`a.card[href="${STORE_INSPECTION_URL}"]`)).toHaveAttribute('target','_blank');
  await expect(page.locator(`a.card[href="${STORE_INSPECTION_URL}"]`)).toHaveAttribute('rel','noopener noreferrer');
  await expect(page.locator('#today')).toContainText('2026年9月30日');
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

test('同仁金牌查詢與常用明細保留，督導金牌入口移除、情報站上移', async ({page}) => {
  const {calls,errors} = await start(page); await ready(page);
  const staff = page.locator('[aria-label="同仁大廳"]');
  const performance = staff.locator('.tool-group').filter({has:page.getByRole('heading',{name:'業績與試算',exact:true})});
  const staffGold = performance.locator('a.card[href="gold-medal.html"]');
  await expect(staffGold).toHaveCount(1);
  await expect(staffGold.locator('h3')).toHaveText('北一二B｜金牌查詢');
  await expect(staff.locator('a[href="north12b-gold-ops.html"]')).toHaveCount(0);

  const quickGold = page.locator('[aria-label="常用入口"] a.card[href="gold-medal.html"]');
  await expect(quickGold).toHaveCount(1);
  await expect(quickGold.locator('h3')).toHaveText('北一二B 金牌明細');
  await expect(quickGold).toContainText('查看明細');

  const supervisor = page.locator('[aria-label="督導專區"]');
  const maintenance = supervisor.locator('a.card[href="north12b-gold-ops.html"]');
  await expect(maintenance).toHaveCount(0);
  expect(await supervisor.locator('.management-grid a.card').evaluateAll(cards=>cards.map(card=>card.getAttribute('href')))).toEqual(['access-management.html','department-ops.html','patrol.html']);
  await expect(supervisor.locator('.supervisor-grid a[href="patrol.html"]')).toHaveCount(0);
  await expect(supervisor.locator('a[href="gold-medal.html"]')).toHaveCount(0);
  expect(calls).toEqual([]);
  expect(errors).toEqual([]);
});

for (const viewport of [{width:1280,height:1300},{width:390,height:844},{width:320,height:800}]) {
  test(`${viewport.width}px 無水平溢出且所有入口可見`, async ({page}) => {
    await start(page,{viewport}); await ready(page); await noOverflow(page);
    await expect(page.locator('a.card:visible')).toHaveCount(EXPECTED_HREFS.length);
    const boxes = await page.locator('.quick-card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()));
    if (viewport.width >= 1280) expect(new Set(boxes.map(box => box.y)).size).toBe(1);
    else {
      expect(boxes[0].y).toBe(boxes[1].y);
      expect(boxes[2].y).toBe(boxes[3].y);
      expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
      const staffBoxes = await page.locator('.staff-grid .card').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().toJSON()));
      expect(staffBoxes.every((box,index) => index === 0 || box.y > staffBoxes[index - 1].y)).toBe(true);
    }
  });
}

test('搜尋不分大小寫、查無結果與清除搜尋會恢復所有工具', async ({page}) => {
  await start(page); await ready(page);
  await page.locator('#tool-search').fill('kPi');
  await expect(page.locator('a.card:visible')).toHaveCount(3);
  await expect(page.locator('#search-result')).toHaveText('找到 3 個工具');
  await page.locator('#tool-search').fill('不存在的工具__TEST');
  await expect(page.locator('a.card:visible')).toHaveCount(0);
  await expect(page.locator('#search-result')).toContainText('沒有符合的工具');
  await page.locator('#tool-search').fill('');
  await expect(page.locator('a.card:visible')).toHaveCount(EXPECTED_HREFS.length);
  await expect(page.locator('#search-result')).toBeHidden();
});

test('金牌搜尋只留下原查詢入口，搜尋清空不重現督導金牌卡', async ({page}) => {
  const {calls} = await start(page); await ready(page);
  const removed=page.locator('a.card[href="north12b-gold-ops.html"]');
  await expect(removed).toHaveCount(0);
  await page.locator('#tool-search').fill('金牌');
  await expect(page.locator('a.card:visible')).toHaveCount(2);
  await expect(page.locator('#search-result')).toHaveText('找到 2 個工具');
  await expect(page.locator('[aria-label="同仁大廳"] a.card[href="gold-medal.html"]')).toBeVisible();
  await page.locator('#tool-search').fill('金牌查詢');
  await expect(page.locator('a.card:visible')).toHaveCount(1);
  await page.locator('#tool-search').fill('金牌資料維護');
  await expect(page.locator('a.card:visible')).toHaveCount(0);
  await expect(removed).toHaveCount(0);
  await page.locator('#tool-search').fill('');
  await expect(page.locator('a.card:visible')).toHaveCount(EXPECTED_HREFS.length);
  await expect(removed).toHaveCount(0);
  await expect(page.locator('#search-result')).toBeHidden();
  expect(calls).toEqual([]);
});

for (const viewport of [{width:1280,height:1300},{width:390,height:844},{width:320,height:800}]) {
  test(`${viewport.width}px 情報站在管理第二位，搜尋恢復與鍵盤導覽正常`, async ({page}) => {
    const {calls,errors}=await start(page,{viewport});await ready(page);
    const management=page.locator('.management-grid');
    const intel=management.locator('a.card[href="patrol.html"]');
    expect(await management.locator('a.card').evaluateAll(cards=>cards.map(card=>card.getAttribute('href')))).toEqual(['access-management.html','department-ops.html','patrol.html']);
    await expect(page.locator('a.card[href="patrol.html"]')).toHaveCount(1);
    const boxes=await management.locator('a.card').evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().toJSON()));
    if(viewport.width===1280) {expect(boxes[1].y).toBe(boxes[0].y);expect(boxes[1].x).toBeGreaterThan(boxes[0].x);}
    else expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
    await page.locator('#tool-search').fill('每日日誌');await expect(management).toBeHidden();
    await page.locator('#tool-search').fill('情報站');await expect(management).toBeVisible();await expect(intel).toBeVisible();
    await expect(page.locator('a.card:visible')).toHaveCount(1);
    await page.locator('#tool-search').fill('');await expect(page.locator('a.card:visible')).toHaveCount(EXPECTED_HREFS.length);
    await expect(page.locator('a.card[href="north12b-gold-ops.html"]')).toHaveCount(0);
    await noOverflow(page);
    await fs.mkdir(SCREENSHOTS,{recursive:true});await page.locator('#zone-supervisor').screenshot({path:path.join(SCREENSHOTS,`GOLD-ENTRY-${viewport.width}.png`)});
    await management.locator('a.card[href="department-ops.html"]').focus();await page.keyboard.press('Tab');await expect(intel).toBeFocused();
    await intel.press('Enter');await expect(page).toHaveURL(/patrol\.html$/);
    expect(calls.filter(call=>call.method==='POST')).toEqual([]);expect(errors).toEqual([]);
  });
}

for (const viewport of [{width:1280,height:1300},{width:390,height:844}]) {
  test(`${viewport.width}px APP 原班表與巡店入口仍連到情報站且保持未登入`, async ({page}) => {
    const {calls,errors}=await start(page,{viewport});await ready(page);
    const appUrl=new URL('app.html',PAGE_URL).href;
    await page.goto(appUrl);
    await page.locator('.bottom-nav [data-nav="schedule"]').click();
    await expect(page.locator('[data-view="schedule"]')).toBeVisible();
    const scheduleLink=page.getByRole('link',{name:'前往完整班表',exact:true});
    await expect(scheduleLink).toHaveAttribute('href','patrol.html');
    await scheduleLink.click();await expect(page).toHaveURL(/patrol\.html$/);
    await page.goto(appUrl);await page.locator('.bottom-nav [data-nav="patrol"]').click();
    await expect(page.locator('[data-view="patrol"]')).toBeVisible();
    const patrolLink=page.getByRole('link',{name:'完整巡店看板',exact:true});await expect(patrolLink).toHaveAttribute('href','patrol.html');
    await patrolLink.focus();await patrolLink.press('Enter');await expect(page).toHaveURL(/patrol\.html$/);
    await page.goto(appUrl);await page.locator('[data-profile-entry]').click();await expect(page.locator('#viewerState')).toHaveText('未登入');
    await expect(page.locator('#employeeId')).toHaveValue('');
    expect(calls.filter(call=>call.method==='POST')).toEqual([]);expect(errors).toEqual([]);
  });
}

for (const viewport of [{width:1280,height:1300},{width:390,height:844}]) {
  test(`${viewport.width}px 測試匯入入口移除且搜尋後不重現，正式查價與上傳保留`, async ({page}) => {
    const {calls,errors} = await start(page,{viewport}); await ready(page);
    const lab = page.locator('a[href="tradein-import-lab.html"]');
    const lookup = page.locator('a.card[href="threec-query.html"]');
    const upload = page.locator(`a.card[href="${UPLOAD_URL}"]`);
    const area = page.locator('a.card[href="tradein-progress.html"]');
    await expect(lab).toHaveCount(0);
    for (const query of ['匯入測試區','3C','舊換新','']) {
      await page.locator('#tool-search').fill(query);
      await expect(lab).toHaveCount(0);
      if (query !== '匯入測試區') {
        await expect(query==='舊換新'?area:lookup).toBeVisible();
        await expect(upload).toBeVisible();
      }
    }
    await expect(page.locator('a.card:visible')).toHaveCount(EXPECTED_HREFS.length);
    await expect(lookup.locator('h3')).toHaveText('手機專案價查詢');
    await expect(upload.locator('h3')).toHaveText('資料快速上傳');
    await noOverflow(page);
    expect(calls).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('同仁與督導導覽為同頁錨點並更新目前分區', async ({page}) => {
  const {calls} = await start(page,{reducedMotion:'reduce'}); await ready(page);
  await page.locator('.section-nav a[href="#zone-supervisor"]').click();
  await expect(page).toHaveURL(/home\.html#zone-supervisor$/);
  await expect(page.locator('.section-nav a[href="#zone-supervisor"]')).toHaveAttribute('aria-current','location');
  await page.locator('.section-nav a[href="#zone-staff"]').click();
  await expect(page).toHaveURL(/home\.html#zone-staff$/);
  await expect(page.locator('.section-nav a[href="#zone-staff"]')).toHaveAttribute('aria-current','location');
  expect(calls).toEqual([]);
});

test('提醒每 5 秒輪播，鍵盤前後切換與暫停可用', async ({page}) => {
  await start(page); await ready(page);
  // Keep pointer input out of exact fake-clock boundaries. Pointer pause/resume
  // and hover behavior have independent browser-event coverage below.
  await expect(page.locator('#reminder-count')).toHaveText('1 / 4');
  await page.clock.runFor(4999);
  await expect(page.locator('#reminder-count')).toHaveText('1 / 4');
  await page.clock.runFor(1);
  await expect(page.locator('#reminder-count')).toHaveText('2 / 4');
  await expect(page.locator('#reminder-display')).toHaveAttribute('aria-live','off');
  await page.locator('#reminder-next').press('Enter');
  await expect(page.locator('#reminder-count')).toHaveText('3 / 4');
  await expect(page.locator('#reminder-display')).toHaveAttribute('aria-live','polite');
  await page.locator('#reminder-prev').press('Enter');
  await expect(page.locator('#reminder-count')).toHaveText('2 / 4');
  await page.locator('#reminder-pause').press('Enter');
  await expect(page.locator('#reminder-pause')).toHaveAttribute('aria-pressed','true');
  await page.locator('#tool-search').focus();
  await expect(page.locator('#tool-search')).toBeFocused();
  await page.clock.runFor(15000);
  await expect(page.locator('#reminder-count')).toHaveText('2 / 4');
  await page.locator('#reminder-pause').press('Enter');
  await expect(page.locator('#reminder-pause')).toHaveAttribute('aria-pressed','false');
  await page.locator('#tool-search').focus();
  await expect(page.locator('#tool-search')).toBeFocused();
  await page.clock.runFor(4999);
  await expect(page.locator('#reminder-count')).toHaveText('2 / 4');
  await page.clock.runFor(1);
  await expect(page.locator('#reminder-count')).toHaveText('3 / 4');
});

test('滑鼠點擊可暫停及恢復輪播，運行時鐘下會繼續切換', async ({page}) => {
  await start(page); await ready(page);
  await page.locator('#reminder-pause').click();
  await expect(page.locator('#reminder-pause')).toHaveAttribute('aria-pressed','true');
  await page.locator('#tool-search').focus();
  await expect(page.locator('#tool-search')).toBeFocused();
  await page.mouse.move(0,0);
  await page.clock.resume();
  await expect(page.locator('#reminder-count')).toHaveText('1 / 4');
  await page.locator('#reminder-pause').click();
  await expect(page.locator('#reminder-pause')).toHaveAttribute('aria-pressed','false');
  await page.locator('#tool-search').focus();
  await expect(page.locator('#tool-search')).toBeFocused();
  await page.mouse.move(0,0);
  await expect(page.locator('#reminder-count')).toHaveText('2 / 4', {timeout:7000});
});

test('提醒滑鼠停留與鍵盤焦點期間不會自動切換', async ({page}) => {
  await start(page); await ready(page);
  await page.locator('.reminder').hover(); await page.clock.runFor(10000);
  await expect(page.locator('#reminder-count')).toHaveText('1 / 4');
  await page.mouse.move(0,0); await page.locator('#reminder-next').focus(); await page.clock.runFor(10000);
  await expect(page.locator('#reminder-count')).toHaveText('1 / 4');
  await page.locator('#tool-search').focus();
  await expect(page.locator('#tool-search')).toBeFocused();
  await expect.poll(() => page.locator('.reminder').evaluate(banner => banner.matches(':hover'))).toBe(false);
  await page.clock.runFor(4999);
  await expect(page.locator('#reminder-count')).toHaveText('1 / 4');
  await page.clock.runFor(1);
  await expect(page.locator('#reminder-count')).toHaveText('2 / 4');
});

test('減少動態效果預設暫停，但仍可手動切換', async ({page}) => {
  await start(page,{reducedMotion:'reduce'}); await ready(page);
  await expect(page.locator('#reminder-pause')).toHaveAttribute('aria-pressed','true');
  await page.clock.runFor(15000); await expect(page.locator('#reminder-count')).toHaveText('1 / 4');
  await next(page); await expect(page.locator('#reminder-count')).toHaveText('2 / 4');
});

for (const [label, keys] of [['沒有憑證',{}],['只有員編',{employeeId:KEYS.employeeId}],['只有裝置',{deviceId:KEYS.deviceId}]]) {
  test(`${label}完全不請求私有端點`, async ({page}) => {
    const {calls} = await start(page,{keys}); await ready(page);
    await page.clock.runFor(60000); await ready(page);
    expect(calls).toEqual([]);
    const slides = await readSlides(page);
    expect(slides.every(slide => slide.status === 'locked')).toBe(true);
    expect(slides.every(slide => !/通化|0\/2|已確認 \d 店/.test(slide.text))).toBe(true);
  });
}

test('private_access 拒絕後不發出 read', async ({page}) => {
  const {calls} = await start(page,{keys:{employeeId:KEYS.employeeId,deviceId:KEYS.deviceId},reply:() => ({status:'error',message:'此員編尚未核准此裝置'})});
  await ready(page);
  expect(calls.map(call => call.payload.action)).toEqual(['private_access']);
  await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','locked');
  await expect(page.locator('#reminder-text')).toContainText('員編或裝置驗證未通過');
});

test('督導驗證回傳不同 token 時不讀 ptdashboard、不保存新 token', async ({page}) => {
  const {calls} = await start(page,{keys:{token:KEYS.token},reply:() => ({status:'ok',token:'DIFFERENT_SYNTHETIC_SESSION'})});
  await ready(page);
  expect(calls.map(call => call.payload.action)).toEqual(['ptauth']);
  expect(await page.evaluate(key => sessionStorage.getItem(key),SESSION_KEY)).toBe(KEYS.token);
  await next(page); await next(page);
  await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','pending');
});

test('成功 mock 資料僅在兩道驗證後讀取，分別顯示零業績、巡店次數及雙月大盤', async ({page}) => {
  const {calls,errors} = await start(page,{keys:KEYS}); await ready(page);
  const actions = calls.map(call => call.payload.action);
  expect(calls.every(call => call.method === 'POST')).toBe(true);
  expect(calls.every(call => call.url === (['ptauth','ptdashboard'].includes(call.payload.action) ? PATROL_API : DAILY_API))).toBe(true);
  expect(actions.indexOf('read')).toBeGreaterThan(actions.indexOf('private_access'));
  expect(actions.indexOf('ptdashboard')).toBeGreaterThan(actions.indexOf('ptauth'));
  expect(calls.find(call => call.payload.action === 'read').payload).toEqual({action:'read',date:'2026-09-29',seg:21,employeeId:KEYS.employeeId,deviceId:KEYS.deviceId});
  expect(calls.find(call => call.payload.action === 'ptdashboard').payload).toEqual({action:'ptdashboard',token:KEYS.token,month:'2026-09'});
  const slides = await readSlides(page);
  expect(slides.map(slide => slide.status)).toEqual(['warning','warning','warning','warning']);
  expect(slides[0].text).toBe('已確認 1 店：通化');
  expect(slides[1].text).toBe('已確認 1 店：酒泉');
  expect(slides[2].text).toBe('通化 0/2、酒泉 1/2');
  expect(slides[3].text).toBe('通化');
  expect(slides[3].period).toContain('9–10月（每兩月一次）');
  expect(errors).toEqual([]);
});

for (const scenario of ['malformed','empty','stale']) {
  test(`${scenario} 回應保持待更新，不把未知值當零`, async ({page}) => {
    const reply = payload => {
      if (['private_access','ptauth'].includes(payload.action)) return successful(payload);
      if (scenario === 'malformed') return '{invalid json';
      if (scenario === 'empty') return {status:'ok'};
      const fixture = successful(payload);
      if (payload.action === 'read') fixture.summary.date = '2026-09-28';
      else fixture.generatedAt = '2026-09-29T07:00:00Z';
      return fixture;
    };
    await start(page,{keys:KEYS,reply}); await ready(page);
    const slides = await readSlides(page);
    expect(slides).toHaveLength(4);
    expect(slides.every(slide => slide.status === 'pending')).toBe(true);
    expect(slides.every(slide => !/已確認 \d 店|0\/2|九店.*完成/.test(slide.text))).toBe(true);
  });
}

test('部分缺值與未回報另列待更新，只有明確數字零列入提醒', async ({page}) => {
  const sales = salesFixture();
  sales.summary.stores[0].reported = false;
  sales.summary.completedStores = 8; sales.summary.missingStores = ['通化'];
  delete sales.summary.stores[1].metrics['好速'];
  sales.summary.stores[2].metrics.A999.value = 0;
  await start(page,{keys:KEYS,reply:payload => payload.action === 'read' ? sales : successful(payload)}); await ready(page);
  const slides = await readSlides(page);
  expect(slides).toHaveLength(5);
  expect(slides[0].text).toBe('已確認 1 店：台北三創');
  expect(slides[1].status).toBe('pending');
  expect(slides[2].text).toContain('未回報：通化');
  expect(slides[2].text).toContain('欄位待補：酒泉');
  expect(slides[2].text).toContain('不計為零業績');
});

test('等待驗證時顯示讀取中；網路錯誤後待更新且不讀資料', async ({page}) => {
  const gate = deferred();
  const {calls} = await start(page,{keys:{employeeId:KEYS.employeeId,deviceId:KEYS.deviceId},reply:() => gate.promise});
  await expect.poll(() => calls.length).toBe(1);
  await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','loading');
  await expect(page.locator('#reminder-refresh')).toBeDisabled();
  gate.resolve('NETWORK_ERROR'); await ready(page);
  expect(calls.map(call => call.payload.action)).toEqual(['private_access']);
  await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','pending');
});

test('憑證改變時立即清除已顯示資料，不留下舊門市內容', async ({page}) => {
  const {calls} = await start(page,{keys:KEYS}); await ready(page);
  await expect(page.locator('#reminder-text')).toHaveText('已確認 1 店：通化');
  const before = calls.length;
  await changeKeys(page,{}); await ready(page);
  expect(calls.length).toBe(before);
  expect((await readSlides(page)).every(slide => slide.status === 'locked' && !/通化|酒泉|0\/2/.test(slide.text))).toBe(true);
});

test('驗證期間更換憑證，舊驗證結果不得觸發 read', async ({page}) => {
  const gate = deferred();
  const {calls} = await start(page,{keys:{employeeId:KEYS.employeeId,deviceId:KEYS.deviceId},reply:() => gate.promise});
  await expect.poll(() => calls.length).toBe(1);
  await changeKeys(page,{}); await ready(page);
  gate.resolve({status:'ok'});
  await page.clock.runFor(1000);
  expect(calls.map(call => call.payload.action)).toEqual(['private_access']);
  await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','locked');
});

test('舊帳號的延遲 read 不會覆蓋新帳號結果', async ({page}) => {
  const gate = deferred();
  const reply = payload => {
    if (payload.action === 'read' && payload.employeeId === KEYS.employeeId) return gate.promise;
    if (payload.action === 'read') {
      const fresh = salesFixture(); fresh.summary.stores[0].metrics.A999.value = 1; fresh.summary.stores[2].metrics.A999.value = 0; return fresh;
    }
    return successful(payload);
  };
  const {calls} = await start(page,{keys:{employeeId:KEYS.employeeId,deviceId:KEYS.deviceId},reply});
  await expect.poll(() => calls.filter(call => call.payload.action === 'read').length).toBe(1);
  await changeKeys(page,{employeeId:'SYNTHETIC_NEW_EMPLOYEE',deviceId:'SYNTHETIC_NEW_DEVICE'}); await ready(page);
  await expect(page.locator('#reminder-text')).toHaveText('已確認 1 店：台北三創');
  gate.resolve(salesFixture()); await page.clock.runFor(1000);
  await expect(page.locator('#reminder-text')).toHaveText('已確認 1 店：台北三創');
  expect(calls.filter(call => call.payload.action === 'private_access')).toHaveLength(2);
});

test('每分鐘重新驗證，等待新資料時清除上一輪數值', async ({page}) => {
  const gate = deferred(); let authCount = 0;
  const {calls} = await start(page,{keys:{employeeId:KEYS.employeeId,deviceId:KEYS.deviceId},reply:payload => {
    if (payload.action === 'private_access' && ++authCount > 1) return gate.promise;
    return successful(payload);
  }}); await ready(page);
  await page.clock.runFor(60000);
  await expect.poll(() => calls.filter(call => call.payload.action === 'private_access').length).toBe(2);
  const slides = await readSlides(page);
  expect(slides.filter(slide => slide.title.includes('昨日')).every(slide => slide.status === 'loading' && !slide.text.includes('通化'))).toBe(true);
  gate.resolve({status:'error'}); await ready(page);
});

test('隱藏頁面會清除資料，返回時才重新驗證', async ({page}) => {
  const {calls} = await start(page,{keys:KEYS}); await ready(page);
  const before = calls.length;
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,get:() => true}); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#reminder-text')).not.toContainText('通化');
  await page.clock.runFor(60000); expect(calls.length).toBe(before);
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,get:() => false}); document.dispatchEvent(new Event('visibilitychange')); });
  await ready(page);
  await expect(page.locator('#reminder-text')).toHaveText('已確認 1 店：通化');
  expect(calls.length).toBe(before + 4);
});

for (const [label,authFields] of [['missing',{}],['expired',{expiresAt:Math.floor(Date.parse(NOW) / 1000) - 1}]]) {
  test(`督導 ${label} 效期不得讀 ptdashboard`, async ({page}) => {
    const {calls} = await start(page,{keys:{token:KEYS.token},reply:payload => ({status:'ok',token:payload.token,...authFields})});
    await ready(page);
    expect(calls.map(call => call.payload.action)).toEqual(['ptauth']);
    await next(page); await next(page);
    await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','pending');
  });
}

test('督導 session 到期前清除已顯示巡店資料', async ({page}) => {
  const {calls} = await start(page,{keys:{token:KEYS.token},reply:payload => payload.action === 'ptauth'
    ? {status:'ok',token:payload.token,expiresIn:1} : successful(payload)});
  await ready(page); await next(page); await next(page);
  await expect(page.locator('#reminder-text')).toBeVisible();
  await expect(page.locator('#reminder-text')).toHaveText('通化 0/2、酒泉 1/2');
  await page.clock.runFor(751);
  await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','locked');
  await expect(page.locator('#reminder-text')).toContainText('督導連線已到期');
  expect(calls.map(call => call.payload.action)).toEqual(['ptauth','ptdashboard']);
});

test('督導 session 到期後的延遲回應不會重新顯示資料', async ({page}) => {
  const gate = deferred();
  const {calls} = await start(page,{keys:{token:KEYS.token},reply:payload => payload.action === 'ptauth'
    ? {status:'ok',token:payload.token,expiresIn:1} : gate.promise});
  await expect.poll(() => calls.length).toBe(2);
  await page.clock.runFor(751);
  gate.resolve(patrolFixture()); await ready(page);
  await next(page); await next(page);
  await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','locked');
  await expect(page.locator('#reminder-text')).not.toContainText('通化');
});

test('更換督導 token 後，舊 ptauth 不得觸發資料讀取', async ({page}) => {
  const gate = deferred();
  const {calls} = await start(page,{keys:{token:KEYS.token},reply:() => gate.promise});
  await expect.poll(() => calls.length).toBe(1);
  await changeKeys(page,{}); await ready(page);
  gate.resolve({status:'ok',token:KEYS.token,expiresIn:1800}); await page.clock.runFor(1000);
  expect(calls.map(call => call.payload.action)).toEqual(['ptauth']);
  expect((await readSlides(page)).every(slide => slide.status === 'locked')).toBe(true);
});

test('台北午夜即時重驗並改讀新昨天，不顯示前一天的結果', async ({page}) => {
  const gate = deferred(); let readCount = 0;
  const {calls} = await start(page,{keys:{employeeId:KEYS.employeeId,deviceId:KEYS.deviceId},now:'2026-09-30T15:59:59.000Z',
    reply:payload => payload.action === 'read' && ++readCount > 1 ? gate.promise : successful(payload)});
  await ready(page); await expect(page.locator('#reminder-text')).toHaveText('已確認 1 店：通化');
  await page.clock.runFor(1000);
  await expect.poll(() => calls.filter(call => call.payload.action === 'read').length).toBe(2);
  expect(calls.filter(call => call.payload.action === 'read').map(call => call.payload.date)).toEqual(['2026-09-29','2026-09-30']);
  await expect(page.locator('#today')).toContainText('2026年10月1日');
  await expect(page.locator('#reminder-text')).not.toContainText('通化');
  await expect(page.locator('#reminder-period')).toHaveText('2026-09-30 21:00');
  gate.resolve(salesFixture()); await ready(page);
  await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','pending');
  await expect(page.locator('#reminder-text')).not.toContainText('通化');
});

test('Chromium 截圖：未登入桌面、手機、寬螢幕及明確標示的合成資料', async ({page},testInfo) => {
  await fs.mkdir(SCREENSHOTS,{recursive:true});
  await start(page,{reducedMotion:'reduce'}); await ready(page);
  for (const viewport of [{width:1280,height:1300,name:'desktop-1280-unauthenticated'},{width:390,height:844,name:'mobile-390-unauthenticated'},{width:1920,height:1300,name:'wide-1920-unauthenticated'}]) {
    await page.setViewportSize(viewport); await noOverflow(page);
    const screenshotPath = path.join(SCREENSHOTS,`${viewport.name}.png`);
    await page.screenshot({path:screenshotPath,fullPage:true});
    await testInfo.attach(viewport.name,{path:screenshotPath,contentType:'image/png'});
  }
  await changeKeys(page,KEYS); await ready(page);
  await page.setViewportSize({width:1280,height:1300});
  await expect(page.locator('#reminder-text')).toContainText('已確認 1 店：通化');
  for (const [name,slide] of [['desktop-1280-SYNTHETIC-sales',0],['desktop-1280-SYNTHETIC-patrol',2]]) {
    if (slide) { await next(page); await next(page); }
    const screenshotPath = path.join(SCREENSHOTS,`${name}.png`);
    await page.screenshot({path:screenshotPath,fullPage:true});
    await testInfo.attach(name,{path:screenshotPath,contentType:'image/png'});
  }
  await fs.writeFile(path.join(SCREENSHOTS,'README.txt'), 'Actual Chromium renders from tests/home.spec.js. All external network is intercepted. Unauthenticated screenshots contain no private data. SYNTHETIC screenshots use generated test fixtures and non-working credentials; their store metrics are not real or verified production results. Fixed browser date: '+NOW+'\n');
});
