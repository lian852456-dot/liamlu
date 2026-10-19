'use strict';
module.exports=function registerSharingChecks(){
'use strict';
const {test,expect}=require('@playwright/test'),fs=require('node:fs/promises'),path=require('node:path');
const {fixture}=require('./tradein-sharing-runtime.cjs');
const {createRuntime,parsed,OPERATOR}=require('./tradein-synthetic-runtime.cjs');
async function start(page,width,{lostResponse=false}={}){
  const share=fixture(),progress=createRuntime(),source=parsed();progress.configure(source);const plan=progress.a.tradeinPerformancePreview({source,employeeId:OPERATOR,adminSecret:progress.secret}),published=progress.a.tradeinPerformancePublish({source,...plan,employeeId:OPERATOR,adminSecret:progress.secret});progress.a.tradeinPerformancePublicPublish({employeeId:OPERATOR,adminSecret:progress.secret,month:source.month,sourceHash:source.source_sha256,expectedActiveHash:published.snapshotHash});
  const calls=[],errors=[];let lost=lostResponse;page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});await page.clock.install({time:new Date('2026-10-19T08:00:00Z')});
  await page.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.hostname==='127.0.0.1'){
      const root=path.resolve(__dirname,'../..'),file=path.resolve(root,'.'+u.pathname);if(path.relative(root,file).startsWith('..'))return route.abort();
      const contentType={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)];if(!contentType)return route.abort();return route.fulfill({contentType,body:await fs.readFile(file)});
    }
    if(u.hostname!=='script.google.com')return route.abort();const raw=route.request().postData();let p;try{p=JSON.parse(raw);}catch{p=JSON.parse(new URLSearchParams(raw).get('payload'));}calls.push(p);
    const body=p.action.startsWith('tradein_sharing_public_')?share.invoke(p):progress.dispatch(p);
    if(body.snapshot)body.snapshot.people=body.snapshot.people.map(person=>({...person,recovered_days:person.actual_units>0?[{date:'2026-10-02',actual_units:person.actual_units,recovered_models:person.recovered_models??[]}]:[]}));
    if(p.action==='tradein_sharing_public_create'&&lost){lost=false;return route.abort();}
    if(u.searchParams.get('transport')==='iframe'){const message=JSON.stringify({type:'north12b-gas-response-v1',requestId:u.searchParams.get('requestId'),body}).replace(/</g,'\\u003c');return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+message+',"*")</script>'});}
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:4173/tradein-progress.html');await expect(page.locator('#stats')).toContainText('159 台');await page.getByRole('tab',{name:'同仁分享',exact:true}).click();await expect(page.locator('#shareMessage')).toContainText('已讀取');return {share,calls,errors};
}
async function fill(page){await page.locator('#shareEditor summary').click();await page.locator('#shareInputStore').selectOption('永吉');await page.locator('#shareInputAuthor').fill('合成同仁');await page.locator('#shareScenario').fill('合成案例，不含真實個資');await page.locator('#shareApproach').fill('合成推薦話術');await page.locator('#shareOutcome').fill('合成改善心得');await page.locator('#shareConsent').check();}
for(const width of [1280,390,320])test(`${width}px anonymous create/read/image and independent sharing dates`,async({page},info)=>{
  const {calls,errors}=await start(page,width);const month=await page.locator('#periodMonth').inputValue(),date=await page.locator('#recoveryDate').inputValue(),count=calls.filter(p=>p.action==='tradein_performance_public_read').length;
  await expect(page.locator('#shareList')).toContainText('目前沒有符合');
  await fill(page);await expect(page.getByText('姓名（自填未驗證）',{exact:true})).toBeVisible();expect(await page.locator('#shareConsent').evaluate(e=>Math.round(e.getBoundingClientRect().width))).toBe(20);await page.locator('#shareImage').setInputFiles({name:'SYNTHETIC.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aKkAAAAASUVORK5CYII=','base64')});
  await page.locator('#shareSave').click();await expect(page.locator('#shareMessage')).toContainText('分享已儲存');await expect(page.locator('#shareList')).toContainText('合成同仁（自填未驗證）');await expect(page.locator('#shareList')).not.toContainText('編輯');await page.getByRole('button',{name:'查看圖片',exact:true}).click();await expect(page.locator('#shareList img')).toBeVisible();
  const created=calls.find(p=>p.action==='tradein_sharing_public_create');expect(created.consent).toBe(true);expect(created.token).toBeUndefined();expect(created.owner).toBeUndefined();expect(created.id).toBeUndefined();
  await page.locator('#shareView').selectOption('range');await expect(page.locator('#shareMessage')).toContainText('2026-10-01 至 2026-10-31');expect(await page.locator('#periodMonth').inputValue()).toBe(month);expect(await page.locator('#recoveryDate').inputValue()).toBe(date);expect(calls.filter(p=>p.action==='tradein_performance_public_read').length).toBe(count);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#shareEditor summary').click();await page.screenshot({path:info.outputPath('SYNTHETIC-sharing-'+width+'.png'),fullPage:true});expect(errors).toEqual([]);
});
test('browser lost response first reads receipt and does not create a duplicate',async({page})=>{
  const {share,calls}=await start(page,390,{lostResponse:true});await fill(page);await page.locator('#shareSave').click();await expect(page.locator('#shareMessage')).toContainText('Failed to fetch');await page.locator('#shareSave').click();await expect(page.locator('#shareMessage')).toContainText('先按「讀取分享」');expect(calls.filter(p=>p.action.endsWith('_create'))).toHaveLength(1);
  await page.locator('#shareRefresh').click();await expect(page.locator('#shareList')).toContainText('合成同仁');expect(calls.some(p=>p.action.endsWith('_receipt'))).toBe(true);expect(calls.filter(p=>p.action.endsWith('_create'))).toHaveLength(1);expect(share.state().cases).toHaveLength(1);
});
test('browser consent and private login boundaries, range validation and text-only rendering',async({page})=>{
  const {calls}=await start(page,390);await fill(page);await page.locator('#shareConsent').uncheck();await page.locator('#shareSave').click();expect(calls.filter(p=>p.action.endsWith('_create'))).toHaveLength(0);
  await page.locator('#sharePrivate').check();await expect(page.locator('#shareMessage')).toContainText('請先登入');expect(calls.some(p=>p.action.startsWith('employee_'))).toBe(false);await page.locator('#sharePrivate').uncheck();
  await page.locator('#shareView').selectOption('range');await page.locator('#shareStart').fill('2026-01-01');await page.locator('#shareEnd').fill('2026-12-31');await expect(page.locator('#shareMessage')).toContainText('93');
});

};
