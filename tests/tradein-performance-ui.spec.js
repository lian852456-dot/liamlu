'use strict';

const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
const http=require('node:http');
const path=require('node:path');
const Core=require('../tradein-performance-core.js');
const Ref=require('./tradein-reference-fixture.cjs');
// All identities, transactions, and API replies below are synthetic. These tests
// verify historical private PR179 UI fixture with a ready reply only inside this synthetic
// test server. The production candidate has a separate anonymous UI; this fixture only prevents private-reader regressions.
let PAGE,localServer;
test.beforeAll(async()=>{
  if(process.env.TEST_BASE_URL){PAGE=new URL('tradein-progress.html',process.env.TEST_BASE_URL).href;return;}
  const root=path.resolve(__dirname,'..');
  localServer=http.createServer(async(request,response)=>{
    try{
      const file=path.resolve(root,'.'+decodeURIComponent(new URL(request.url,'http://localhost').pathname));
      if(path.relative(root,file).startsWith('..'))throw new Error('outside test source');
      const type={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css'}[path.extname(file)];
      if(!type)throw new Error('unsupported test asset');
      response.writeHead(200,{'Content-Type':type+';charset=utf-8','Connection':'close'});response.end(await fs.readFile(file));
    }catch{response.writeHead(404);response.end();}
  });
  await new Promise(resolve=>localServer.listen(0,'127.0.0.1',resolve));
  PAGE=`http://127.0.0.1:${localServer.address().port}/tradein-progress.html`;
});
test.afterAll(async()=>{if(localServer)await new Promise(resolve=>localServer.close(resolve));});
const staff=(id,store,role)=>({employee_id:Ref.IDS[id],masked_name:'測＊'+id.slice(-1),store,role,status:'active'});
function snapshot(){
  const records=[['a','12345','DNB10168'],['b','12346','DNB10168'],['c','12346','DNB10168'],['d','12347','DNB10146']].map(([key,id,store])=>({
    store_code:store,source_employee_id:id,trade_date:'2026-10-02',cancel_date:null,project:'單銷',recycle_code:'synthetic-'+key,order_number:'synthetic-order-'+key
  }));
  const source={month:'2026-10',source_start:'2026-10-01',source_end:'2026-10-07',status_as_of_date:'2026-10-07',
    rule_id:Core.RULE_ID,source_sha256:'a'.repeat(64),complete_nine_stores:true,records};
  const value=Core.build(source,[
    staff('12345','台北萬大','業務代表(I)'),staff('12346','台北萬大','店長'),
    staff('12347','台北杭州南','代理店長'),staff('12348','台北三創','資深業務代表')
  ],Ref.reference(source));
  value.published_at='2026-10-08T09:00:00+08:00';
  value.people=value.people.map(({employee_key,...person})=>person);
  return value;
}
async function start(page,{person=0,supervisor=false,deny=false,viewport={width:1280,height:900}}={}){
  const errors=[],calls=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize(viewport);
  await page.clock.install({time:new Date('2026-10-08T09:00:00Z')});
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===new URL(PAGE).origin){
      if(url.pathname.endsWith('/tradein-progress.html'))return route.fulfill({contentType:'text/html; charset=utf-8',body:(await fs.readFile(path.resolve(__dirname,'./fixtures/tradein-private-progress.html'),'utf8')).replace('data-performance-release="pending"','data-performance-release="ready"')});
      return route.continue();
    }
    if(url.hostname!=='script.google.com')return route.abort('blockedbyclient');
    let payload;try{payload=route.request().postDataJSON();}catch{return route.abort('blockedbyclient');}
    calls.push(payload);
    if(payload.action!=='tradein_performance_read')return route.abort('blockedbyclient');
    const value=snapshot(),selected=value.people[person];
    const body=deny?{status:'error',message:'合成測試：此裝置的讀取已拒絕'}:{status:'ok',snapshot:payload.month==='2026-10'?{
      ...value,people:supervisor?value.people:[selected],stores:supervisor?value.stores:[],summary:supervisor?value.summary:null
    }:null,snapshotHash:'synthetic-version',access:{mode:supervisor?'supervisor':'self',
      maskedName:supervisor?'測＊督':selected.masked_name,role:supervisor?'督導':selected.original_role,
      allowedStores:supervisor?Core.STORES.map(store=>store[1]):[]},availableMonths:['2026-10']};
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(PAGE);
  await expect(page.locator('#loginForm')).toBeVisible();
  expect(calls).toEqual([]);
  await page.locator('#employeeId').fill('SYNTHETIC');
  await page.locator('#loginForm button').click();
  return {errors,calls};
}
for(const width of [1280,390])test(`${width}px retained self progress and actual PNG/XLSX downloads`,async({page},testInfo)=>{
  const {errors,calls}=await start(page,{viewport:{width,height:900}});
  await expect(page.locator('#self')).toContainText('本月尚缺 2 台');
  await expect(page.locator('#exportScope option')).toHaveText(['本人']);
  await expect(page.locator('#supervisorArea')).toBeHidden();
  await expect(page.locator('#maintenance')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`synthetic-progress-${width}.png`),fullPage:true});
  for(const [id,extension,signature] of [['downloadReminderPng','.png',Buffer.from([137,80,78,71])],['downloadReminderXlsx','.xlsx',Buffer.from('PK')]]){
    const waiting=page.waitForEvent('download');await page.locator('#'+id).click();const download=await waiting;
    expect(download.suggestedFilename()).toContain('2026-10_截至2026-10-07_本人');
    expect(download.suggestedFilename()).toMatch(new RegExp(extension.replace('.','\\.')+'$'));
    const bytes=await fs.readFile(await download.path());expect(bytes.subarray(0,signature.length)).toEqual(signature);
    expect(bytes.length).toBeGreaterThan(1000);expect(bytes.includes(Buffer.from('ZX00001'))).toBe(false);
    await download.saveAs(testInfo.outputPath('synthetic-export'+extension));
  }
  // Exercise the documented fallback without granting clipboard permissions.
  await page.evaluate(()=>{document.execCommand=()=>false;return Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('synthetic clipboard rejection');}}});});
  await page.locator('#copyReminder').click();await expect(page.locator('#exportFeedback')).toContainText('可在下方提醒內容手動選取複製');
  await expect(page.locator('#reminderText')).toHaveValue(/來源截止：2026-10-07/);
  expect(calls.every(call=>call.action==='tradein_performance_read')).toBe(true);expect(errors).toEqual([]);
});
for(const person of [1,2])test(`retained ${person===1?'manager':'acting manager'} keeps actuals without a target`,async({page})=>{
  const {errors}=await start(page,{person});
  await expect(page.locator('#self')).toContainText('保留實績，不設目標');
  await expect(page.locator('#self .self-value')).toContainText(person===1?'2':'1');
  await expect(page.locator('#reminderText')).toHaveValue(/不設目標/);
  await expect(page.locator('#exportScope option')).toHaveText(['本人']);expect(errors).toEqual([]);
});
test('retained supervisor projection, store filter and unknown-month clearing',async({page})=>{
  const {errors}=await start(page,{supervisor:true});
  await expect(page.locator('#actual-region')).toBeVisible();
  await expect(page.locator('#actual-store')).toBeHidden();
  await page.locator('[data-private-scope="region"]').press('ArrowRight');
  await expect(page.locator('[data-private-scope="store"]')).toBeFocused();
  await expect(page.locator('#actual-store')).toBeVisible();await expect(page.locator('#storeRows tr')).toHaveCount(9);
  await page.locator('[data-private-scope="person"]').click();
  await expect(page.locator('#actual-person')).toBeVisible();await expect(page.locator('#staffRows tr')).toHaveCount(4);
  await page.locator('#staffStore').selectOption('萬大');await expect(page.locator('#staffRows tr')).toHaveCount(2);
  await expect(page.locator('#exportScope option')).toHaveText(['目前明細範圍','全部授權店點']);
  await expect(page.locator('#reminderText')).toHaveValue(/萬大/);
  await page.locator('#periodMonth').fill('2026-09');await page.locator('#periodMonth').dispatchEvent('change');
  await expect(page.locator('#self')).toContainText('選定月份尚未有資料');
  await expect(page.locator('#exportPanel')).toBeHidden();await expect(page.locator('#staffRows tr')).toHaveCount(0);
  await expect(page.locator('#reminderText')).toHaveValue('');expect(errors).toEqual([]);
});
test('a rejected API read keeps private contents and exports unavailable',async({page})=>{
  const {errors}=await start(page,{deny:true});
  await expect(page.locator('#loginMessage')).toContainText('此裝置的讀取已拒絕');
  await expect(page.locator('#privateWorkspace')).toBeHidden();await expect(page.locator('#storeRows tr')).toHaveCount(0);
  await expect(page.locator('#reminderText')).toHaveValue('');expect(errors).toEqual([]);
});

// The public page runs beside the protected regression in the existing CI entry.
require('./helpers/tradein-public-ui-contract.cjs')();
