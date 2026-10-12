'use strict';
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const URL = 'file://' + path.resolve(__dirname, '../tradein-price-share.html');

function published(){
  return {
    status:'ok',
    snapshot:{
      kind:'tradein',
      source_version_date:'2026-10-12',
      published_at:'2026-10-12T11:00:00+08:00',
      row_count:2,
      rows:[
        {source_sheet:'回收價',brand:'Apple',model:'iPhone 17 Pro 256GB',colorless_model:'iPhone 17 Pro 256GB',
         quotes:{'點子行動':{S:'20,000',A:'16,000',B:'',C:null},'FutureDial（FDI）':{S:'19,500',A:'0',B:'8,000',C:''}}},
        {source_sheet:'回收價',brand:'Samsung',model:'Galaxy S25 512GB',colorless_model:'Galaxy S25 512GB',
         quotes:{'愛鋒派':{S:'15,000',A:'14,000',B:'11,000',C:'7,000','未分級':''}}}
      ]
    }
  };
}
async function intercept(page, body=published()){
  const calls=[];
  await page.route('**/exec*', async route=>{
    const post=route.request().postData()||'{}';
    const payload=post.startsWith('{')?JSON.parse(post):JSON.parse(new URLSearchParams(post).get('payload')||'{}');
    calls.push(payload);
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(typeof body==='function'?body():body)});
  });
  return calls;
}
test('跨區公開頁只發出一個正式回收價讀取，不請求管理、手機專案或績效',async({page})=>{
  const calls=await intercept(page);
  await page.goto(URL);
  await expect(page.locator('#queryStatus')).toContainText('已讀取正式回收價');
  await expect(page.locator('#results')).toContainText('iPhone 17 Pro 256GB');
  expect(calls).toEqual([{action:'threec_snapshot_read',kind:'tradein',includeChanges:false}]);
  await expect(page.locator('a[href*="home"],a[href*="tradein-progress"],a[href*="upload"]')).toHaveCount(0);
  await expect(page.locator('input[type="file"],input[type="password"],#adminSecret,#employeeId')).toHaveCount(0);
  const values=await page.evaluate(()=>Object.keys(localStorage).filter(key=>/threec|price|tradein/i.test(key)));
  expect(values).toEqual([]);
});
test('依機款、回收商和等級篩選，缺價不顯示、合法零元會顯示',async({page})=>{
  await intercept(page);
  await page.goto(URL);
  await expect(page.locator('#results')).toContainText('0 元');
  await expect(page.locator('#results')).not.toContainText('無報價');
  await page.locator('#keyword').fill('Galaxy');
  await expect(page.locator('#results')).toContainText('Galaxy S25 512GB');
  await expect(page.locator('#results')).not.toContainText('iPhone 17 Pro');
  await page.locator('#resetBtn').click();
  await page.locator('#provider').selectOption('FutureDial（FDI）');
  await page.locator('#grade').selectOption('A');
  await expect(page.locator('#results')).toContainText('0 元');
  await expect(page.locator('#results')).not.toContainText('20,000 元');
  await page.locator('#provider').selectOption('愛鋒派');
  await expect(page.locator('#results')).toContainText('14,000 元');
  await expect(page.locator('#results')).not.toContainText('iPhone 17 Pro');
});
test('發布空版本及讀取錯誤採 fail-closed，不殘留舊價格',async({page})=>{
  let body=published();
  const calls=await intercept(page,()=>body);
  await page.goto(URL);
  await expect(page.locator('#results')).toContainText('20,000 元');
  body={status:'error',message:'公開價格不可用'};
  await page.locator('#refreshBtn').click();
  await expect(page.locator('#queryStatus')).toContainText('讀取失敗');
  await expect(page.locator('#results')).not.toContainText('20,000 元');
  body={status:'ok',snapshot:null};
  await page.locator('#refreshBtn').click();
  await expect(page.locator('#queryStatus')).toContainText('尚未發布');
  expect(calls).toHaveLength(3);
});
test('回收機款與價格字串只能作為文字顯示，不可注入 HTML',async({page})=>{
  const data=published();
  data.snapshot.rows[0].model='<img src=x onerror="window.injected=1">';
  data.snapshot.rows[0].colorless_model=data.snapshot.rows[0].model;
  await intercept(page,data);
  await page.goto(URL);
  await expect(page.locator('#results')).toContainText('<img src=x onerror=');
  await expect(page.locator('#results img')).toHaveCount(0);
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();
});
for(const width of [320,390,1280]){
  test(`在 ${width}px 畫面無整頁水平溢出`,async({page})=>{
    await page.setViewportSize({width,height:850});
    await intercept(page);
    await page.goto(URL);
    await expect(page.locator('#queryStatus')).toContainText('已讀取正式回收價');
    const dimensions=await page.evaluate(()=>({body:document.body.scrollWidth,root:document.documentElement.scrollWidth,viewport:innerWidth}));
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.root).toBeLessThanOrEqual(dimensions.viewport);
  });
}
