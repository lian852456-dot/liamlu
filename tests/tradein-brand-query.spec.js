'use strict';
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fs=require('node:fs');
const PAGE='file://'+path.resolve(__dirname,'../tradein-query.html');
const SHOP='file://'+path.resolve(__dirname,'../threec-query.html');
function fixture(){return {status:'ok',changesDeferred:true,snapshot:{kind:'tradein',source_version_date:'2026-10-12',snapshot_hash:'synthetic-ops-brands',row_count:4,rows:[
  {brand:'Apple',model:'iPhone 17 Pro 256GB',quotes:{'點子行動':{S:'20,000',A:'16,000',B:'',C:null},'FutureDial（FDI）':{A:0}}},
  {brand:'Apple',model:'iPhone 16 128GB',quotes:{'點子行動':{A:'8,000'}}},
  {brand:'Samsung',model:'Galaxy S25 512GB',quotes:{'點子行動':{A:'12,000'},'愛鋒派':{'未分級':'7,000'}}},
  {brand:'NoQuote',model:'Excluded',quotes:{'點子行動':{S:'',A:null}}}
]}};}
async function mock(page,read=fixture){
  const calls=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new global.URL(request.url());
    if(url.protocol==='file:'||url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname!=='script.google.com')return route.abort();
    const raw=request.postData()||'{}';
    const payload=raw.startsWith('{')?JSON.parse(raw):JSON.parse(new URLSearchParams(raw).get('payload')||'{}');
    calls.push(payload);
    const body=payload.kind==='tradein'?read():{status:'ok',snapshot:null};
    if(url.searchParams.get('transport')==='iframe'){
      const message=JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c');
      return route.fulfill({contentType:'text/html',body:'<!doctype html><script>window.top.postMessage('+message+',"*")</script>'});
    }
    return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  });
  return {calls,errors};
}
async function ready(page){await page.goto(PAGE);await expect(page.locator('#tradeinBrand')).toBeEnabled();}
const values=locator=>locator.locator('option').evaluateAll(options=>options.map(o=>o.value));
test('內部廠牌在機款前，保留營運中心、進度與版本檢查；未驗證督導隱藏簡報',async({page})=>{
  const {calls,errors}=await mock(page);await ready(page);
  expect(await values(page.locator('#tradeinBrand'))).toEqual(['','Apple','Samsung']);
  expect(await page.locator('#tradeinPane select').evaluateAll(nodes=>nodes.map(n=>n.id))).toEqual(['tradeinBrand','tradeinModel','tradeinProvider','tradeinGrade']);
  await expect(page.locator('a[href="home.html"]')).toBeVisible();
  await expect(page.locator('a[href="tradein-progress.html"]')).toBeVisible();
  await expect(page.locator('a[href="tradein-brief.html"]')).toBeHidden();
  await expect(page.locator('#changeCard')).toBeVisible();
  await expect(page.locator('#tradeinMeta')).toContainText('4 筆來源資料');
  expect(calls.filter(c=>c.kind==='tradein')).toHaveLength(1);
  expect(calls.every(c=>c.action==='threec_snapshot_read')).toBe(true);
  expect(errors).toEqual([]);
});
test('廠牌連動只列該廠牌機款，換廠牌先清除不相容機款再繪製結果',async({page})=>{
  const {calls}=await mock(page);await ready(page);
  await page.locator('#tradeinBrand').selectOption('Apple');
  const options=await values(page.locator('#tradeinModel'));
  expect(options).toHaveLength(3);expect(options.slice(1).every(v=>v.startsWith('Apple'))).toBe(true);
  await page.locator('#tradeinModel').selectOption(options[1]);
  await expect(page.locator('#tradeinResults')).not.toContainText('iPhone 16');
  await page.locator('#tradeinBrand').selectOption('Samsung');
  await expect(page.locator('#tradeinModel')).toHaveValue('');
  await expect(page.locator('#tradeinResults')).toContainText('Galaxy S25');
  await expect(page.locator('#tradeinResults')).not.toContainText('iPhone');
  expect(await values(page.locator('#tradeinModel'))).toHaveLength(2);
  await expect(page.locator('#tradeinMeta')).toContainText('4 筆來源資料');
  expect(calls.filter(c=>c.kind==='tradein')).toHaveLength(1);
});
test('關鍵字、回收商、等級繼續交集篩選，零元仍有效、缺價不補零',async({page})=>{
  await mock(page);await ready(page);
  await page.locator('#tradeinBrand').selectOption('Apple');
  await page.locator('#tradeinSearch').fill('256GB');
  await page.locator('#tradeinProvider').selectOption('FutureDial（FDI）');
  await page.locator('#tradeinGrade').selectOption('A');
  await expect(page.locator('#tradeinResults')).toContainText('0 元');
  await expect(page.locator('#tradeinResults')).not.toContainText('點子行動');
  await page.locator('#tradeinBrand').selectOption('Samsung');
  await expect(page.locator('#tradeinSearch')).toHaveValue('256GB');
  await expect(page.locator('#tradeinProvider')).toHaveValue('FutureDial（FDI）');
  await expect(page.locator('#tradeinGrade')).toHaveValue('A');
  await expect(page.locator('#tradeinResults')).toContainText('沒有符合');
  await page.locator('#tradeinSearch').fill('');
  await page.locator('#tradeinProvider').selectOption('愛鋒派');
  await page.locator('#tradeinGrade').selectOption('未分級');
  await expect(page.locator('#tradeinResults')).toContainText('7,000 元');
});
test('重新讀取失敗、空版本及離頁清空廠牌機款，不殘留舊來源',async({page})=>{
  let body=fixture();await mock(page,()=>body);await ready(page);
  await page.locator('#tradeinBrand').selectOption('Apple');
  body={status:'error',message:'synthetic unavailable'};
  await page.locator('#refreshBtn').click();
  await expect(page.locator('#queryStatus')).toContainText('正式資料已清除');
  expect(await values(page.locator('#tradeinBrand'))).toEqual(['']);
  expect(await values(page.locator('#tradeinModel'))).toEqual(['']);
  await expect(page.locator('#tradeinBrand')).toBeDisabled();
  body={status:'ok',snapshot:null};await page.locator('#refreshBtn').click();
  await expect(page.locator('#queryStatus')).toContainText('尚未發布');
  body=fixture();await page.locator('#refreshBtn').click();
  await expect(page.locator('#tradeinBrand')).toBeEnabled();
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  expect(await values(page.locator('#tradeinBrand'))).toEqual(['']);
  await expect(page.locator('#tradeinResults')).not.toContainText('iPhone');
});
test('完整廠牌機款選項不受前50筆限制、選最後一款仍可查到',async({page})=>{
  const body=fixture();body.snapshot.rows=Array.from({length:65},(_,i)=>({brand:'Apple',model:'Test model '+i,quotes:{'點子行動':{A:i}}}));body.snapshot.row_count=65;
  await mock(page,()=>body);await ready(page);await page.locator('#tradeinBrand').selectOption('Apple');
  const opts=await values(page.locator('#tradeinModel'));expect(opts).toHaveLength(66);
  await page.locator('#tradeinModel').selectOption(opts.at(-1));
  await expect(page.locator('#tradeinResults')).toContainText('Test model 64');
  await expect(page.locator('#tradeinResults')).toContainText('64 元');
});
test('廠牌文字安全呈現，原手機專案頁不載入此模組',async({page})=>{
  const body=fixture();body.snapshot.rows[0].brand='<img src=x onerror=alert(1)>';
  const {errors}=await mock(page,()=>body);await ready(page);
  await expect(page.locator('#tradeinBrand')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('#tradeinPane img')).toHaveCount(0);
  await page.goto(SHOP);
  await expect(page.locator('#queryStatus')).toContainText('尚未發布');
  await expect(page.locator('script[src*="tradein-brand-query"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
for(const width of [320,390,1280])test(`內部查價 ${width}px 廠牌機款可操作且不溢出`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await mock(page);await ready(page);
  await page.locator('#tradeinBrand').selectOption('Apple');
  const size=await page.evaluate(()=>({body:document.body.scrollWidth,html:document.documentElement.scrollWidth,inner:innerWidth}));
  expect(size.body).toBeLessThanOrEqual(size.inner);expect(size.html).toBeLessThanOrEqual(size.inner);
  await page.screenshot({path:testInfo.outputPath(`internal-brands-${width}.png`),fullPage:true});
});
test('變更只在內部查價頁，不引用外部共用站或寫入來源',()=>{
  const js=fs.readFileSync(path.resolve(__dirname,'../tradein-brand-query.js'),'utf8');
  expect(js).not.toMatch(/fetch\(|XMLHttpRequest|localStorage|sessionStorage|adminSecret|pages\.dev/);
  expect(js).toContain('core.sourceMeta(source,response.registry');
});
