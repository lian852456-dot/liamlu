'use strict';
const {test,expect}=require('@playwright/test');
const crypto=require('node:crypto');
const C=require('../department-scores-core.js');
const F=require('./helpers/department-scores-synthetic.cjs');
const {runtime}=require('./helpers/department-ops-integration-runtime.cjs');
const Gold=require('../department-gold-monthly-core.js');
const PAGE=new URL('department-ops.html',process.env.TEST_BASE_URL||'http://127.0.0.1:8767/').href;
const KEY='bei12b_patrol_session_token_v2';
const RULE='SYNTHETIC_COMBINED_RULE';
async function setup(page){
  const b=runtime(),calls=[],errors=[];let denyScores=false;
  const token=b.post({action:'ptauth',key:'synthetic-passcode'}).token;
  b.post({action:'department_scores_publish',token,contract:C.CONTRACT,confirm:true,requestId:crypto.randomUUID(),expectedGeneration:0,selectedMonthKeys:['2026-07'],months:[F.month({month:7})],sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64)});
  const month=Gold.validateMonth({schema:Gold.SCHEMA,monthKey:'2026-09',sheetName:'合成工作表',sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64),dateRange:{start:'2026-09-01',end:'2026-09-28',cutoff:'2026-09-28'},settlementStatus:'provisional',finalConfirmed:false,records:[{employeeId:'SYN001',employeeName:'合成同仁',region:'北一二B',storeCode:'SYN-B',store:'合成金牌店',role:'合成職稱',medal:12,sourceRow:4,sourceFields:[]}],validation:{sourceTotal:12}});
  const initial=b.post({action:'department_ops_read',token});
  const payload={action:'department_ops_publish',token,contract:'north12-monthly-write/v2',mode:'plan',operationId:crypto.randomUUID(),expectedRevision:initial.monthly.revision,months:[month]};
  const plan=b.post(payload);b.post({...payload,mode:'commit',confirm:true,planReceipt:plan.planReceipt});
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin===new URL(PAGE).origin)return route.continue();
    if(url.hostname!=='script.google.com')return route.abort('blockedbyclient');
    const body=req.postDataJSON();calls.push(body);let response;
    if(denyScores&&body.action.startsWith('department_scores_'))response={status:'error',message:'AUTH_SESSION_EXPIRED'};
    else response=b.post(body);
    await route.fulfill({contentType:'application/json',body:JSON.stringify(response)}).catch(()=>{});
  });
  await page.goto(PAGE);return {calls,errors,expireScores:()=>{denyScores=true;}};
}
async function login(page){
  await page.locator('#passcode').fill('synthetic-passcode');await page.locator('#authForm button').click();
  await expect(page.locator('#workspace')).toBeVisible();await page.locator('[data-tab="store"]').click();
  await expect(page.locator('#scoreBody')).toContainText('合成店A1');await expect(page.locator('.store-rule-card')).toContainText(RULE);
  await expect(page.locator('#peopleBody')).toContainText('SYN001');
}
test('combined anonymous entry requests no private actions',async({page})=>{
  const {calls,errors}=await setup(page);await expect(page.locator('#workspace')).toBeHidden();expect(calls).toEqual([]);expect(errors).toEqual([]);
});
test('combined store panel preserves both modules and logout clears them without observer errors',async({page})=>{
  const {calls,errors}=await setup(page);await login(page);
  await expect(page.locator('#storeRulesMount')).toHaveCount(1);await expect(page.locator('#scoreDashboard')).toBeVisible();
  expect(calls.filter(c=>c.action.endsWith('_publish'))).toEqual([]);
  await page.locator('#store-rules-logout').click();await expect(page.locator('#authPanel')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();expect(await page.content()).not.toContain(RULE);await expect(page.locator('#scoreBody')).toBeEmpty();
  await expect(page.locator('#peopleBody')).toBeEmpty();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),KEY)).toBeNull();expect(calls.some(c=>c.action==='ptlogout')).toBe(true);expect(errors).toEqual([]);
});
test('score authentication failure also clears the reminder module',async({page})=>{
  const {errors,expireScores}=await setup(page);await login(page);expireScores();await page.locator('#scoreRefresh').click();
  await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#scoreBody')).toBeEmpty();await expect(page.locator('.store-rule-card')).toHaveCount(0);
  await expect(page.locator('#peopleBody')).toBeEmpty();
  expect(await page.content()).not.toContain(RULE);expect(errors).toEqual([]);
});
test('gold logout clears all three modules and a new login reopens persisted data without files',async({page})=>{
  const {errors}=await setup(page);await login(page);await page.locator('[data-tab="gold"]').click();await page.locator('#monthlyLogout').click();
  await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#scoreBody')).toBeEmpty();await expect(page.locator('#peopleBody')).toBeEmpty();await expect(page.locator('.store-rule-card')).toHaveCount(0);
  await login(page);await expect(page.locator('#scoreFile')).toHaveValue('');await expect(page.locator('#goldFile')).toHaveValue('');expect(errors).toEqual([]);
});
