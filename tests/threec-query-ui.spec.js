'use strict';

const { test, expect } = require('@playwright/test');
const path = require('node:path');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../threec-query.html');
const DEVICE_KEY = 'north12b_private_dashboard_device_id';
const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';

function response(kind) {
  if (kind === 'shopping') return { status:'ok', snapshot:{ kind, source_version_date:'2026-10-01', snapshot_hash:'shopping-snapshot-v1', source_file_sha256:'a'.repeat(64), published_at:'2026-10-01T09:00:00+08:00', rows:[
    { source_sheet:'iPhone', source_row_number:2, brand:'Apple', model:'iPhone 16 256GB 黑色', colorless_model:'iPhone 16 256GB', code:'A16', retail_price:'29,900', project_prices:{'999型專案價':'0','合約24期':'1,299','合約36期':''} },
  ] }, changeSet:{kind:'shopping',counts:{added:1,changed:1,unchanged:1,removed:0},addedCount:1,changedCount:1,unchangedCount:1,removedCount:0,changeCount:2,offset:0,limit:100,hasMore:false,changes:[
    {status:'changed',model:'iPhone 16 256GB',modelCapacity:'iPhone 16 256GB',condition:'合約24期',plan:'合約24期',before:{kind:'number',value:1299,display:'1,299 元'},after:{kind:'zero',value:'0',display:'0 元'}},
    {status:'added',model:'iPhone 16 256GB',modelCapacity:'iPhone 16 256GB',condition:'999型專案價',plan:'999型專案價',before:null,after:{kind:'number',value:999,display:'999 元'}}
  ]}, registry:{ kinds:{ shopping:{ active:{ source_version_date:'2026-10-01', row_count:1 } } } } };
  return { status:'ok', snapshot:{ kind, source_version_date:'2026-10-01', snapshot_hash:'tradein-snapshot-v1', source_file_sha256:'b'.repeat(64), published_at:'2026-10-01T09:00:00+08:00', rows:[
    { source_sheet:'回收價', brand:'Samsung', model:'Galaxy S25 512GB', colorless_model:'Galaxy S25 512GB', quotes:{'點子行動':{S:'18,000',A:0,B:'',C:'500'},'FutureDial（FDI）':{S:'17,500',A:'12,000',B:'8,000',C:null}} },
  ] }, changeSet:{kind:'tradein',counts:{added:0,changed:1,unchanged:7,removed:0},addedCount:0,changedCount:1,unchangedCount:7,removedCount:0,changeCount:1,offset:0,limit:100,hasMore:false,changes:[
    {status:'changed',model:'Galaxy S25 512GB',modelCapacity:'Galaxy S25 512GB',condition:'tradein_quote',provider:'FutureDial（FDI）',grade:'A',before:{kind:'missing',value:null,display:'無報價（缺價）'},after:{kind:'number',value:12000,display:'12,000 元'}}
  ]}, registry:{ kinds:{ tradein:{ active:{ source_version_date:'2026-10-01', row_count:1 } } } } };
}

async function intercept(page, { fail = false, missing = '' } = {}) {
  const calls = [];
  await page.route('**/exec', async route => {
    let payload = {};
    try { payload = route.request().postDataJSON(); } catch {}
    calls.push(payload);
    if (fail) return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ status:'error', message:'此員編尚未核准此裝置' }) });
    if (missing === payload.kind) return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ status:'ok', snapshot:null, registry:{} }) });
    if (payload.action === 'threec_changes_read') {
      const full = response(payload.kind).changeSet;
      const search = String(payload.search || '').toLocaleLowerCase();
      const matching = search ? full.changes.filter(change => JSON.stringify(change).toLocaleLowerCase().includes(search)) : full.changes;
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ status:'ok', snapshotHash:response(payload.kind).snapshot.snapshot_hash, changeSet:{ ...full, offset:Number(payload.offset||0), limit:Number(payload.limit||1000), changeCount:matching.length, totalChangeCount:full.changeCount, changes:Number(payload.offset||0) === 0 ? matching : [], hasMore:false } }) });
    }
    return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(response(payload.kind)) });
  });
  return calls;
}

async function seed(page, remember = true) {
  await page.addInitScript(({ DEVICE_KEY, EMPLOYEE_KEY, remember }) => {
    localStorage.setItem(DEVICE_KEY, 'approved-device-test');
    if (remember) localStorage.setItem(EMPLOYEE_KEY, 'EMPTEST');
  }, { DEVICE_KEY, EMPLOYEE_KEY, remember });
}

test('登入後查到兩類正式資料，顯示版本且兩家回收商分開', async ({ page }) => {
  const calls = await intercept(page);
  await seed(page, false);
  await page.goto(PAGE_URL);
  await page.locator('#employeeId').fill('EMPTEST');
  await page.locator('#loginBtn').click();
  await expect(page.locator('#queryCard')).toBeVisible();
  await expect(page.locator('#shoppingResults')).toContainText('iPhone 16 256GB 黑色');
  await expect(page.locator('#shoppingResults')).toContainText('0 元');
  await expect(page.locator('#shoppingResults')).toContainText('無報價（缺價）');
  await page.locator('#tradeinTab').click();
  await expect(page.locator('#tradeinResults')).toContainText('點子行動（獨立報價）');
  await expect(page.locator('#tradeinResults')).toContainText('FutureDial（FDI）（獨立報價）');
  expect(calls.map(call => call.action)).toEqual(['threec_snapshot_read','threec_snapshot_read']);
  expect(calls.every(call => call.employeeId === 'EMPTEST' && call.deviceId === 'approved-device-test')).toBe(true);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
});

test('正式異動顯示報價條件 counts、完整資費與回收商等級，搜尋後可載入完整清單', async ({ page }) => {
  const calls = await intercept(page);
  await seed(page, false);
  await page.goto(PAGE_URL);
  await page.locator('#employeeId').fill('EMPTEST');
  await page.locator('#loginBtn').click();
  await expect(page.locator('#changeCard')).toContainText('調價（筆報價條件）');
  await expect(page.locator('#changeCard')).toContainText('合約24期');
  await expect(page.locator('#changeCard')).toContainText('1,299 元');
  await page.locator('#tradeinTab').click();
  await expect(page.locator('#changeCard')).toContainText('FutureDial（FDI）');
  await expect(page.locator('#changeCard')).toContainText('A');
  await page.locator('#changeSearch').fill('FutureDial');
  await expect.poll(() => calls.filter(call => call.action === 'threec_changes_read').length).toBeGreaterThan(0);
  expect(calls.filter(call => call.action === 'threec_changes_read').some(call => call.search === 'FutureDial')).toBe(true);
  await expect(page.locator('#changeResults')).toContainText('FutureDial（FDI）');
  await page.locator('#logoutBtn').click();
  await expect(page.locator('#changeResults')).toContainText('尚無異動記錄');
});

test('記住員編後重新開啟會重新讀取，不把價格寫入 localStorage', async ({ page }) => {
  const calls = await intercept(page);
  await seed(page, true);
  await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  expect(calls).toHaveLength(2);
  const stored = await page.evaluate(({ EMPLOYEE_KEY }) => ({ employee:localStorage.getItem(EMPLOYEE_KEY), keys:Object.keys(localStorage) }), { EMPLOYEE_KEY });
  expect(stored.employee).toBe('EMPTEST');
  expect(stored.keys.some(key => /price|snapshot|threec/i.test(key))).toBe(false);
  await page.reload();
  await expect(page.locator('#queryCard')).toBeVisible();
  expect(calls).toHaveLength(4);
});

test('授權失敗時清除正式結果並不接受管理者密碼欄位', async ({ page }) => {
  await intercept(page, { fail:true });
  await seed(page, false);
  await page.goto(PAGE_URL);
  await page.locator('#employeeId').fill('EMPTEST');
  await page.locator('#loginBtn').click();
  await expect(page.locator('#queryCard')).toBeHidden();
  await expect(page.locator('#authStatus')).toContainText('正式資料已清除');
  await expect(page.locator('#adminSecret')).toHaveCount(0);
});

test('單一類別尚未發布時保留另一類查詢，並明確標示未發布', async ({ page }) => {
  await intercept(page, { missing:'shopping' });
  await seed(page, false);
  await page.goto(PAGE_URL);
  await page.locator('#employeeId').fill('EMPTEST');
  await page.locator('#loginBtn').click();
  await expect(page.locator('#queryCard')).toBeVisible();
  await expect(page.locator('#authStatus')).toContainText('手機專案／3C 尚未發布正式資料');
  await expect(page.locator('#shoppingResults')).toContainText('尚未發布正式資料：手機專案／3C');
  await page.locator('#tradeinTab').click();
  await expect(page.locator('#tradeinResults')).toContainText('Galaxy S25 512GB');
});

test('登出會使尚未完成的讀取失效，不回寫已清除的價格', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const calls = [];
  await page.route('**/exec', async route => {
    let payload = {};
    try { payload = route.request().postDataJSON(); } catch {}
    calls.push(payload);
    await pending;
    return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(response(payload.kind)) });
  });
  await seed(page, false);
  await page.goto(PAGE_URL);
  await page.locator('#employeeId').fill('EMPTEST');
  await page.locator('#loginBtn').click();
  await expect.poll(() => calls.length).toBe(2);
  // The production page keeps the result card hidden until both reads finish;
  // expose the control here to exercise logout's generation invalidation while
  // those reads are still pending.
  await page.locator('#queryCard').evaluate(element => element.classList.remove('hidden'));
  await page.locator('#logoutBtn').click();
  release();
  await page.waitForTimeout(100);
  await expect(page.locator('#queryCard')).toBeHidden();
  await expect(page.locator('#shoppingResults')).toContainText('尚未讀取正式手機專案資料');
});

for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  test(`${viewport.width}px 查詢頁可操作且無頁面水平溢出`, async ({ page }) => {
    await intercept(page); await seed(page, true); await page.setViewportSize(viewport); await page.goto(PAGE_URL);
    await expect(page.locator('#queryCard')).toBeVisible();
    const width = await page.evaluate(() => ({ body:document.body.scrollWidth, html:document.documentElement.scrollWidth, inner:innerWidth }));
    expect(width.body).toBeLessThanOrEqual(width.inner); expect(width.html).toBeLessThanOrEqual(width.inner);
  });
}


test('登出後延遲的異動清單不能恢復資料或下載', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release=resolve; });
  let requests=0;
  await page.route('**/exec', async route => {
    const payload=route.request().postDataJSON();
    if(payload.action==='threec_changes_read') {
      requests++;
      await pending;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ok',changeSet:response(payload.kind).changeSet})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response(payload.kind))});
  });
  await seed(page,true);await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  const downloads=[];page.on('download',d=>downloads.push(d));
  await page.locator('#changeJsonBtn').click();
  await page.locator('#changeSearch').fill('合約');
  await expect.poll(()=>requests).toBe(2);
  await page.locator('#logoutBtn').click();release();
  await page.waitForTimeout(100);
  expect(downloads).toHaveLength(0);
  await expect(page.locator('#changeResults')).toContainText('尚無異動記錄');
});


test('GAS JSON序列化的 changePage 能顯示正式異動並跨頁', async ({ page }) => {
  await page.route('**/exec', async route => {
    const payload=route.request().postDataJSON();const body=response(payload.kind);
    const set=body.changeSet;set.changePage=set.changes;delete set.changes;
    set.hasMore=payload.action!=='threec_changes_read';
    if(payload.action==='threec_changes_read'){set.offset=100;set.changePage=[{...set.changePage[0],model:'NEXT PAGE MODEL',modelCapacity:'NEXT PAGE MODEL'}];}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload.action==='threec_changes_read'?{status:'ok',changeSet:set}:body)});
  });
  await seed(page,true);await page.goto(PAGE_URL);
  await expect(page.locator('#changeResults')).toContainText('合約24期');
  await expect(page.locator('#changeSummary')).toContainText('本頁顯示 2 筆');
  await page.locator('#changeNextBtn').click();
  await expect(page.locator('#changeResults')).toContainText('NEXT PAGE MODEL');
});
