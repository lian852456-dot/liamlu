'use strict';
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const core=require('../platform-usage-core.js');
const {fixture,NOW}=require('./helpers/platform-usage-fixture.cjs');
const url=process.env.TEST_BASE_URL?new URL('platform-usage.html',process.env.TEST_BASE_URL).href:'file://'+path.resolve('platform-usage.html');
const report=()=>{const f=fixture();return core.aggregate(f.events,f.roster,f.options);};
async function setup(page,{data=report(),delay=0,deny=false}={}) {
  await page.clock.install({time:new Date(NOW)});
  await page.addInitScript(({data,delay,deny})=>{
    window.__usageCalls=[];window.__deny=deny;
    window.PlatformUsageAdapter={environment:'synthetic',read:async(filters,{signal})=>{
      window.__usageCalls.push(filters);
      await new Promise(resolve=>setTimeout(resolve,window.__delay??delay));
      if(signal.aborted)throw Error('ABORTED');
      if(window.__deny)return {status:'error',code:'USAGE_DENIED'};
      const r=structuredClone(data);r.filters=filters;return {status:'ok',report:r,expiresAt:window.__expiresAt||Date.now()+1800000};
    }};
  },{data,delay,deny});
}
async function open(page){await page.goto(url);await page.clock.runFor(200);}
test('unconfigured page denies by default and makes no network requests or storage writes',async({page})=>{
  const external=[];page.on('request',r=>{if(/^https?:/.test(r.url())&&new URL(r.url()).origin!==new URL(url).origin)external.push(r.url());});
  await open(page);await expect(page.locator('#dau')).toHaveText('—');await expect(page.locator('#status')).toContainText('尚未配置');
  await page.getByRole('button',{name:'更新',exact:true}).click();await expect(page.locator('#status')).toContainText('沒有正式使用紀錄');
  expect(external).toEqual([]);expect(await page.evaluate(()=>localStorage.length+sessionStorage.length)).toBe(0);
});
for(const width of [1440,390,320])test(`${width}px approved layout, readable cards, filters and no horizontal page overflow`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:width>700?1250:844});await setup(page);await open(page);
  await expect(page.locator('#mode')).toContainText('合成資料預覽');await expect(page.locator('#dau')).toHaveText('2');await expect(page.locator('#wau')).toHaveText('3');await expect(page.locator('#rate')).toHaveText('60%');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#people-details summary').first().click();await expect(page.locator('.person')).toHaveCount(5);
  await page.locator('.person').last().locator('summary').click();await expect(page.locator('.person').last()).toContainText('本期沒有觀測到使用');
  if(width!==320)await page.screenshot({path:testInfo.outputPath(`platform-usage-${width}-synthetic.png`),fullPage:true});
});
test('locked state screenshot matches approved empty-state semantics',async({page},testInfo)=>{
  await page.setViewportSize({width:1600,height:1250});await open(page);await expect(page.locator('#mode')).toHaveText('尚未啟用收集');
  await page.screenshot({path:testInfo.outputPath('platform-usage-locked.png'),fullPage:true});
});
test('filter requests carry only date/store/feature, and clear old data while waiting',async({page})=>{
  await setup(page);await open(page);await page.evaluate(()=>window.__delay=2000);
  await page.locator('#store').selectOption('酒泉');await page.clock.runFor(200);await expect(page.locator('#dau')).toHaveText('—');
  await page.clock.runFor(2100);await expect(page.locator('#dau')).toHaveText('2');
  expect(await page.evaluate(()=>window.__usageCalls.at(-1))).toEqual({start:'2026-10-17',end:'2026-10-23',store:'酒泉',feature:'all'});
  await page.locator('#feature').selectOption('kpi');await page.clock.runFor(2300);expect(await page.evaluate(()=>window.__usageCalls.at(-1).feature)).toBe('kpi');
});
test('custom date reversed or >30 days remains terminal error and does not query',async({page})=>{
  await setup(page);await open(page);await page.locator('#period').selectOption('custom');await page.clock.runFor(300);
  const n=await page.evaluate(()=>window.__usageCalls.length);await page.locator('#start').fill('2026-09-01');await page.clock.runFor(200);
  await expect(page.locator('#status')).toContainText('最多 30 天');expect(await page.evaluate(()=>window.__usageCalls.length)).toBe(n);
  await expect(page.locator('#refresh')).toBeEnabled();
});
test('rapid repeated refresh and filter requests never allow an older result to repaint',async({page})=>{
  await setup(page);await open(page);await page.evaluate(()=>window.__delay=2000);
  await page.locator('#refresh').click();await expect(page.locator('#refresh')).toBeDisabled();
  await page.locator('#store').selectOption('三創');await page.clock.runFor(200);await page.evaluate(()=>window.__deny=true);
  await page.clock.runFor(2500);await expect(page.locator('#dau')).toHaveText('—');await expect(page.locator('#status')).toContainText('權限未通過');
});
test('pagehide, revocation and BFCache resume clear private DOM then revalidate',async({page})=>{
  await setup(page);await open(page);await expect(page.locator('#dau')).toHaveText('2');
  await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await expect(page.locator('#dau')).toHaveText('—');await expect(page.locator('#people')).not.toContainText('合成帳號');
  await page.evaluate(()=>{window.__deny=true;dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.clock.runFor(200);
  await expect(page.locator('#status')).toContainText('權限未通過');await page.evaluate(()=>{window.__deny=false;dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});await page.clock.runFor(200);
  await expect(page.locator('#dau')).toHaveText('2');await page.evaluate(()=>dispatchEvent(new Event('platform-usage-revoked')));await expect(page.locator('#dau')).toHaveText('—');
});
test('logout during delayed query prevents late results restoring data',async({page})=>{
  await setup(page,{delay:2000});await open(page);await page.evaluate(()=>dispatchEvent(new StorageEvent('storage',{key:'north12b_portal_logout_event_v1'})));
  await page.clock.runFor(2500);await expect(page.locator('#dau')).toHaveText('—');await expect(page.locator('#people')).not.toContainText('合成帳號');
});
test('server text is rendered literally without HTML execution, and unknown metrics are not zero',async({page})=>{
  const data=report();data.people[0].actor='<img src=x onerror=alert(1)>';data.summary.usageRate=null;data.summary.eligible=null;data.features[0].active=null;
  await setup(page,{data});await open(page);await expect(page.locator('#rate')).toHaveText('—');await expect(page.locator('#denominator')).toContainText('名冊待確認');
  expect(await page.locator('#people img').count()).toBe(0);await expect(page.locator('#people')).toContainText('<img');
});
test('load failure clears numeric data, allows retry and has no export control',async({page})=>{
  await setup(page,{deny:true});await open(page);await expect(page.locator('#dau')).toHaveText('—');await expect(page.locator('#refresh')).toBeEnabled();
  await page.evaluate(()=>window.__deny=false);await page.locator('#refresh').click();await page.clock.runFor(200);await expect(page.locator('#dau')).toHaveText('2');
  expect(await page.locator('button,a').allTextContents()).not.toContain('匯出');
});
test('expired owner view clears and a fresh query cannot reuse expired permission',async({page})=>{
  await setup(page);await open(page);await page.evaluate(()=>window.__expiresAt=Date.now()+1000);
  await page.locator('#refresh').click();await page.clock.runFor(200);await expect(page.locator('#dau')).toHaveText('2');
  await page.clock.runFor(1200);await expect(page.locator('#dau')).toHaveText('—');await expect(page.locator('#status')).toContainText('權限未通過');
});
