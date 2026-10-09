'use strict';

const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');
const Fixture=require('./threec-search-fixture.cjs');
let BASE,server;
test.beforeAll(async()=>{
  if(process.env.TEST_BASE_URL){BASE=process.env.TEST_BASE_URL;return;}
  const root=path.resolve(__dirname,'..');
  server=http.createServer(async(req,res)=>{
    try{
      const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
      if(path.relative(root,file).startsWith('..'))throw new Error('outside test root');
      const type={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css'}[path.extname(file)];
      if(!type)throw new Error('unsupported asset');
      res.writeHead(200,{'Content-Type':type+';charset=utf-8','Connection':'close'});res.end(await fs.readFile(file));
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  BASE=`http://127.0.0.1:${server.address().port}/`;
});
test.afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function intercept(page){
  const calls=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===new URL(BASE).origin)return route.continue();
    if(url.hostname!=='script.google.com')return route.abort('blockedbyclient');
    const text=request.postData()||'{}';let payload;
    try{payload=JSON.parse(text);}catch{payload=JSON.parse(new URLSearchParams(text).get('payload')||'{}');}
    calls.push(payload);
    if(!['threec_snapshot_read','threec_changes_read'].includes(payload.action))return route.abort('blockedbyclient');
    const body=payload.action==='threec_snapshot_read'?Fixture[payload.kind]():{status:'ok',changeSet:{kind:payload.kind,changes:[],changeCount:0,totalChangeCount:0,hasMore:false}};
    if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<script>window.top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body})+',"*")</script>'});
    return route.fulfill({contentType:'application/json; charset=utf-8',body:JSON.stringify(body)});
  });
  return {calls,errors};
}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
for(const width of [1280,390,320])test(`${width}px public price routes work from home and APP without expanding private access`,async({page},testInfo)=>{
  const {calls,errors}=await intercept(page);await page.setViewportSize({width,height:900});
  await page.goto(new URL('home.html',BASE).href);
  await expect(page.locator('a.card[href="tradein-import-lab.html"]')).toHaveCount(0);
  await expect(page.locator('a.card[href="threec-query.html"] h3')).toHaveText('手機專案價查詢');
  await expect(page.locator('a.card[href="tradein-query.html"] h3')).toHaveText('舊換新專區');
  expect(calls).toEqual([]);
  await page.locator('a.card[href="tradein-query.html"]').click();
  await expect(page.locator('h1')).toHaveText('舊換新專區');
  await expect(page.locator('#tradeinResults')).toContainText('示範回收');
  await expect(page.locator('#tradeinResults')).toContainText('0 元');
  await expect(page.locator('#shoppingPane')).toBeHidden();await noOverflow(page);
  await page.screenshot({path:testInfo.outputPath(`SYNTHETIC-recovery-${width}.png`),fullPage:true});
  await expect(page.locator('a[href="tradein-progress.html"]')).toHaveCount(0);
  await expect(page.locator('#employeeId')).toHaveCount(0);
  await page.getByRole('link',{name:'手機專案價查詢',exact:true}).click();
  await page.goto(new URL('threec-query.html',BASE).href);
  await expect(page.locator('h1')).toHaveText('手機專案價查詢');
  await expect(page.locator('#shoppingMeta')).toContainText('正式來源日期');
  await expect(page.locator('#tradeinPane')).toBeHidden();await expect(page.locator('.legacy-tabs')).toBeHidden();await noOverflow(page);
  await page.screenshot({path:testInfo.outputPath(`SYNTHETIC-phone-${width}.png`),fullPage:true});
  await page.locator('.home-link').click();
  await page.locator('#tool-search').fill('舊換新');
  await expect(page.locator('a.card[href="tradein-query.html"]')).toBeVisible();
  await page.locator('#tool-search').fill('');
  await expect(page.locator('a.card[href="tradein-import-lab.html"]')).toHaveCount(0);
  await page.goto(new URL('app.html',BASE).href);
  const prices=page.getByRole('region',{name:'公開查價'});
  await expect(prices.getByRole('link',{name:'手機專案價查詢',exact:true})).toBeVisible();
  await expect(prices.getByRole('link',{name:'舊換新專區',exact:true})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath(`APP-public-prices-${width}.png`),fullPage:true});
  await prices.getByRole('link',{name:'舊換新專區',exact:true}).click();
  await expect(page.locator('#tradeinResults')).toContainText('示範回收');
  await page.goBack();
  await expect(prices.getByRole('link',{name:'手機專案價查詢',exact:true})).toBeVisible();
  await page.locator('[data-profile-entry]').click();
  await expect(page.locator('#privateAccessForm')).toBeVisible();
  await expect(page.locator('#viewerState')).toHaveText('未登入');
  await expect(page.locator('#employeeId')).toHaveValue('');
  await noOverflow(page);
  expect(calls.every(c=>!('employeeId'in c)&&!('deviceId'in c)&&!('token'in c)&&!('adminSecret'in c))).toBe(true);
  expect(calls.filter(c=>c.action==='threec_snapshot_read').every(c=>c.includeChanges===false&&c.priceEncoding==='shopping-columns/v1')).toBe(true);
  expect(errors).toEqual([]);
});
test('existing #tradein deep links resolve to the recovery view',async({page})=>{
  const {errors}=await intercept(page);await page.goto(new URL('threec-query.html#tradein',BASE).href);
  await expect(page).toHaveURL(/\/tradein-query\.html$/);
  await expect(page.locator('#tradeinResults')).toContainText('示範回收');
  await expect(page.locator('#shoppingPane')).toBeHidden();expect(errors).toEqual([]);
});
