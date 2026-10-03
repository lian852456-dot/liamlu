'use strict';
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const PAGE=process.env.TEST_BASE_URL ? new URL('department-ops.html',process.env.TEST_BASE_URL).href : 'file://'+path.resolve(__dirname,'../department-ops.html');
const SESSION='bei12b_patrol_session_token_v2';
const TOKEN='SYNTHETIC_REMINDER_SESSION';
const fixture=() => ({status:'ok',available:true,contract:'store-rule-reminders-v1',expiresAt:Math.floor(Date.now()/1000)+900,document:{contract:'store-rule-reminders-v1',scope:'store-daily-reminders',revision:'synthetic-v1',context:'SYNTHETIC_PRIVATE_CONTEXT',rules:[{id:'synthetic-a',category:'合成分類',title:'合成提醒 A',instruction:'SYNTHETIC_PRIVATE_RULE_ALPHA',frequency:'合成頻率',audience:'合成對象',exceptions:['合成例外'],sources:[{shortName:'合成來源',pages:[1,2]}]}]}});
async function setup(page,reply=async () => fixture()) {
  const calls=[],errors=[];
  page.on('pageerror',error => errors.push(error.message));
  await page.route('**/*',async route => {
    const req=route.request(),url=new URL(req.url());
    if(url.protocol==='file:' || url.origin===new URL(PAGE).origin)return route.continue();
    let body;try{body=req.postDataJSON();}catch{}
    if(url.hostname!=='script.google.com' || !body)return route.abort('blockedbyclient');
    calls.push(body);
    let result;
    if(body.action==='ptauth')result={status:'ok',token:TOKEN,expiresAt:Math.floor(Date.now()/1000)+900};
    else if(body.action==='department_ops_read')result={status:'ok',available:false};
    else if(body.action==='department_store_rules_read')result=await reply(body);
    else if(body.action==='ptlogout')result={status:'ok'};
    else return route.abort('blockedbyclient');
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
  });
  await page.goto(PAGE);
  return {calls,errors};
}
async function login(page){await page.locator('#passcode').fill('SYNTHETIC_PASSCODE');await page.locator('#authForm button').click();await expect(page.locator('#workspace')).toBeVisible();await page.locator('[data-tab="store"]').click();}

test('anonymous page never requests or renders rule contents',async({page})=>{
  const {calls,errors}=await setup(page);
  await expect(page.locator('#workspace')).toBeHidden();
  expect(calls).toEqual([]);
  expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_RULE_ALPHA');
  expect(errors).toEqual([]);
});
for(const width of [390,1440])test(`legal login renders reminder metadata and no overflow at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  const {calls,errors}=await setup(page);
  await login(page);
  await expect(page.locator('.store-rule-card')).toHaveCount(1);
  await expect(page.locator('.store-rule-card')).toBeHidden();
  expect(await page.locator('#storeRulesMount').evaluate(node => node === node.parentElement.lastElementChild)).toBe(true);
  await page.locator('.store-rules-toggle').click();
  await expect(page.locator('.store-rule-card')).toBeVisible();
  await page.locator('.store-rules-toggle').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.store-rule-card')).toBeHidden();
  await page.keyboard.press('Space');
  await expect(page.locator('.store-rule-card')).toBeVisible();
  await expect(page.locator('.store-rule-card')).toContainText('SYNTHETIC_PRIVATE_RULE_ALPHA');
  await expect(page.locator('.store-rule-card')).toContainText('合成來源｜第 1、2 頁');
  await expect(page.locator('.store-rule-card')).toContainText('合成頻率');
  await expect(page.locator('.store-rule-card')).toContainText('合成對象');
  await expect(page.locator('.store-rule-card')).toContainText('合成例外');
  await expect(page.locator('.store-rule-notice')).toHaveText('規則提醒，尚未提供本期執行資料');
  expect(calls.filter(call=>call.action==='department_store_rules_read')).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const storage=await page.evaluate(()=>({local:JSON.stringify(localStorage),session:JSON.stringify(sessionStorage)}));
  expect(JSON.stringify(storage)).not.toContain('SYNTHETIC_PRIVATE_RULE_ALPHA');
  expect(errors).toEqual([]);
  await page.screenshot({path:path.resolve(__dirname,`../test-results/store-rules-${width}.png`),fullPage:true});
});
test('tab changes remove private rendering and reread when returning',async({page})=>{
  const {calls}=await setup(page);await login(page);
  await expect(page.locator('.store-rule-card')).toHaveCount(1);
  await page.locator('[data-tab="gold"]').click();
  await expect(page.locator('.store-rule-card')).toHaveCount(0);
  expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_RULE_ALPHA');
  await expect(page.locator('#goldPanel')).toBeVisible();
  await page.locator('[data-tab="store"]').click();
  await expect(page.locator('.store-rule-card')).toHaveCount(1);
  expect(calls.filter(call=>call.action==='department_store_rules_read')).toHaveLength(2);
});
test('logout clears authenticated DOM and session, then revokes current token',async({page})=>{
  const {calls}=await setup(page);await login(page);
  await expect(page.locator('.store-rule-card')).toHaveCount(1);
  await page.locator('.store-rules-toggle').click();
  await page.locator('#store-rules-logout').click();
  await expect(page.locator('#authPanel')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
  expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_RULE_ALPHA');
  expect(await page.evaluate(key=>sessionStorage.getItem(key),SESSION)).toBeNull();
  expect(calls.some(call=>call.action==='ptlogout'&&call.token===TOKEN)).toBe(true);
});
test('late private response cannot repopulate a hidden tab',async({page})=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const {calls}=await setup(page,async()=>{await pending;return fixture();});
  await login(page);await expect.poll(()=>calls.some(call=>call.action==='department_store_rules_read')).toBe(true);
  await page.locator('[data-tab="gold"]').click();release();
  await expect(page.locator('.store-rule-card')).toHaveCount(0);
  expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_RULE_ALPHA');
});
test('backgrounding clears contents and returning revalidates',async({page})=>{
  const {calls}=await setup(page);await login(page);
  await expect(page.locator('.store-rule-card')).toHaveCount(1);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('.store-rule-card')).toHaveCount(0);
  expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_RULE_ALPHA');
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('.store-rule-card')).toHaveCount(1);
  expect(calls.filter(call=>call.action==='department_store_rules_read')).toHaveLength(2);
});
test('session expiration removes already-rendered private contents',async({page})=>{
  await setup(page,async()=>{const result=fixture();result.expiresAt=Math.floor(Date.now()/1000)+2;return result;});
  await login(page);
  await expect(page.locator('.store-rule-card')).toHaveCount(1);
  await expect(page.locator('.store-rule-card')).toHaveCount(0,{timeout:4000});
  await page.locator('.store-rules-toggle').click();
  await expect(page.locator('#store-rules-status')).toContainText('登入已到期');
  expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_RULE_ALPHA');
});
for(const mode of ['expired','malformed','unavailable','auth-failure','html'])test(`${mode} fails closed without performance or stale contents`,async({page})=>{
  await setup(page,async()=>{
    const result=fixture();
    if(mode==='expired')result.expiresAt=Math.floor(Date.now()/1000)-1;
    if(mode==='malformed')result.document.rules[0].score=100;
    if(mode==='unavailable'){result.available=false;delete result.document;}
    if(mode==='auth-failure')return {status:'unauthorized',reason:'AUTH_SESSION_EXPIRED'};
    if(mode==='html')result.document.rules[0].instruction='<img src=x onerror=alert(1)>SYNTHETIC_PRIVATE_RULE_ALPHA';
    return result;
  });await login(page);
  if(mode==='html'){
    await expect(page.locator('.store-rule-card')).toContainText('<img src=x onerror=alert(1)>');
    await expect(page.locator('.store-rule-card img')).toHaveCount(0);
  }else{
    await expect(page.locator('#store-rules-status')).not.toContainText('正在驗證');
    await expect(page.locator('.store-rule-card')).toHaveCount(0);
    expect(await page.content()).not.toContain('SYNTHETIC_PRIVATE_RULE_ALPHA');
  }
});
