'use strict';
const {test,expect}=require('@playwright/test');
const Scores=require('../department-scores-core.js'),F=require('./helpers/department-scores-synthetic.cjs');
const PAGE=(process.env.TEST_BASE_URL||'http://127.0.0.1:8772/')+'department-ops.html';
const KEY='bei12b_patrol_session_token_v2';
const session=(exp=Math.floor(Date.now()/1000)+3600)=>Buffer.from(JSON.stringify({exp})).toString('base64url')+'.synthetic';
const saved={status:'ok',contract:Scores.CONTRACT,available:true,generation:1,months:[{month:F.month({month:7}),active:{revision:'synthetic'},history:[]}]};
async function setup(page,{token=session(),hold=false}={}){
 const calls=[],errors=[];let deny=false,release;
 const gate=new Promise(resolve=>{release=resolve;});
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,token})=>sessionStorage.setItem(key,token),{key:KEY,token});
 await page.route('**/*',async route=>{
  const host=new URL(route.request().url()).hostname;
  if(host==='127.0.0.1')return route.continue();
  if(host!=='script.google.com')return route.abort('blockedbyclient');
  const p=route.request().postDataJSON();calls.push(p);let result;
  if(p.action==='ptauth')result=deny?{status:'error',message:'AUTH_SESSION_REVOKED'}:{status:'ok',token:p.token,expiresAt:Math.floor(Date.now()/1000)+3600};
  else if(p.action==='department_ops_read')result={status:'ok',available:false};
  else if(p.action==='department_scores_read'){if(hold)await gate;result=deny?{status:'error',message:'AUTH_SESSION_REVOKED'}:saved;}
  else if(p.action==='department_store_rules_read')result={status:'ok',contract:'store-rule-reminders-v1',available:false,expiresAt:Math.floor(Date.now()/1000)+3600};
  else return route.abort('blockedbyclient');
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 await page.goto(PAGE);await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#goldMessage')).not.toContainText('正在');
 return {calls,errors,release,deny:()=>{deny=true;},scoreReads:()=>calls.filter(c=>c.action==='department_scores_read')};
}
for(const width of [390,1440])test(`gold cold open and return avoid hidden score reads at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:1000});const s=await setup(page);
 expect(s.calls.map(c=>c.action)).toEqual(['ptauth','department_ops_read']);
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await page.waitForTimeout(100);expect(s.scoreReads()).toHaveLength(0);
 await page.goto(new URL('home.html',PAGE).href);await page.goBack();
 await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#goldMessage')).not.toContainText('正在');expect(s.scoreReads()).toHaveLength(0);
 await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);expect(s.scoreReads()).toHaveLength(1);
 await expect(page.locator('#scoreFile')).toHaveValue('');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(s.errors).toEqual([]);
});
test('rapid tab switches coalesce the first score read; same-session return reuses it',async({page})=>{
 const s=await setup(page,{hold:true});await page.locator('[data-tab="store"]').click();await expect.poll(()=>s.scoreReads().length).toBe(1);
 await page.locator('[data-tab="gold"]').click();await page.locator('[data-tab="store"]').click();await page.locator('[data-tab="gold"]').click();await page.locator('[data-tab="store"]').click();expect(s.scoreReads()).toHaveLength(1);
 s.release();await expect(page.locator('#scoreBody tr')).toHaveCount(9);
 await page.locator('[data-tab="gold"]').click();await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);expect(s.scoreReads()).toHaveLength(1);
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>s.scoreReads().length).toBe(2);await expect(page.locator('#scoreMessage')).not.toContainText('正在');
 expect(s.calls.filter(c=>/publish|restore/.test(c.action))).toEqual([]);expect(s.errors).toEqual([]);
});
test('session replacement clears the previous view even while the score tab is hidden',async({page})=>{
 const s=await setup(page);await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);await page.locator('[data-tab="gold"]').click();
 const next=session(Math.floor(Date.now()/1000)+4000);
 await page.evaluate(({key,next})=>{sessionStorage.setItem(key,next);window.dispatchEvent(new Event('pageshow'));},{key:KEY,next});
 await expect(page.locator('#scoreBody')).toBeEmpty();expect(s.scoreReads()).toHaveLength(1);
 await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);expect(s.scoreReads()).toHaveLength(2);expect(s.scoreReads()[1].token).toBe(next);
 expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);expect(s.errors).toEqual([]);
});
test('a pending score response cannot repopulate the view after logout',async({page})=>{
 const s=await setup(page,{hold:true});await page.locator('[data-tab="store"]').click();await expect.poll(()=>s.scoreReads().length).toBe(1);
 await page.evaluate(()=>window.dispatchEvent(new Event('department-session-cleared')));s.release();
 await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#scoreMessage')).not.toContainText('正在');await expect(page.locator('#scoreBody')).toBeEmpty();await expect(page.locator('#scoreSummary')).toBeEmpty();expect(s.errors).toEqual([]);
});
test('server revocation on the visible return clears scores and locks the workspace',async({page})=>{
 const s=await setup(page);await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);s.deny();
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#scoreBody')).toBeEmpty();expect(s.scoreReads()).toHaveLength(2);expect(s.errors).toEqual([]);
});
test('gold return checks revocation with auth only and coalesces repeated return events',async({page})=>{
 const s=await setup(page);
 await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>s.calls.filter(c=>c.action==='ptauth').length).toBe(2);expect(s.scoreReads()).toHaveLength(0);
 // The request is counted before its response settles; end that return before revoking it.
 await page.waitForTimeout(100);
 s.deny();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#peopleBody')).toBeEmpty();expect(s.scoreReads()).toHaveLength(0);expect(s.errors).toEqual([]);
});
test('session expiry locks the gold view without starting a hidden score read',async({page})=>{
 await page.clock.install();const s=await setup(page,{token:session(Math.floor(Date.now()/1000)+5)});await page.clock.runFor(11000);
 await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#scoreBody')).toBeEmpty();expect(s.scoreReads()).toHaveLength(0);expect(s.errors).toEqual([]);
});
