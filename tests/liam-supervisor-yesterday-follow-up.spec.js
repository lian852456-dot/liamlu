const { test, expect } = require('@playwright/test');
const path = require('node:path');

const BASE=`file://${path.resolve(__dirname,'../app.html')}?preview=1`;
test.use({viewport:{width:390,height:844},serviceWorkers:'block'});

test('yesterday follow-up renders formal 21:00 fields without mobile overflow',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${BASE}#home`);
  await expect(page.locator('#yesterdayFollowUpHome')).toBeVisible();
  await expect(page.locator('#yesterdayFollowUpHome')).toContainText('昨日待追蹤');
  await expect(page.locator('#yesterdayFollowUpHome')).toContainText('2 店');
  await page.locator('[data-open-yesterday-followup]').click();
  await expect(page.locator('#yesterdayFollowUpPanel')).toBeVisible();
  await expect(page.locator('#yesterdayFollowUp')).toContainText('未過關店數');
  await expect(page.locator('#yesterdayFollowUp')).toContainText('未過關人數');
  await expect(page.locator('#yesterdayFollowUp')).toContainText('有請益店數');
  await expect(page.locator('#yesterdayFollowUp')).toContainText('需要追蹤店數');
  await expect(page.locator('#yesterdayFollowUp')).toContainText('21:00 示意零報原因');
  await expect(page.locator('#yesterdayFollowUp')).toContainText('21:00 示意請益對象');
  await expect(page.locator('#yesterdayFollowUp')).toContainText('21:00 示意改善做法');
  await expect(page.locator('#yesterdayFollowUp')).toContainText('21:00 示意明日計劃');
  await expect(page.locator('#yesterdayFollowUp')).toContainText('個人後續追蹤');
  const yesterdayBefore=await page.locator('#yesterdayFollowUp').innerText();
  await page.locator('[data-report-segment="16"]').click();
  await expect(page.locator('[data-report-segment="16"]')).toHaveClass(/active/);
  expect(await page.locator('#yesterdayFollowUp').innerText()).toBe(yesterdayBefore);
  await page.locator('[data-report-segment="21"]').click();
  await expect(page.locator('[data-report-segment="21"]')).toHaveClass(/active/);
  expect(await page.locator('#yesterdayFollowUp').innerText()).toBe(yesterdayBefore);
  await expect(page.locator('#reportTodaySection')).toContainText('今日回報');
  await expect(page.locator('#yesterdayFollowUpPanel')).toContainText('昨日正式 21:00');
  const mobile=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    shortTargets:Array.from(document.querySelectorAll('[data-view]:not([hidden]) button')).filter(node=>node.getBoundingClientRect().height<44).map(node=>node.textContent.trim()),
    ellipsis:Array.from(document.querySelectorAll('[data-view]:not([hidden]) *')).filter(node=>node instanceof HTMLElement&&getComputedStyle(node).textOverflow==='ellipsis'&&node.scrollWidth>node.clientWidth).map(node=>node.textContent.trim())
  }));
  expect(mobile.overflow).toBeLessThanOrEqual(0);
  expect(mobile.shortTargets).toEqual([]);
  expect(mobile.ellipsis).toEqual([]);
  expect(errors).toEqual([]);
});
