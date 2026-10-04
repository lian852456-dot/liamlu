const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const {install}=require('./fixtures/daily-report-summary-synthetic.cjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8774/';
test.beforeEach(async({page})=>{
 page.__errors=[];page.__external=[];
 page.on('pageerror',error=>page.__errors.push(error.message));
 page.on('request',request=>{if(new URL(request.url()).origin!==new URL(base).origin)page.__external.push(request.url());});
 await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
 await page.addInitScript(install);
 await page.goto(base+'index.html',{waitUntil:'load'});
 await page.locator('.tab-btn').filter({hasText:'彙整大盤'}).click();
 await expect(page.locator('#sumCoverage')).toHaveText('已回報 7 / 9 店');
});
test.afterEach(async({page})=>{expect(page.__errors).toEqual([]);expect(page.__external).toEqual([]);expect(await page.evaluate(()=>window.__summaryCalls.some(p=>/write|send|publish/.test(p.action)))).toBe(false);});
const totals=page=>page.locator('[data-summary-total]').allTextContents();
const noOverflow=async page=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
const group=(page,name)=>page.locator('#panel-summary').getByRole('button',{name,exact:true}).click();
for(const width of [390,1440])test.describe(width+'px actual controller',()=>{
 test.use({viewport:{width,height:width===390?844:1000}});
 test('strict raw projection, 0/null/invalid values, nine stores and 32 original fields',async({page})=>{
  await expect(page.locator('[data-summary-store]')).toHaveCount(9);
  await expect(page.locator('[data-summary-store="大稻埕"]')).toContainText('未回報');
  await expect(page.locator('[data-summary-store="杭州南"]')).toContainText('來源未取得');
  await expect(page.locator('[data-summary-store="通化"] .sum-metric').first()).toContainText('0');
  await expect(page.locator('[data-summary-store="六張犁"] .sum-metrics')).toContainText('欄位未取得');
  await expect(page.locator('[data-summary-store="復興南"] .sum-metrics')).toContainText('—');
  await expect(page.locator('#sumCoverage')).not.toContainText('完成');
  await group(page,'保險搭售');await expect(page.locator('#summaryCards')).toContainText('22 / 108 · 20.4%');await expect(page.locator('#summaryCards')).toContainText('涵蓋 5 / 9 店');
  await expect(page.locator('[data-summary-store="通化"]')).toContainText('無適用案件');
  await page.locator('#sumComplete>summary').click();expect(await page.locator('#sumFullTable thead th').count()).toBe(33);expect(await page.locator('#sumFullTable tbody tr').count()).toBe(10);await noOverflow(page);
 });
 test('filters clearly scope aggregation; switch groups and segments back restores exact sums',async({page})=>{
  const original=await totals(page);
  await page.locator('#sumStore').selectOption('酒泉');await expect(page.locator('#sumTitle')).toHaveText('篩選範圍摘要');expect(await totals(page)).toEqual(['1','1','0.5','2','1']);
  await page.locator('#sumStore').selectOption('all');await page.locator('#sumStatus').selectOption('attention');await expect(page.locator('#sumTitle')).toHaveText('篩選範圍摘要');
  await page.locator('#sumStatus').selectOption('all');for(const name of ['管理重點','保險搭售','核心業績'])await group(page,name);expect(await totals(page)).toEqual(original);
  await page.locator('#sumSeg21').click();await expect(page.locator('#summaryDateLabel')).toContainText('21:00');await expect(page.locator('#sumCoverage')).toContainText('7 / 9');expect(await totals(page)).not.toEqual(original);
  await page.locator('#sumSeg16').click();await expect(page.locator('#summaryDateLabel')).toContainText('16:00');await expect.poll(()=>totals(page)).toEqual(original);await noOverflow(page);
 });
 test('date/segment late day responses cannot replace newer context',async({page})=>{
  await page.evaluate(()=>{window.__holdRead=true;});await page.locator('#sumSeg21').click();await expect(page.locator('#summaryCards')).toContainText('正在讀取');
  await page.locator('#sumDate').fill('2099-10-03');await page.waitForFunction(()=>window.__heldReads.length===2);
  await page.evaluate(()=>{window.__heldReads[1].release();});await expect(page.locator('#summaryDateLabel')).toContainText('2099-10-03 21:00');await expect(page.locator('#sumCoverage')).toContainText('0 / 9');
  await page.evaluate(()=>{window.__heldReads[0].release();});await expect(page.locator('#summaryDateLabel')).toContainText('2099-10-03 21:00');expect(await totals(page)).toEqual(['—','—','—','—','—']);
 });
 test('failed or malformed reread clears old values and local shadows; empty success is unreported',async({page})=>{
  await page.evaluate(()=>{localStorage.setItem(shadowKey('2099-10-02',16),JSON.stringify({酒泉:{date:'2099-10-02',seg:16,store:'酒泉',aq999:9000}}));window.__readMode='error';});
  await page.locator('#panel-summary>.sum-toolbar [data-summary-retry]').click();await expect(page.locator('#summaryCards')).toContainText('回報資料未取得');await expect(page.locator('[data-summary-total]')).toHaveCount(0);await expect(page.locator('#sumCoverage')).toHaveText('填報狀態未確認');
  await page.evaluate(()=>window.__readMode='malformed');await page.locator('#panel-summary>.sum-toolbar [data-summary-retry]').click();await expect(page.locator('#summaryCards')).toContainText('回報資料未取得');
  await page.evaluate(()=>window.__readMode='empty');await page.locator('#panel-summary>.sum-toolbar [data-summary-retry]').click();await expect(page.locator('#sumCoverage')).toHaveText('已回報 0 / 9 店');expect(await totals(page)).toEqual(['—','—','—','—','—']);
  await page.evaluate(()=>window.__readMode='ok');await page.locator('#panel-summary>.sum-toolbar [data-summary-retry]').click();await expect(page.locator('#sumCoverage')).toHaveText('已回報 7 / 9 店');expect((await totals(page))[0]).not.toBe('9000');await noOverflow(page);
 });
 test('personal authorization errors do not reveal local/cache data; late personal responses stay contextual',async({page})=>{
  await group(page,'零報與請益');await page.locator('#sum-detail-0>summary').click();await page.locator('#sum-private-0>summary').click();await expect(page.locator('#sum-private-0')).toContainText('合成長姓名');
  await page.evaluate(()=>{window.__preadMode='error';});await page.locator('#panel-summary>.sum-toolbar [data-summary-retry]').click();await expect(page.locator('#sum-private-0')).toContainText('個人明細未取得或權限失效');await expect(page.locator('#sum-private-0')).not.toContainText('合成長姓名');
  await page.evaluate(()=>{window.__preadMode='ok';window.__holdPersonal=true;});await page.locator('#sumSeg21').click();await page.waitForFunction(()=>window.__heldPersonal.length===1);
  await page.locator('#sumDate').fill('2099-10-03');await page.waitForFunction(()=>window.__heldPersonal.length===2);
  await page.evaluate(()=>window.__heldPersonal[1].release());await expect(page.locator('#summaryDateLabel')).toContainText('2099-10-03');await page.evaluate(()=>window.__heldPersonal[0].release());await expect(page.locator('#summaryDateLabel')).toContainText('2099-10-03');await noOverflow(page);
 });
 test('logout boundary invalidates day and personal responses before late completion',async({page})=>{
  await page.evaluate(()=>window.__holdRead=true);await page.locator('#sumSeg21').click();await page.waitForFunction(()=>window.__heldReads.length===1);
  await page.evaluate(()=>window.dispatchEvent(new Event('portal-before-logout')));await expect(page.locator('#summaryCards')).toContainText('連線已失效');
  await page.evaluate(()=>window.__heldReads[0].release());await expect(page.locator('#summaryCards')).toContainText('連線已失效');await expect(page.locator('[data-summary-total]')).toHaveCount(0);await expect(page.locator('.sum-person')).toHaveCount(0);
 });
 test('same-context reread and pending personal logout cannot resurrect older data',async({page})=>{
  await page.evaluate(()=>{window.__holdRead=true;window.__readMode='error';});await page.locator('#panel-summary>.sum-toolbar [data-summary-retry]').click();await page.waitForFunction(()=>window.__heldReads.length===1);await page.evaluate(()=>window.__readMode='ok');await page.locator('#panel-summary>.sum-toolbar [data-summary-retry]').click();await page.waitForFunction(()=>window.__heldReads.length===2);
  await page.evaluate(()=>window.__heldReads[1].release());await expect(page.locator('#sumCoverage')).toContainText('7 / 9');
  await page.evaluate(()=>{window.__heldReads[0].release();window.__holdRead=false;window.__holdPersonal=true;});await expect(page.locator('#sumCoverage')).toContainText('7 / 9');
  await group(page,'零報與請益');await page.waitForFunction(()=>window.__heldPersonal.length===1);
  await page.evaluate(()=>window.dispatchEvent(new Event('portal-before-logout')));await page.evaluate(()=>window.__heldPersonal[0].release());await expect(page.locator('#summaryCards')).toContainText('連線已失效');await expect(page.locator('.sum-person')).toHaveCount(0);
 });
 test('keyboard focus/details, management rule and original fill/playback interactions survive',async({page})=>{
  await page.locator('[data-summary-group="sales"]').focus();await page.keyboard.press('Tab');await expect(page.locator('[data-summary-group="insurance"]')).toBeFocused();await page.keyboard.press('Enter');await expect(page.locator('[data-summary-group="insurance"]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-summary-group="insurance"]')).toBeFocused();
  await page.locator('#sum-detail-0>summary').focus();await page.keyboard.press('Enter');await expect(page.locator('#sum-detail-0')).toHaveAttribute('open','');
  await page.locator('#sumSeg21').click();await group(page,'管理重點');await expect(page.locator('#sumGroupNote')).toContainText('晚間必填');await expect(page.locator('[data-summary-store="復興南"]')).toContainText('管理待確認');
  await page.locator('.tab-btn.report-tab').first().click();await expect(page.locator('#panel-fill')).toHaveClass(/active/);await page.locator('.store-card[data-store="通化"]').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await expect(page.locator('.daily-submit-bar')).toBeVisible();
  await page.locator('.tab-btn').filter({hasText:'日期回放'}).click();await expect(page.locator('#panel-playback')).toHaveClass(/active/);await expect(page.locator('.daily-submit-bar')).toBeHidden();await noOverflow(page);
 });
 test('actual page visual evidence: summaries, nine stores, long names and full consultation',async({page},info)=>{
  const out=process.env.EVIDENCE_DIR||info.outputDir;fs.mkdirSync(out,{recursive:true});
  await page.addStyleTag({content:'#celebCanvas { visibility:hidden !important; }'});
  await page.evaluate(()=>{const banner=document.createElement('div');banner.textContent='本地候選視覺驗證 · 全部合成資料 · 無正式連線';banner.style.cssText='padding:8px;background:#fff0de;text-align:center;font-size:16px';document.querySelector('#panel-summary').prepend(banner);scrollTo(0,0);});
  await page.screenshot({path:path.join(out,'candidate-'+width+'-summary.png'),fullPage:true});
  await page.locator('#sumSeg21').click();await group(page,'零報與請益');await page.locator('#sum-detail-0>summary').click();await page.locator('#sum-private-0>summary').click();await expect(page.locator('#sum-private-0')).toContainText('合成長姓名');await noOverflow(page);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'candidate-'+width+'-consult.png'),fullPage:true});
 });
});
