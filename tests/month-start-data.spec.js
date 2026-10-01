const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const Catalog=require('../award-model-catalog.js');
const ROOT=path.resolve(__dirname,'..');
let server,base;
test.use({serviceWorkers:'block'});
test.beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    const file=path.join(ROOT,new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async()=>{await new Promise(resolve=>server.close(resolve));});
function fixture(){
  const keys=['AQ V+D 999 (含)以上','AQ V+D 1399 (含)以上','好速案銷售點數','RT V+D 1399 (含)以上',
    ...Array.from({length:21},(_,i)=>`正式項目${i}`)];
  const names=['台北通化','台北酒泉','台北三創','台北萬大','台北六張犁','台北復興南','台北永吉','台北大稻埕','台北杭州南'];
  const items=Object.fromEntries(keys.map((key,i)=>[key,{a:i?0:null,t:i?10:null,reportRate:i?0:null}]));
  const calc={meta:{month:'2026-10',snapshotDay:1,monthDays:31,sourceFile:'1002.xlsx'},items:keys.map(key=>({key})),
    aggregateRates:Object.fromEntries(keys.map((key,i)=>[key,i?0:null])),
    stores:names.map((name,i)=>({code:`DNB${i}`,name,official:i?0:null,items})),persons:[]};
  const awardItems=Catalog.definitions('2026-10-01').map(row=>({name:row.sourceName,display_name:row.shortName,actual:null,target:null,rate:null,difference:null}));
  const snapshot={kpiBattle:{report_date:'2026-10-01',report_run_date:'2026-10-02',data_as_of_date:'2026-10-01',source_file:'1002.xlsx',
    aggregate:{},stores:[],personal:[],processing_run_id:'month-start'},awardsBattle:{
      report_date:'2026-10-01',report_run_date:'2026-10-02',data_as_of_date:'2026-10-01',processing_run_id:'month-start',
      phone_items:10,store_rows:10,supervisor:{},overall:{store:'北一二B整體',items:awardItems},
      stores:names.map(store=>({store,items:awardItems,award:{}}))}};
  return {calc,snapshot};
}
async function mock(page,data){
  await page.addInitScript(()=>localStorage.setItem('north12b_private_dashboard_employee_id','TEST01'));
  await page.route('https://script.google.com/**',route=>{
    const action=JSON.parse(route.request().postData()||'{}').action;
    return route.fulfill({json:action==='private_access'?{status:'ok',snapshot:data.snapshot,profile:{maskedName:'測＊員'}}:
      action==='kpicalc_access'?{status:'ok',data:data.calc}:{status:'ok',data:{}}});
  });
}
async function loginWebsite(page){
  await page.getByPlaceholder('輸入員工編號').fill('TEST01');
  await page.getByRole('button',{name:'以員編登入'}).click();
}
for(const width of [390,1440]){
  test(`partial website at ${width}px keeps KPI and October model cards`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await mock(page,fixture());
    await page.goto(`${base}/kpi-battle.html`);
    await loginWebsite(page);
    await expect(page.locator('#kpiBattleContent table').first()).toBeVisible();
    await expect(page.locator('#kpiBattleContent')).toContainText('尚未有資料');
    await expect(page.locator('#kpiBattleContent')).toContainText('0.0%');
    await page.goto(`${base}/awards-battle.html`);
    await loginWebsite(page);
    await expect(page.locator('.award-store-card')).toHaveCount(10);
    await expect(page.locator('.award-model')).toHaveCount(10);
    await expect(page.locator('#awardsBattleContent')).toContainText('尚未有資料');
    await expect(page.locator('#awardsBattleContent')).not.toContainText('$0');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
  test(`partial app at ${width}px keeps unknown award eligibility distinct`,async({page})=>{
    await page.setViewportSize({width,height:900});
    await mock(page,fixture());
    await page.goto(`${base}/app.html`);

    await expect(page.locator('#kpiHero')).toContainText('尚未有資料');
    await expect(page.locator('#homeStoreList .store-item')).toHaveCount(9);
    await expect(page.locator('#awardHome')).toContainText('尚未有資料');
    await expect(page.locator('#awardHome .award-tag')).toHaveText(Array(9).fill('尚未有資料')); 
    expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
}
test('restored production readback renders both controllers and app',async({page})=>{
  test.skip(!process.env.KPI_REPAIR_READBACK_DIR,'Private readback files are provided only at verification time');
  const snapshot=JSON.parse(fs.readFileSync(path.join(process.env.KPI_REPAIR_READBACK_DIR,'dashboard.json')));
  const calc=JSON.parse(fs.readFileSync(path.join(process.env.KPI_REPAIR_READBACK_DIR,'kpicalc.json')));
  await mock(page,{snapshot,calc});
  await page.goto(`${base}/kpi-battle.html`);
    await loginWebsite(page);
  await expect(page.locator('#kpiBattleContent .summary-card').first()).toContainText(`${(snapshot.kpiBattle.aggregate.overall_kpi*100).toFixed(1)}%`);
  await page.goto(`${base}/awards-battle.html`);
    await loginWebsite(page);
  await expect(page.locator('.award-store-card')).toHaveCount(10);
  await page.goto(`${base}/app.html`);

  await expect(page.locator('#kpiHero')).toContainText(`${(snapshot.kpiBattle.aggregate.overall_kpi*100).toFixed(1)}%`);
  await expect(page.locator('#awardHome .award-row:not(.header)')).toHaveCount(9);
});
