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
  await page.route('**/exec*', async route => {
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

test('空白裝置開頁自動查到兩類正式資料，顯示版本且兩家回收商分開', async ({ page }) => {
  const calls = await intercept(page);
  await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  await expect(page.locator('#shoppingResults')).toContainText('iPhone 16 256GB 黑色');
  await expect(page.locator('#shoppingResults')).toContainText('0 元');
  await expect(page.locator('#shoppingResults')).toContainText('無報價（缺價）');
  await page.locator('#tradeinTab').click();
  await expect(page.locator('#tradeinResults')).toContainText('點子行動（獨立報價）');
  await expect(page.locator('#tradeinResults')).toContainText('FutureDial（FDI）（獨立報價）');
  expect(calls.map(call => call.action)).toEqual(['threec_snapshot_read','threec_snapshot_read']);
  expect(calls.every(call => !('employeeId' in call) && !('deviceId' in call))).toBe(true);
  await expect(page.locator('#employeeId')).toHaveCount(0);
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1280);
});

test('正式異動顯示報價條件 counts、完整資費與回收商等級，搜尋後可載入完整清單', async ({ page }) => {
  const calls = await intercept(page);
  await page.goto(PAGE_URL);
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
  await expect(page.locator('#logoutBtn')).toHaveCount(0);
});

test('重新開啟會重新讀取，不把價格或識別寫入 localStorage', async ({ page }) => {
  const calls = await intercept(page);
  await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  expect(calls).toHaveLength(2);
  const stored = await page.evaluate(({ EMPLOYEE_KEY }) => ({ employee:localStorage.getItem(EMPLOYEE_KEY), keys:Object.keys(localStorage) }), { EMPLOYEE_KEY });
  expect(stored.employee).toBeNull();
  expect(stored.keys.some(key => /price|snapshot|threec/i.test(key))).toBe(false);
  await page.reload();
  await expect(page.locator('#queryCard')).toBeVisible();
  expect(calls).toHaveLength(4);
});

test('讀取失敗時清除正式結果，提供重新整理且不接受管理者密碼欄位', async ({ page }) => {
  await intercept(page, { fail:true });
  await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  await expect(page.locator('#queryStatus')).toContainText('正式資料已清除');
  await expect(page.locator('#adminSecret')).toHaveCount(0);
});

test('單一類別尚未發布時保留另一類查詢，並明確標示未發布', async ({ page }) => {
  await intercept(page, { missing:'shopping' });
  await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  await expect(page.locator('#queryStatus')).toContainText('手機專案／3C 尚未發布正式資料');
  await expect(page.locator('#shoppingResults')).toContainText('尚未發布正式資料：手機專案／3C');
  await page.locator('#tradeinTab').click();
  await expect(page.locator('#tradeinResults')).toContainText('Galaxy S25 512GB');
});

test('離頁會使尚未完成的讀取失效，不回寫已清除的價格', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const calls = [];
  await page.route('**/exec*', async route => {
    let payload = {};
    try { payload = route.request().postDataJSON(); } catch {}
    calls.push(payload);
    await pending;
    return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(response(payload.kind)) });
  });
  await page.goto(PAGE_URL);
  await expect.poll(() => calls.length).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  release();
  await page.waitForTimeout(100);
  await expect(page.locator('#queryCard')).toBeVisible();
  await expect(page.locator('#shoppingResults')).toContainText('尚未讀取正式手機專案資料');
});

for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  test(`${viewport.width}px 查詢頁可操作且無頁面水平溢出`, async ({ page }) => {
    await intercept(page); await page.setViewportSize(viewport); await page.goto(PAGE_URL);
    await expect(page.locator('#queryCard')).toBeVisible();
    const width = await page.evaluate(() => ({ body:document.body.scrollWidth, html:document.documentElement.scrollWidth, inner:innerWidth }));
    expect(width.body).toBeLessThanOrEqual(width.inner); expect(width.html).toBeLessThanOrEqual(width.inner);
  });
}


test('離頁後延遲的異動清單不能恢復資料或下載', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release=resolve; });
  let requests=0;
  await page.route('**/exec*', async route => {
    const payload=route.request().postDataJSON();
    if(payload.action==='threec_changes_read') {
      requests++;
      await pending;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ok',changeSet:response(payload.kind).changeSet})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response(payload.kind))});
  });
  await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  const downloads=[];page.on('download',d=>downloads.push(d));
  await page.locator('#changeJsonBtn').click();
  await page.locator('#changeSearch').fill('合約');
  await expect.poll(()=>requests).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));release();
  await page.waitForTimeout(100);
  expect(downloads).toHaveLength(0);
  await expect(page.locator('#changeResults')).toContainText('尚無異動記錄');
});


test('GAS JSON序列化的 changePage 能顯示正式異動並跨頁', async ({ page }) => {
  await page.route('**/exec*', async route => {
    const payload=route.request().postDataJSON();const body=response(payload.kind);
    const set=body.changeSet;set.changePage=set.changes;delete set.changes;
    set.hasMore=payload.action!=='threec_changes_read';
    if(payload.action==='threec_changes_read'){set.offset=100;set.changePage=[{...set.changePage[0],model:'NEXT PAGE MODEL',modelCapacity:'NEXT PAGE MODEL'}];}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload.action==='threec_changes_read'?{status:'ok',changeSet:set}:body)});
  });
  await page.goto(PAGE_URL);
  await expect(page.locator('#changeResults')).toContainText('合約24期');
  await expect(page.locator('#changeSummary')).toContainText('本頁顯示 2 筆');
  await page.locator('#changeNextBtn').click();
  await expect(page.locator('#changeResults')).toContainText('NEXT PAGE MODEL');
});


test('切換分類清空搜尋後返回手機，會重新查詢全版清單', async ({ page }) => {
  const calls=await intercept(page);await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  await page.locator('#changeSearch').fill('合約24期');
  await expect.poll(()=>calls.filter(c=>c.action==='threec_changes_read'&&c.kind==='shopping').length).toBe(1);
  await page.locator('#tradeinTab').click();await page.locator('#changeSearch').fill('');
  await expect.poll(()=>calls.filter(c=>c.action==='threec_changes_read'&&c.kind==='tradein'&&c.search==='').length).toBe(1);
  await page.locator('#shoppingTab').click();
  await expect.poll(()=>calls.filter(c=>c.action==='threec_changes_read'&&c.kind==='shopping'&&c.search==='').length).toBe(1);
  await expect(page.locator('#changeSummary')).not.toContainText('正在搜尋');
});

test('首版完整異動匯出由已驗證正式快照生成，避免重複下載全價資料', async ({ page }) => {
  const Diff=require('../threec-price-diff-core.js'),fs=require('node:fs');let calls=0;
  await page.route('**/exec*',async route=>{
    const payload=route.request().postDataJSON(),body=response(payload.kind);
    body.changeSet=Diff.diffSnapshots(payload.kind,null,body.snapshot,{limit:1});
    if(payload.action==='threec_changes_read'){calls++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ok',changeSet:body.changeSet})});}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(PAGE_URL);await expect(page.locator('#queryCard')).toBeVisible();
  const pending=page.waitForEvent('download');await page.locator('#changeJsonBtn').click();
  const download=await pending;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  expect(exported.changes).toHaveLength(4);expect(exported.counts.added).toBe(4);expect(calls).toBe(1);
  expect(exported.changes.some(c=>c.after.kind==='zero')).toBe(true);
  expect(exported.changes.some(c=>c.after.kind==='missing')).toBe(true);
});

test('快速切換分類時，舊分類延遲請求不能作廢新分類清單', async ({ page }) => {
  let releaseShopping, releaseTradein;
  const shoppingPending=new Promise(resolve=>{releaseShopping=resolve;});
  const tradeinPending=new Promise(resolve=>{releaseTradein=resolve;});
  const calls=[];
  await page.route('**/exec*',async route=>{
    const payload=route.request().postDataJSON();
    if(payload.action==='threec_changes_read'){
      calls.push(payload);
      if(payload.kind==='shopping'&&payload.search==='')await shoppingPending;
      if(payload.kind==='tradein'&&payload.search==='')await tradeinPending;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ok',changeSet:response(payload.kind).changeSet})});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response(payload.kind))});
  });
  await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  await page.locator('#changeSearch').fill('合約24期');
  await expect.poll(()=>calls.filter(c=>c.kind==='shopping').length).toBe(1);
  await expect(page.locator('#changeSummary')).not.toContainText('正在搜尋');
  await page.locator('#tradeinTab').click();await page.locator('#changeSearch').fill('');
  await page.locator('#shoppingTab').click();
  await expect.poll(()=>calls.filter(c=>c.kind==='shopping'&&c.search==='').length).toBe(1);
  await expect.poll(()=>calls.filter(c=>c.kind==='tradein'&&c.search==='').length).toBe(1);
  releaseShopping();
  await expect(page.locator('#changeSummary')).not.toContainText('正在搜尋');
  await expect(page.locator('#changeCsvBtn')).toBeEnabled();
  releaseTradein();
  await expect(page.locator('#changeTitle')).toContainText('手機專案');
});

test('某一類 API 失敗不清除另一類已完成價格，並允許重整復原',async({page})=>{
 let fail=true;
 await page.route('**/exec*',route=>{const p=route.request().postDataJSON();return route.fulfill({contentType:'application/json',body:JSON.stringify(fail&&p.kind==='tradein'?{status:'error',message:'獨立測試失敗'}:response(p.kind))});});
 await page.goto(PAGE_URL);await expect(page.locator('#queryStatus')).toContainText('舊換新：獨立測試失敗');await expect(page.locator('#shoppingResults')).toContainText('iPhone');
 fail=false;await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');await page.locator('#tradeinTab').click();await expect(page.locator('#tradeinResults')).toContainText('Galaxy');
});
test('另一類慢讀取時手機先可查，不能等待兩類才渲染',async({page})=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 await page.route('**/exec*',async route=>{const p=route.request().postDataJSON();if(p.kind==='tradein')await pending;return route.fulfill({contentType:'application/json',body:JSON.stringify(response(p.kind))});});
 await page.goto(PAGE_URL);await expect(page.locator('#shoppingResults')).toContainText('iPhone');await expect(page.locator('#queryStatus')).toContainText('可先查詢');release();await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
});
test('Google JSON 轉址回 HTML 時，限定來源與 requestId 的既有 iframe 可讀回',async({page})=>{
 const requests=[];
 await page.route('**/exec*',async route=>{
  const url=new URL(route.request().url());
  if(!url.searchParams.has('transport'))return route.fulfill({contentType:'text/html',body:'<html>上傳頁非 JSON</html>'});
  const p=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));requests.push(p);
  const requestId=url.searchParams.get('requestId');
  await route.fulfill({contentType:'text/html',body:'<html>合成傳輸頁</html>'});
  await page.evaluate(({requestId,body})=>{
    const send=(origin,id,value)=>window.dispatchEvent(new MessageEvent('message',{origin,source:window,data:{type:'north12b-gas-response-v1',requestId:id,body:value}}));
    send('https://evil.example',requestId,{status:'ok',snapshot:null});
    send('https://script.googleusercontent.com','錯誤ID',{status:'ok',snapshot:null});
    send('https://script.googleusercontent.com',requestId,body);
  },{requestId,body:response(p.kind)});
 });
 await page.goto(PAGE_URL);await expect(page.locator('#shoppingResults')).toContainText('iPhone');await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
 expect(requests.map(p=>p.kind).sort()).toEqual(['shopping','tradein']);expect(requests.every(p=>p.action==='threec_snapshot_read'&&!p.employeeId&&!p.adminSecret)).toBe(true);await expect(page.locator('iframe')).toHaveCount(0);
});
for(const width of [1280,390,360])test(`${width}px 閱讀文字至少18px，價錢至少24px且不靠縮字塞欄`,async({page})=>{
 await intercept(page);await page.setViewportSize({width,height:844});await page.goto(PAGE_URL);await expect(page.locator('#shoppingResults')).toContainText('iPhone');
 await page.locator('#tableModeBtn').click();
 for(const selector of ['body','#shoppingBrand','#shoppingModel','.hint','.condition-detail','.comparison-table details','.spec-cell strong','.variant-label','.comparison-pagination button']){
 const fonts=await page.locator(selector).evaluateAll(els=>els.map(el=>parseFloat(getComputedStyle(el).fontSize)));expect(fonts.every(size=>size>=18)).toBe(true);
 }
 expect(await page.locator('.quote.price,.quote.zero').evaluateAll(els=>els.every(el=>parseFloat(getComputedStyle(el).fontSize)>=24))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const width of [1280,390])test(`三家公開報價與來源未分級 ${width}px，篩選和SABC不互相覆蓋`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/exec*',route=>{const p=route.request().postDataJSON();const r=response(p.kind);if(p.kind==='tradein'){r.snapshot.rows[0].quotes['愛鋒派']={S:null,A:'900',B:null,C:null,'未分級':0};}return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r)});});
 await page.goto(PAGE_URL);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');await page.locator('#tradeinTab').click();
 await expect(page.locator('#tradeinResults')).toContainText('愛鋒派（獨立報價）');await expect(page.locator('#tradeinResults')).toContainText('來源未分級');
 await page.locator('#tradeinProvider').selectOption('愛鋒派');await page.locator('#tradeinGrade').selectOption('未分級');const table=page.locator('#tradeinResults table');await expect(table).toHaveCount(1);await expect(table).toContainText('0 元');await expect(table).not.toContainText('900 元');await expect(table).not.toContainText('A 級');
 await page.locator('#tradeinGrade').selectOption('A');await expect(table).toContainText('900 元');await expect(table).not.toContainText('來源未分級');
 await page.locator('#tradeinProvider').selectOption('點子行動');await page.locator('#tradeinGrade').selectOption('未分級');await expect(page.locator('#tradeinResults')).toContainText('沒有符合搜尋條件');
});
