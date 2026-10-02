'use strict';
const {test,expect}=require('@playwright/test');
const crypto=require('node:crypto');
const {runtime}=require('./helpers/department-ops-integration-runtime.cjs');
const Scores=require('../department-scores-core.js'),F=require('./helpers/department-scores-synthetic.cjs'),XLSX=require('../assets/vendor/xlsx.full.min.js');
const BASE='http://127.0.0.1:8875/',PT='bei12b_patrol_session_token_v2',EMP='north12b_private_dashboard_employee_id',DEVICE='north12b_private_dashboard_device_id';

async function department(page){
  const b=runtime(),calls=[],errors=[];
  const token=b.post({action:'ptauth',key:'synthetic-passcode'}).token;
  b.post({action:'department_scores_publish',token,contract:Scores.CONTRACT,confirm:true,requestId:crypto.randomUUID(),expectedGeneration:0,selectedMonthKeys:['2026-07'],months:[F.month({month:7})],sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64)});
  let holdPublish=null;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===new URL(BASE).origin)return route.continue();
    if(url.hostname!=='script.google.com')return route.abort('blockedbyclient');
    const body=route.request().postDataJSON();calls.push(body);
    if(body.action==='department_scores_publish'&&holdPublish)await holdPublish;
    await route.fulfill({contentType:'application/json',body:JSON.stringify(b.post(body))}).catch(()=>{});
  });
  await page.clock.install({time:new Date()});
  await page.goto(BASE+'department-ops.html');
  await page.locator('#passcode').fill('synthetic-passcode');await page.locator('#authForm button').click();
  await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#scoreBody')).toContainText('合成店A1');
  return {b,calls,errors,hold:promise=>{holdPublish=promise;}};
}

test('department header exposes logout in both tabs and clears all private modules',async({page})=>{
  await page.setViewportSize({width:390,height:844});const {calls,errors}=await department(page);
  await expect(page.locator('#departmentLogout')).toBeVisible();await expect(page.locator('#departmentExpiry')).toContainText('到期');
  await page.locator('[data-tab="store"]').click();await expect(page.locator('.store-rule-card')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/session-controls/department-mobile.png'});
  page.once('dialog',d=>d.accept());await page.locator('#departmentLogout').click();
  await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#scoreBody')).toBeEmpty();await expect(page.locator('#peopleBody')).toBeEmpty();await expect(page.locator('.store-rule-card')).toHaveCount(0);
  expect(await page.evaluate(key=>sessionStorage.getItem(key),PT)).toBeNull();expect(calls.filter(c=>c.action==='ptlogout')).toHaveLength(1);expect(errors).toEqual([]);
});

test('five-minute warning uses the original deadline; refresh does not renew; expiry still locks',async({page})=>{
  const {b,calls}=await department(page);
  b.advance(42900);await page.clock.fastForward(42900000);
  await expect(page.locator('#departmentAccess')).toHaveAttribute('data-expiring','true');
  await expect(page.locator('#departmentWorkNotice')).toContainText('未保存的預覽需重新選檔');
  await page.reload();await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#departmentExpiry')).toContainText('5 分鐘');
  expect(calls.filter(c=>c.action==='ptauth'&&c.key)).toHaveLength(1);
  b.advance(300);await page.clock.fastForward(310000);
  await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#authPanel')).toBeVisible();await expect(page.locator('#scoreBody')).toBeEmpty();
});

test('unsaved file confirmation can cancel every existing department logout',async({page})=>{
  const {calls}=await department(page);await page.locator('[data-tab="store"]').click();
  const buffer=Buffer.from(XLSX.write(F.workbook(),{type:'buffer',bookType:'xlsx'}));
  await page.locator('#scoreFile').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
  page.on('dialog',d=>d.dismiss());
  for(const id of ['departmentLogout','store-rules-logout']) {
    await page.locator('#'+id).click();await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#scoreFile')).not.toHaveValue('');
  }
  await page.locator('[data-tab="gold"]').click();await page.locator('#monthlyLogout').click();await expect(page.locator('#workspace')).toBeVisible();
  expect(calls.filter(c=>c.action==='ptlogout')).toHaveLength(0);
});

test('saving blocks logout until a single write and readback finish',async({page})=>{
  const {calls,hold}=await department(page);await page.locator('[data-tab="store"]').click();
  const workbook=F.workbook();workbook.Sheets['7月'].G61={t:'n',v:99};workbook.Sheets['7月'].F61={t:'n',v:1};
  await page.locator('#scoreFile').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}))});
  await page.locator('#scoreImport').click();await page.locator('#scoreConfirm').check();
  let release;hold(new Promise(resolve=>{release=resolve;}));await page.locator('#scorePublish').click();
  await expect.poll(()=>calls.filter(c=>c.action==='department_scores_publish').length).toBe(1);
  await page.locator('#departmentLogout').click();await expect(page.locator('#departmentWorkNotice')).toContainText('正在處理或保存');await expect(page.locator('#workspace')).toBeVisible();
  expect(calls.filter(c=>c.action==='ptlogout')).toHaveLength(0);
  release();await expect(page.locator('#scoreMessage')).toContainText('讀回對帳完成');
  page.once('dialog',d=>d.accept());await page.locator('#departmentLogout').click();await expect(page.locator('#workspace')).toBeHidden();expect(calls.filter(c=>c.action==='department_scores_publish')).toHaveLength(1);
});

async function home(page,{failLogout=false,holdRead=false}={}){
  const calls=[],errors=[],now=Date.now(),expiresAt=Math.floor(now/1000)+43200;let release;
  const waiting=new Promise(resolve=>{release=resolve;});
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date(now)});
  await page.route('**/*',async route=>{
    if(new URL(route.request().url()).origin===new URL(BASE).origin)return route.continue();
    const body=route.request().postDataJSON();calls.push(body);
    if(body.action==='ptlogout'&&failLogout)return route.abort('failed');
    if(body.action==='read'&&holdRead)await waiting;
    const result=body.action==='ptauth'?{status:'ok',token:body.token,expiresAt,expiresIn:43200}:body.action==='read'||body.action==='ptdashboard'?{status:'error',message:'synthetic no current data'}:{status:'ok'};
    await route.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
  });
  await page.goto(BASE+'home.html');
  await page.evaluate(({PT,EMP,DEVICE})=>{
    sessionStorage.setItem(PT,'synthetic-invalid-outside-test');sessionStorage.setItem(EMP,'SYNTHETIC_EMPLOYEE');localStorage.setItem(EMP,'SYNTHETIC_LEGACY');localStorage.setItem('bei12b_kpi_emp','SYNTHETIC_KPI');localStorage.setItem(DEVICE,'SYNTHETIC_DEVICE');localStorage.setItem('bei12b_kpi_v1','synthetic-unsaved-input');sessionStorage.setItem('patrol-summary-safe-v1:synthetic','synthetic-cache');
  },{PT,EMP,DEVICE});
  await page.reload();await expect(page.locator('#portal-logout')).toBeVisible();await expect(page.locator('#portal-expiry-notice')).toContainText('到期');
  return {calls,errors,release};
}

test('homepage logout clears both identity stores and private cache, retains device and work inputs',async({page})=>{
  const {calls,errors}=await home(page);await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/session-controls/home-mobile.png'});
  page.once('dialog',d=>d.accept());await page.locator('#portal-logout').click();await expect(page.locator('#portal-session-note')).toContainText('已同步登出');
  const state=await page.evaluate(({PT,EMP,DEVICE})=>({pt:sessionStorage.getItem(PT),emp:sessionStorage.getItem(EMP),legacy:localStorage.getItem(EMP),kpi:localStorage.getItem('bei12b_kpi_emp'),cache:sessionStorage.getItem('patrol-summary-safe-v1:synthetic'),device:localStorage.getItem(DEVICE),work:localStorage.getItem('bei12b_kpi_v1')}),{PT,EMP,DEVICE});
  expect(state).toEqual({pt:null,emp:null,legacy:null,kpi:null,cache:null,device:'SYNTHETIC_DEVICE',work:'synthetic-unsaved-input'});
  expect(calls.filter(c=>c.action==='ptlogout')).toHaveLength(1);await expect(page.locator('#portal-expiry-notice')).toBeHidden();expect(errors).toEqual([]);
  await page.reload();await expect(page.locator('#portal-logout')).toBeHidden();
});

test('homepage logout reports revocation failure honestly and late reads cannot restore login',async({page})=>{
  const {release}=await home(page,{failLogout:true,holdRead:true});
  page.once('dialog',d=>d.accept());await page.locator('#portal-logout').click();release();
  await expect(page.locator('#portal-session-note')).toContainText('撤銷未確認');await expect(page.locator('#portal-logout')).toBeHidden();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),EMP)).toBeNull();
});
