const {test,expect}=require('@playwright/test');
const {createRuntime,parsed,hash,OPERATOR}=require('./helpers/tradein-synthetic-runtime.cjs');
const BASE=process.env.TEST_BASE_URL;
for(const width of [1280,390])test(width+'px: reviewed support stays in the selling store for monthly/daily views and in the original employee',async({page},info)=>{
 const r=createRuntime(),source=parsed();source.records[0].store_code='DNB10146';source.records[0].trade_date='2026-10-03';
 const row=source.records[0];
 r.configure(source,{support_approvals:[{transaction_key:hash(JSON.stringify([row.store_code,row.trade_date,row.order_number.trim(),row.recycle_code.trim()])),employee_key:'ZX00001',home_store:'萬大',store:'杭州南',trade_date:'2026-10-03',review_status:'verified'}]});
 const auth={source,employeeId:OPERATOR,adminSecret:r.secret,month:source.month,sourceHash:source.source_sha256};
 const preview=r.a.tradeinPerformancePreview(auth),result=r.a.tradeinPerformancePublish({...auth,...preview});
 r.a.tradeinPerformancePublicPublish({...auth,expectedActiveHash:result.snapshotHash});
 const calls=[];
 await page.clock.install({time:new Date('2026-10-09T12:00:00Z')});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===new URL(BASE).origin)return route.continue();
  if(url.hostname!=='script.google.com')return route.abort();
  const raw=route.request().postData();let payload;try{payload=JSON.parse(raw);}catch{payload=JSON.parse(new URLSearchParams(raw).get('payload'));}
  calls.push(payload.action);const body=r.dispatch(payload);
  if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body})+',"*")</script>'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.setViewportSize({width,height:950});await page.goto(BASE+'tradein-progress.html');
 await expect(page.locator('#stats')).toContainText('4 台');
 await page.locator('#scope-store').click();
 await expect(page.locator('#storeRows tr').filter({hasText:'杭州南'})).toContainText('2 台');
 await expect(page.locator('#storeRows tr').filter({hasText:'萬大'})).toContainText('2 台');
 await page.locator('#recoveryDate').fill('2026-10-03');
 await expect(page.locator('#storeRows tr').filter({hasText:'杭州南'})).toContainText('1 台');
 await expect(page.locator('#storeRows tr').filter({hasText:'萬大'})).toContainText('0 台');
 await page.screenshot({path:info.outputPath('SYNTHETIC-reviewed-support-daily-'+width+'.png'),fullPage:true});
 await page.locator('#scope-person').click();
 const person=page.locator('#staffRows tr').filter({hasText:'合＊5'});
 await expect(person).toContainText('萬大');await expect(person).toContainText('1 台');
 await page.locator('#clearRecoveryDate').click();await expect(person).toContainText('1 台');
 await page.locator('#downloadReminderXlsx').click();
 expect(calls.every(action=>action==='tradein_performance_public_read')).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
