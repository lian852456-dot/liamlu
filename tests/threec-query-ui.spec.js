'use strict';

const { test, expect } = require('@playwright/test');
const path = require('node:path');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../threec-query.html');
const TRADEIN_URL = 'file://' + path.resolve(__dirname, '../tradein-query.html')+'?view=source';
const DEVICE_KEY = 'north12b_private_dashboard_device_id';
const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';

// Exercise actual downloads using the live page controls, then open exactly
// those downloaded bytes in a fresh browser that was offline before loading.
for(const kind of ['shopping','tradein'])for(const width of [390,1280])test(`${kind} ${width}px readonly HTML download preserves all prices offline`,async({page,browser},info)=>{
 const F=require('./threec-search-fixture.cjs'),fs=require('node:fs/promises');
 const source=kind==='shopping'?F.shopping():{status:'ok',snapshot:{kind:'tradein',source_version_date:'2026-11-01',snapshot_hash:'synthetic-readonly',rows:Array.from({length:45},(_,i)=>({brand:i%2?'Samsung':'SAMSUNG',model:'Galaxy QA '+i+' 256GB',source_sheet:'synthetic',quotes:{'點子行動':{A:i?1000+i:0,B:''},'FutureDial（FDI）':{S:1200+i,A:950+i},'愛鋒派':{'未分級':800+i}}}))},changesDeferred:true};
 source.token='NEVER_EXPORT_TOKEN';source.snapshot.rows[0].employeeId='NEVER_EXPORT_ID';
 await page.route('**/exec*',route=>{const p=publicPayload(route.request());return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(p.kind===kind?source:F[p.kind]())});});
 await page.setViewportSize({width,height:900});await page.goto(kind==='shopping'?PAGE_URL:'file://'+path.resolve(__dirname,'../tradein-query.html'));
 await expect(page.locator('#downloadQueryHtml')).toBeEnabled();
 // Deliberately narrow the online view; the export must still contain all rows.
 await page.locator(kind==='shopping'?'#shoppingSearch':'#tradeinSearch').fill(kind==='shopping'?'合成機 0':'Galaxy QA 0');
 const pending=page.waitForEvent('download');await page.locator('#downloadQueryHtml').click();const download=await pending,html=await fs.readFile(await download.path(),'utf8');await download.saveAs(info.outputPath(kind+'-readonly.html'));
 expect(download.suggestedFilename()).toMatch(/唯讀_2026-.*\.html$/);expect(html).toContain('north12-single-html/v1');expect(html).not.toContain('NEVER_EXPORT');expect(html).not.toContain('script.google.com');
 const context=await browser.newContext({offline:true,viewport:{width,height:900}}),offline=await context.newPage(),requests=[],errors=[];
 offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});offline.on('pageerror',e=>errors.push(e.message));await offline.setContent(html,{waitUntil:'load'});
 await expect(offline.locator('#queryStatus')).toContainText('唯讀快照');await expect(offline.locator('script[src],link[href],iframe,form,input[type=file]')).toHaveCount(0);
 const projected=await offline.evaluate(()=>window.ThreecReadonlyPayload.response.snapshot);
 expect(projected.rows.length).toBe(source.snapshot.rows.length);expect(projected.rows.map(r=>kind==='shopping'?r.project_prices:r.quotes)).toEqual(source.snapshot.rows.map(r=>kind==='shopping'?r.project_prices:r.quotes));
 if(kind==='shopping'){
  await expect(offline.locator('#shoppingResults')).toContainText('0 元');await offline.locator('#shoppingSearch').fill('合成機 42');await expect(offline.locator('#shoppingResults')).toContainText('42');await offline.locator('#shoppingSearch').fill('');await offline.locator('#enterpriseSegmentBtn').click();await expect(offline.locator('#shoppingResults')).toContainText('榮耀之星');await offline.locator('#consumerSegmentBtn').click();await offline.locator('#columnNext').click();await expect(offline.locator('#columnPage')).toContainText('2');
 }else{
  await expect(offline.locator('#tradeinResults')).toHaveClass(/official-workspace/);await expect(offline.locator('.official-price-table tbody tr')).toHaveCount(20);await offline.locator('[data-oq-grade="FutureDial（FDI）"]').selectOption('S');await expect(offline.locator('[data-oq-grade="點子行動"]')).toHaveValue('A');await offline.locator('[data-oq=next]').click();await offline.locator('[data-oq=next]').click();await expect(offline.locator('.official-price-table tbody tr')).toHaveCount(5);await offline.locator('[data-oq=detail]').click();await expect(offline.locator('[data-oq=dialog-body]')).toContainText('愛鋒派');await offline.locator('[data-oq=close]').click();
 }
 expect(await offline.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(requests).toEqual([]);expect(errors).toEqual([]);await offline.screenshot({path:info.outputPath('offline-'+width+'.png'),fullPage:false});await context.close();
});

test('readonly export clears on refresh and rejects a source changed during asset loading',async({page})=>{
 let failed=false,release;await page.route('**/exec*',route=>fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(failed?{status:'error',message:'合成讀取拒絕'}:response(publicPayload(route.request()).kind))}));
 await page.route('**/threec-readonly-assets.js*',async route=>{await new Promise(r=>{release=r;});await route.continue();});
 await page.goto(PAGE_URL);await expect(page.locator('#downloadQueryHtml')).toBeEnabled();let downloads=0;page.on('download',()=>downloads++);await page.locator('#downloadQueryHtml').click();await expect.poll(()=>typeof release).toBe('function');failed=true;await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('合成讀取拒絕');release();await expect(page.locator('#queryExportStatus')).toContainText('來源已切換');await expect(page.locator('#downloadQueryHtml')).toBeDisabled();expect(downloads).toBe(0);
});

test('local reference HTML download keeps pending zero, expiry and Mac parts offline',async({page,browser},info)=>{
 const fs=require('node:fs/promises'),R=require('./tradein-reference-full-fixture.cjs');await intercept(page);
 const payload={standard:{'機款主檔':[{'機款ID':'D1','系列':'合成新機','容量':'256G','品牌':'Test'}]},prices:{fields:['id','project','tariff','term','rent','price','retail'],dicts:[['D1'],['5G_XH(24)-新申裝/續約'],['999H'],[24],[999],[0],[29900]],rows:[[0,0,0,0,0,0,0]]},priceSource:{file:'synthetic.xls',date:'2026-11-02'},recycle:R.fixture()};
 await page.goto('file://'+path.resolve(__dirname,'../tradein-query.html'));await expect(page.locator('#downloadQueryHtml')).toBeEnabled();await page.locator('#quoteReference>summary').click();await page.locator('#quoteReference input').setInputFiles({name:'synthetic-reference.html',mimeType:'text/html',buffer:Buffer.from('<script type="application/json" id="DATA">'+JSON.stringify(payload)+'</script>')});await expect(page.locator('#quoteReference [role=status]')).toContainText('已載入');
 const pending=page.waitForEvent('download');await page.locator('#downloadQueryHtml').click();const download=await pending,html=await fs.readFile(await download.path(),'utf8');await download.saveAs(info.outputPath('reference-readonly.html'));
 const context=await browser.newContext({offline:true,viewport:{width:390,height:900}}),offline=await context.newPage(),errors=[],requests=[];offline.on('pageerror',e=>errors.push(e.message));offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await offline.setContent(html,{waitUntil:'load'});await expect(offline.locator('#tradeinReferencePanel')).toBeVisible();await expect(offline.locator('[data-tref=table]')).toContainText('待確認（來源為0）');await offline.locator('[data-tref=category]').selectOption('Mac');await expect(offline.locator('[data-tref=period]')).toContainText('2026-11-30');await offline.locator('[data-tref=detail]').click();await expect(offline.locator('[data-tref=dialog-body]')).toContainText('MAC-A');await expect(offline.locator('[data-tref=dialog-body]')).toContainText('合成A等條件');expect(errors).toEqual([]);expect(requests).toEqual([]);await offline.screenshot({path:info.outputPath('reference-offline.png')});await context.close();
});

function publicPayload(request){const text=request.postData()||'{}';try{return JSON.parse(text);}catch{return JSON.parse(new URLSearchParams(text).get('payload')||'{}');}}
function fulfillPublic(route,options){
 const url=new URL(route.request().url());
 if(url.searchParams.get('transport')!=='iframe'||options.contentType!=='application/json')return route.fulfill(options);
 const message=JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body:JSON.parse(options.body)}).replace(/</g,'\\u003c');
 return route.fulfill({...options,contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+message+',"*")</script>'});
}
async function openHistory(page){const details=page.locator('.query-history');if(await details.count()&&await details.getAttribute('open')===null)await details.locator(':scope > summary').click();}
async function openShoppingFilters(page){
 for(const selector of ['.query-extra-filters','.filter-details']){const details=page.locator(selector);if(await details.count()&&await details.getAttribute('open')===null)await details.locator(':scope > summary').click();}
}


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
    try { payload = publicPayload(route.request()); } catch {}
    calls.push(payload);
    if (fail) return fulfillPublic(route,{ status:200, contentType:'application/json', body:JSON.stringify({ status:'error', message:'此員編尚未核准此裝置' }) });
    if (missing === payload.kind) return fulfillPublic(route,{ status:200, contentType:'application/json', body:JSON.stringify({ status:'ok', snapshot:null, registry:{} }) });
    if (payload.action === 'threec_changes_read') {
      const full = response(payload.kind).changeSet;
      const search = String(payload.search || '').toLocaleLowerCase();
      const matching = search ? full.changes.filter(change => JSON.stringify(change).toLocaleLowerCase().includes(search)) : full.changes;
      return fulfillPublic(route,{ status:200, contentType:'application/json', body:JSON.stringify({ status:'ok', snapshotHash:response(payload.kind).snapshot.snapshot_hash, changeSet:{ ...full, offset:Number(payload.offset||0), limit:Number(payload.limit||1000), changeCount:matching.length, totalChangeCount:full.changeCount, changes:Number(payload.offset||0) === 0 ? matching : [], hasMore:false } }) });
    }
    return fulfillPublic(route,{ status:200, contentType:'application/json', body:JSON.stringify(response(payload.kind)) });
  });
  return calls;
}

test('空白裝置開頁自動查到兩類正式資料，顯示版本且兩家回收商分開', async ({ page }) => {
  const calls = await intercept(page);
  await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  await expect(page.locator('#shoppingResults')).toContainText('iPhone 16 256GB 黑色');
  await expect(page.locator('#shoppingResults')).toContainText('0 元');
  await expect(page.locator('#shoppingResults')).not.toContainText('無報價（缺價）');
  await page.goto(TRADEIN_URL);
  await expect(page.locator('#tradeinResults')).toContainText('點子行動（獨立報價）');
  await expect(page.locator('#tradeinResults')).toContainText('FutureDial（FDI）（獨立報價）');
  await expect(page.locator('#tradeinResults')).not.toContainText('無報價');
  await expect(page.locator('#tradeinResults table').nth(0).locator('thead tr').nth(1).locator('th')).toHaveText(['原始機型／容量','S 級','A 級','C 級']);
  await expect(page.locator('#tradeinResults')).toContainText('0 元');
  expect(calls.map(call => call.action)).toEqual(Array(4).fill('threec_snapshot_read'));
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
  await page.goto(TRADEIN_URL);
  await expect(page.locator('#changeCard')).toContainText('FutureDial（FDI）');
  await expect(page.locator('#changeCard')).toContainText('A');
  await openHistory(page);await page.locator('#changeSearch').fill('FutureDial');
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
  await expect(page.locator('#queryStatus')).toContainText('手機專案價查詢 尚未發布正式資料');
  await expect(page.locator('#shoppingResults')).toContainText('尚未發布正式資料：手機專案／3C');
  await page.goto(TRADEIN_URL);
  await expect(page.locator('#tradeinResults')).toContainText('Galaxy S25 512GB');
});

test('離頁會使尚未完成的讀取失效，不回寫已清除的價格', async ({ page }) => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const calls = [];
  await page.route('**/exec*', async route => {
    let payload = {};
    try { payload = publicPayload(route.request()); } catch {}
    calls.push(payload);
    await pending;
    return fulfillPublic(route,{ status:200, contentType:'application/json', body:JSON.stringify(response(payload.kind)) });
  });
  // The test intentionally holds an iframe request open. Waiting for load
  // races its submission; wait for the page DOM, then explicitly await calls.
  await page.goto(PAGE_URL, { waitUntil:'domcontentloaded' });
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
    const payload=publicPayload(route.request());
    if(payload.action==='threec_changes_read') {
      requests++;
      await pending;
      return fulfillPublic(route,{status:200,contentType:'application/json',body:JSON.stringify({status:'ok',changeSet:response(payload.kind).changeSet})});
    }
    return fulfillPublic(route,{status:200,contentType:'application/json',body:JSON.stringify(response(payload.kind))});
  });
  await page.goto(PAGE_URL);
  await expect(page.locator('#queryCard')).toBeVisible();
  const downloads=[];page.on('download',d=>downloads.push(d));
  await openHistory(page);await page.locator('#changeJsonBtn').click();
  await openHistory(page);await page.locator('#changeSearch').fill('合約');
  await expect.poll(()=>requests).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));release();
  await page.waitForTimeout(100);
  expect(downloads).toHaveLength(0);
  await expect(page.locator('#changeResults')).toContainText('尚無異動記錄');
});


test('GAS JSON序列化的 changePage 能顯示正式異動並跨頁', async ({ page }) => {
  await page.route('**/exec*', async route => {
    const payload=publicPayload(route.request());const body=response(payload.kind);
    const set=body.changeSet;set.changePage=set.changes;delete set.changes;
    set.hasMore=payload.action!=='threec_changes_read';
    if(payload.action==='threec_changes_read'){set.offset=100;set.changePage=[{...set.changePage[0],model:'NEXT PAGE MODEL',modelCapacity:'NEXT PAGE MODEL'}];}
    return fulfillPublic(route,{status:200,contentType:'application/json',body:JSON.stringify(payload.action==='threec_changes_read'?{status:'ok',changeSet:set}:body)});
  });
  await page.goto(PAGE_URL);
  await expect(page.locator('#changeResults')).toContainText('合約24期');
  await expect(page.locator('#changeSummary')).toContainText('本頁顯示 2 筆');
  await openHistory(page);await page.locator('#changeNextBtn').click();
  await expect(page.locator('#changeResults')).toContainText('NEXT PAGE MODEL');
});


test('搜尋後跨專區與返回手機會清空篩選並讀取 active', async ({page}) => {
  const calls=await intercept(page);await page.goto(PAGE_URL);
  await expect(page.locator('#changeResults')).toContainText('合約24期');
  await openHistory(page);await page.locator('#changeSearch').fill('合約24期');
  await expect.poll(()=>calls.filter(c=>c.action==='threec_changes_read'&&c.kind==='shopping').length).toBe(1);
  await page.goto(TRADEIN_URL);
  await expect(page.locator('#changeResults')).toContainText('FutureDial');
  await expect(page.locator('#changeSearch')).toHaveValue('');
  await page.goto(PAGE_URL);
  await expect(page.locator('#changeResults')).toContainText('999型專案價');
  await expect(page.locator('#changeSearch')).toHaveValue('');
  expect(calls.filter(c=>c.action==='threec_snapshot_read')).toHaveLength(6);
});

test('首版完整異動匯出由已驗證正式快照生成，避免重複下載全價資料', async ({ page }) => {
  const Diff=require('../threec-price-diff-core.js'),fs=require('node:fs');let calls=0;
  await page.route('**/exec*',async route=>{
    const payload=publicPayload(route.request()),body=response(payload.kind);
    body.changeSet=Diff.diffSnapshots(payload.kind,null,body.snapshot,{limit:1});
    if(payload.action==='threec_changes_read'){calls++;return fulfillPublic(route,{status:200,contentType:'application/json',body:JSON.stringify({status:'ok',changeSet:body.changeSet})});}
    return fulfillPublic(route,{status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(PAGE_URL);await expect(page.locator('#queryCard')).toBeVisible();
  await openHistory(page);const pending=page.waitForEvent('download');await page.locator('#changeJsonBtn').click();
  const download=await pending;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  expect(exported.changes).toHaveLength(4);expect(exported.counts.added).toBe(4);expect(calls).toBe(1);
  expect(exported.changes.some(c=>c.after.kind==='zero')).toBe(true);
  expect(exported.changes.some(c=>c.after.kind==='missing')).toBe(true);
});

test('跨專區離頁後，舊手機搜尋延遲回應不能覆蓋回收價與異動', async ({page}) => {
  let release;
  const pending=new Promise(resolve=>release=resolve);const calls=[];
  await page.route('**/exec*',async route=>{
    const payload=publicPayload(route.request());calls.push(payload);
    if(payload.action==='threec_changes_read'){
      await pending;
      return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify({status:'ok',changeSet:response('shopping').changeSet})});
    }
    return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(response(payload.kind))});
  });
  await page.goto(PAGE_URL);await expect(page.locator('#shoppingResults')).toContainText('iPhone');
  await openHistory(page);await page.locator('#changeSearch').fill('合約24期');
  await expect.poll(()=>calls.filter(c=>c.action==='threec_changes_read').length).toBe(1);
  await page.goto(TRADEIN_URL);await expect(page.locator('#tradeinResults')).toContainText('Galaxy');
  release();
  await expect(page.locator('#changeResults')).toContainText('FutureDial');
  await expect(page.locator('#changeResults')).not.toContainText('合約24期');
  await expect(page.locator('#shoppingPane')).toBeHidden();
});

test('某一類 API 失敗不清除另一類已完成價格，並允許重整復原',async({page})=>{
 let fail=true;
 await page.route('**/exec*',route=>{const p=publicPayload(route.request());return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(fail&&p.kind==='tradein'?{status:'error',message:'獨立測試失敗'}:response(p.kind))});});
 await page.goto(PAGE_URL);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');await expect(page.locator('#shoppingResults')).toContainText('iPhone');
 await page.goto(TRADEIN_URL);await expect(page.locator('#queryStatus')).toContainText('獨立測試失敗');
 fail=false;await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');await page.goto(TRADEIN_URL);await expect(page.locator('#tradeinResults')).toContainText('Galaxy');
});
test('另一類慢讀取時手機先可查，不能等待兩類才渲染',async({page})=>{
 let release;const pending=new Promise(resolve=>release=resolve);
 await page.route('**/exec*',async route=>{const p=publicPayload(route.request());if(p.kind==='tradein')await pending;return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(response(p.kind))});});
 await page.goto(PAGE_URL);await expect(page.locator('#shoppingResults')).toContainText('iPhone');await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');release();await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
});
test('Google JSON 轉址回 HTML 時，限定來源與 requestId 的既有 iframe 可讀回',async({page})=>{
 const requests=[];
 await page.route('**/exec*',async route=>{
  const url=new URL(route.request().url());
  if(!url.searchParams.has('transport'))return fulfillPublic(route,{contentType:'text/html',body:'<html>上傳頁非 JSON</html>'});
  const p=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));requests.push(p);
  const requestId=url.searchParams.get('requestId');
  await fulfillPublic(route,{contentType:'text/html',body:'<html>合成傳輸頁</html>'});
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
for(const width of [1280,390,360])test(`${width}px 緊湊機款字級與同列資費，價格保持醒目`,async({page})=>{
 await intercept(page);await page.setViewportSize({width,height:844});await page.goto(PAGE_URL);await expect(page.locator('#shoppingResults')).toContainText('iPhone');
 await page.locator('#tableModeBtn').click();
 const minima={'body':16,'#shoppingBrand':16,'#shoppingModel':16,'.hint':12,'.condition-detail':12,'.comparison-table details':11,'.spec-cell strong':width>=1280?14:13,'.variant-label':12,'.comparison-pagination button':12};
 for(const [selector,minimum] of Object.entries(minima)){
 const fonts=await page.locator(selector).evaluateAll(els=>els.map(el=>parseFloat(getComputedStyle(el).fontSize)));expect(fonts.every(size=>size>=minimum)).toBe(true);
 }
 expect(await page.locator('.quote.price,.quote.zero').evaluateAll((els,minimum)=>els.every(el=>parseFloat(getComputedStyle(el).fontSize)>=minimum),width>=1280?22:23)).toBe(true);
 expect(await page.locator('.tariff-contract').evaluateAll(els=>els.every(el=>getComputedStyle(el).whiteSpace==='nowrap'))).toBe(true);
 expect(await page.locator('.comparison-table summary').evaluateAll(els=>els.every(el=>getComputedStyle(el).whiteSpace==='nowrap'))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

for(const width of [1280,390])test(`三家公開報價與來源未分級 ${width}px，篩選和SABC不互相覆蓋`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.route('**/exec*',route=>{const p=publicPayload(route.request());const r=response(p.kind);if(p.kind==='tradein'){r.snapshot.rows[0].quotes['愛鋒派']={S:null,A:'900',B:null,C:null,'未分級':0};}return fulfillPublic(route,{status:200,contentType:'application/json',body:JSON.stringify(r)});});
 await page.goto(PAGE_URL);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');await page.goto(TRADEIN_URL);
 await expect(page.locator('#tradeinResults')).toContainText('愛鋒派（獨立報價）');await expect(page.locator('#tradeinResults')).toContainText('來源未分級');
 await page.locator('#tradeinProvider').selectOption('愛鋒派');await page.locator('#tradeinGrade').selectOption('未分級');const table=page.locator('#tradeinResults table');await expect(table).toHaveCount(1);await expect(table).toContainText('0 元');await expect(table).not.toContainText('900 元');await expect(table).not.toContainText('A 級');
 await page.locator('#tradeinGrade').selectOption('A');await expect(table).toContainText('900 元');await expect(table).not.toContainText('來源未分級');
 await page.locator('#tradeinProvider').selectOption('點子行動');await page.locator('#tradeinGrade').selectOption('未分級');await expect(page.locator('#tradeinResults')).toContainText('沒有符合搜尋條件');
});

for(const width of [1280,390,360])test(`企業專區 ${width}px 修復截圖情境：iPhone專用報價可讀，一般/空白企業欄分流`,async({page})=>{
 await page.route('**/*',async route=>{const req=route.request();if(req.url().includes('/macros/s/')){const payload=publicPayload(req);const data=response(payload.kind);if(payload.kind==='shopping')data.snapshot.rows=[
 {source_sheet:'一般',brand:'APPLE',model:'APPLE iPhone 17 Pro 256G(黑)(5G)',colorless_model:'APPLE iPhone 17 Pro 256G(5G)',code:'test-consumer',retail_price:39900,project_prices:{'5G_iPhone_XH(24)-續約／999H':1234}},
 {source_sheet:'企客員工眷',brand:'APPLE',model:'APPLE iPhone 17 Pro 256G(黑)(5G)',colorless_model:'APPLE iPhone 17 Pro 256G(5G)',code:'test-enterprise',retail_price:39900,project_prices:{'企客特殊專案(2)／(企客_5G)榮耀之星999H(24)':'','企客特殊專案(2)／(企客_5G)榮耀之星999H(24)_iPhone':2999,'企客特殊專案(2)／(企客_5G)榮耀之星999H(30)_iPhone':0,'企客特殊專案(2)／(企客_5G)榮耀之星999H(48)_iPhone':''}}
 ];return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(data)})}if(/^https?:/.test(req.url()))return route.abort();return route.continue()});
 await page.setViewportSize({width,height:844});await page.goto(PAGE_URL);await expect(page.locator('#shoppingResults')).toContainText('1,234 元');await expect(page.locator('#shoppingResults')).not.toContainText('榮耀之星');
 await openShoppingFilters(page);await page.locator('#shoppingBrand').selectOption('APPLE');await page.locator('#shoppingModel').selectOption('APPLE iPhone 17 Pro (5G)');await page.locator('#shoppingCapacity').selectOption('256GB');await page.locator('#enterpriseSegmentBtn').click();await expect(page.locator('#shoppingSectionTitle')).toHaveText('企業用戶專區');await openShoppingFilters(page);await page.locator('#shoppingRent').selectOption('999');
 await expect(page.locator('#shoppingProject option')).toHaveText(['全部專案','(企客 5G)榮耀之星 iPhone']);await page.locator('#tableModeBtn').click();await expect(page.locator('.comparison-table tbody tr')).toHaveCount(1);await expect(page.locator('.comparison-table tbody td')).toHaveText(['2,999 元','0 元']);await expect(page.locator('.comparison-table tbody')).not.toContainText('未列此條件');await expect(page.locator('.comparison-table tbody')).not.toContainText('無報價');
 await page.locator('.comparison-table details').filter({hasText:'完整條件'}).first().click();await expect(page.locator('.raw-condition').first()).toHaveText('企客特殊專案(2)／(企客_5G)榮耀之星999H(24)_iPhone');
 await page.locator('#cardModeBtn').click();await expect(page.locator('.quote-card')).toContainText('2,999 元');expect(await page.locator('.quote-card .quote').evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(28);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#consumerSegmentBtn').click();await expect(page.locator('#shoppingResults')).toContainText('1,234 元');await expect(page.locator('#shoppingResults')).not.toContainText('2,999 元');
});

test('完整價格先讀取，異動僅在要求時載入且鎖定目前快照',async({page})=>{
 const calls=[];
 await page.route('**/exec*',async route=>{
  const p=publicPayload(route.request());calls.push(p);
  if(p.action==='threec_snapshot_read')return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify({...response(p.kind),changeSet:null,changesDeferred:true})});
  return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify({status:'ok',snapshotHash:response(p.kind).snapshot.snapshot_hash,changeSet:response(p.kind).changeSet})});
 });
 await page.goto(TRADEIN_URL);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
 expect(calls).toHaveLength(2);expect(calls.every(p=>p.includeChanges===false)).toBe(true);
 await expect(page.locator('#tradeinResults')).toContainText('17,500');expect(calls).toHaveLength(2);
 await openHistory(page);await page.locator('#changeLoadBtn').click();await expect(page.locator('#changeResults')).toContainText('FutureDial');
 expect(calls[2]).toMatchObject({action:'threec_changes_read',kind:'tradein',snapshotHash:'tradein-snapshot-v1',offset:0,limit:100});
 await expect(page.locator('#changeLoadBtn')).toBeHidden();
});

test('異動逾時可單獨重試，完整價格和一般企業切換仍可用',async({page})=>{
 let fail=true;
 await page.route('**/exec*',async route=>{
  const p=publicPayload(route.request());
  if(p.action==='threec_snapshot_read')return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify({...response(p.kind),changeSet:null,changesDeferred:true})});
  return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(fail?{status:'error',message:'異動測試逾時'}:{status:'ok',changeSet:response(p.kind).changeSet})});
 });
 await page.goto(PAGE_URL);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
 await openHistory(page);await page.locator('#changeLoadBtn').click();await expect(page.locator('#changeSummary')).toContainText('異動測試逾時');
 await expect(page.locator('#shoppingResults')).toContainText('iPhone');await expect(page.locator('#changeLoadBtn')).toBeEnabled();
 await page.locator('#enterpriseSegmentBtn').click();await page.locator('#consumerSegmentBtn').click();await expect(page.locator('#shoppingResults')).toContainText('iPhone');
 fail=false;await openHistory(page);await page.locator('#changeLoadBtn').click();await expect(page.locator('#changeResults')).toContainText('合約24期');
});

test('compact response reconstructs all prices before query; refresh and segment switches remain compatible',async({page})=>{
 const T=require('../threec-price-transport.js'),calls=[];
 await page.route('**/exec*',async route=>{
  const p=publicPayload(route.request());calls.push(p);const body=response(p.kind);
  body.snapshot.row_count=body.snapshot.rows.length;
  if(p.action==='threec_snapshot_read'){body.changeSet=null;body.changesDeferred=true;return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(T.encode(body))});}
  return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(PAGE_URL);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
 await expect(page.locator('#shoppingResults')).toContainText('0 元');await expect(page.locator('#shoppingResults')).not.toContainText('無報價');
 await page.locator('#enterpriseSegmentBtn').click();await page.locator('#consumerSegmentBtn').click();await expect(page.locator('#shoppingResults')).toContainText('iPhone');
 await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
 expect(calls).toHaveLength(4);expect(calls.every(p=>p.priceEncoding===T.ENCODING&&p.includeChanges===false&&!p.employeeId)).toBe(true);
});

test('大手機快照先走單次 iframe，避免15秒中止後重複執行',async({page})=>{
 const reads=[];await page.route('**/exec*',route=>{const p=publicPayload(route.request());reads.push({kind:p.kind,transport:new URL(route.request().url()).searchParams.get('transport')||'fetch'});return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(response(p.kind))});});
 await page.goto(PAGE_URL);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
 expect(reads.filter(r=>r.kind==='shopping')).toEqual([{kind:'shopping',transport:'iframe'}]);expect(reads.filter(r=>r.kind==='tradein')).toEqual([{kind:'tradein',transport:'fetch'}]);
});

// Full card condition regression, run by the existing query CI entrypoint.
{
'use strict';
const {test,expect}=require('@playwright/test'),path=require('node:path'),fs=require('node:fs');
const f=require('./threec-card-options-fixture.cjs');
async function setup(page,width){
 const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:844});
 await page.route(/^https?:/,route=>{
  const url=new URL(route.request().url());if(!url.pathname.startsWith('/macros/s/'))return route.abort();
  const raw=route.request().postData();let payload;try{payload=JSON.parse(raw);}catch{payload=JSON.parse(new URLSearchParams(raw).get('payload'));}
  calls.push(payload);expect(payload.action).toBe('threec_snapshot_read');
  const body=payload.kind==='shopping'?f.shopping:f.tradein;
  if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c')+',"*")</script>'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('file://'+path.resolve(__dirname,'../threec-query.html'));await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
 await openShoppingFilters(page);
 return {errors,calls};
}
async function keys(page){return page.locator('#shoppingCardCondition option').evaluateAll(options=>options.map(o=>o.value));}
for(const width of [1440,390]){
 test(`${width}px card dropdown exposes every general and enterprise condition without first selecting a project`,async({page})=>{
  const env=await setup(page,width);await page.locator('#shoppingRent').selectOption('');await page.locator('#cardModeBtn').click();
  expect(new Set(await keys(page))).toEqual(new Set(f.consumer));
  await page.locator('#shoppingCardCondition').selectOption(f.consumerLast);await expect(page.locator('.quote-card')).toHaveCount(3);await expect(page.locator('.quote.zero')).toHaveCount(2);await expect(page.locator('#columnNext')).toBeDisabled();
  await page.locator('#tableModeBtn').click();await expect(page.locator('.comparison-table thead th')).toHaveCount(13);await page.locator('#columnNext').click();await expect(page.locator('#columnPage')).toHaveText('2 / 3 組');
  await page.locator('#cardModeBtn').click();expect(new Set(await keys(page))).toEqual(new Set(f.consumer));await expect(page.locator('#columnPage')).toHaveText('1 / 1 組');
  await page.locator('#enterpriseSegmentBtn').click();expect(new Set(await keys(page))).toEqual(new Set(f.enterprise));
  const renewal=f.force('48','_iPhone_續約');await page.locator('#shoppingCardCondition').selectOption(renewal);await expect(page.locator('.quote-card')).toHaveCount(2);await expect(page.locator('.quote-card').first()).toContainText('續約');await expect(page.locator('.quote-card').first()).toContainText('1,000 元');
  await page.locator('#shoppingCardCondition').selectOption(f.force('48','_iPhone_新申裝'));await expect(page.locator('.quote.zero')).toHaveCount(2);await expect(page.locator('.quote-card').first()).toContainText('新申裝');
  await page.locator('#shoppingCardCondition').selectOption(f.force('48'));await expect(page.locator('.quote-card')).toHaveCount(1);await expect(page.locator('.quote-card')).toContainText('Galaxy');await expect(page.locator('.quote-card')).toContainText('700 元');
  expect(env.errors).toEqual([]);expect(env.calls).toHaveLength(2);
  if(process.env.CARD_OPTIONS_QA_DIR){fs.mkdirSync(process.env.CARD_OPTIONS_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.CARD_OPTIONS_QA_DIR,`card-options-${width}.png`),fullPage:true});}
 });
 test(`${width}px full card conditions respect model qualification and filters, preserving zero and independent renewal prices`,async({page})=>{
  const env=await setup(page,width);await page.locator('#enterpriseSegmentBtn').click();await page.locator('#cardModeBtn').click();
  await page.locator('#shoppingBrand').selectOption('APPLE');await page.locator('#shoppingModel').selectOption('iPhone 合成機');await page.locator('#shoppingCapacity').selectOption('256GB');await page.locator('#shoppingProject').selectOption('企客5G員工眷5力全開-新申裝/續約');await page.locator('#shoppingRent').selectOption('999');await page.locator('#shoppingTerm').selectOption('48');
  expect(new Set(await keys(page))).toEqual(new Set([f.force('48','_iPhone_新申裝'),f.force('48','_iPhone_續約')]));
  await page.locator('#shoppingCardCondition').selectOption(f.force('48','_iPhone_新申裝'));await expect(page.locator('.quote.zero')).toHaveCount(1);await expect(page.locator('.quote-card')).toContainText('256GB');
  await page.locator('#shoppingCardCondition').selectOption(f.force('48','_iPhone_續約'));await expect(page.locator('.quote-card')).toContainText('1,000 元');
  await page.locator('#shoppingBrand').selectOption('Samsung');expect(await keys(page)).toEqual([f.force('48')]);await expect(page.locator('.quote-card')).toContainText('700 元');
  await page.locator('#shoppingSearch').fill('不存在的機款');expect(await keys(page)).toEqual([]);await expect(page.locator('#shoppingResults')).toContainText('沒有符合');
  await page.locator('#shoppingReset').click();expect(new Set(await keys(page))).toEqual(new Set(f.enterprise));
  expect(env.errors).toEqual([]);expect(env.calls).toHaveLength(2);
 });
}

}

// The retained ?view=source route above verifies exact original grade/value contracts.
// These cases exercise the actual default v6 interface, without a source-mode flag.
for(const width of [320,390,1280])test(`正式預設第6版 ${width}px 獨立分級、分頁及來源清除`,async({page})=>{
 const errors=[],calls=[];let failed=false;page.on('pageerror',e=>errors.push(e.message));
 const rows=Array.from({length:45},(_,i)=>({brand:'Test',model:'QA '+String(i).padStart(2,'0')+' 256GB',source_sheet:'SYNTHETIC ONLY',quotes:{'點子行動':{A:1000+i,B:700+i},'FutureDial（FDI）':{A:950+i,S:1200+i},'愛鋒派':{'未分級':800+i}}}));
 const snapshot={kind:'tradein',source_version_date:'2026-11-05',snapshot_hash:'synthetic-v6-browser',rows};const before=JSON.stringify(snapshot);
 await page.route('**/exec*',route=>{const payload=publicPayload(route.request());calls.push(payload);const body=failed?{status:'error',message:'合成拒絕讀取'}:{status:'ok',snapshot:payload.kind==='tradein'?snapshot:null,changesDeferred:true};return fulfillPublic(route,{contentType:'application/json',body:JSON.stringify(body)});});
 await page.setViewportSize({width,height:900});await page.goto('file://'+path.resolve(__dirname,'../tradein-query.html'));
 await expect(page.locator('#tradeinResults')).toHaveClass(/official-workspace/);await expect(page.locator('.official-price-table tbody tr')).toHaveCount(20);await expect(page.locator('.tref-summary')).toContainText('點子 多 50 元');
 const controls=await page.locator('.official-tools').boundingBox(),summary=await page.locator('.official-workspace .tref-summary').boundingBox();expect(summary.y).toBeGreaterThanOrEqual(controls.y+controls.height);
 await page.locator('[data-oq-grade="FutureDial（FDI）"]').selectOption('S');await expect(page.locator('.tref-summary')).toContainText('FDI 多 200 元');await expect(page.locator('[data-oq-grade="點子行動"]')).toHaveValue('A');
 await expect(page.locator('.official-price-table')).toContainText('來源未分級');await page.locator('[data-oq=next]').click();await expect(page.locator('.tref-summary')).toContainText('QA 20');await page.locator('[data-oq=next]').click();await expect(page.locator('.official-price-table tbody tr')).toHaveCount(5);await expect(page.locator('.official-price-table')).toContainText('QA 44');
 await page.locator('[data-oq=detail]').click();await expect(page.locator('#tradeinOfficialDialog')).toBeVisible();await expect(page.locator('[data-oq=dialog-body]')).toContainText('愛鋒派（獨立報價）');await expect(page.locator('[data-oq=dialog-body]')).toContainText('正式來源未提供');await page.locator('[data-oq=close]').click();
 const size=await page.evaluate(()=>({root:document.documentElement.scrollWidth,width:innerWidth}));expect(size.root).toBeLessThanOrEqual(size.width);expect(JSON.stringify(snapshot)).toBe(before);expect(calls).toHaveLength(2);expect(calls.every(p=>p.action==='threec_snapshot_read')).toBe(true);
 failed=true;await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('合成拒絕讀取');await expect(page.locator('.official-price-table')).toHaveCount(0);await expect(page.locator('#tradeinResults')).not.toContainText('QA 40');expect(errors).toEqual([]);
});
