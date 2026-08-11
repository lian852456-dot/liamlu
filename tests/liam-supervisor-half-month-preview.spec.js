const { test, expect } = require('@playwright/test');
const path = require('node:path');

const BASE=`file://${path.resolve(__dirname,'../app.html')}?preview=1#patrol`;
test.use({viewport:{width:390,height:844},serviceWorkers:'block'});

async function expectMobileSafe(page) {
  const result=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    shortTargets:Array.from(document.querySelectorAll('[data-view="patrol"] button')).filter(node=>!node.hidden&&node.getBoundingClientRect().width>0&&node.getBoundingClientRect().height<44).map(node=>node.textContent.trim()),
    ellipsis:Array.from(document.querySelectorAll('[data-view="patrol"] *')).filter(node=>node instanceof HTMLElement&&getComputedStyle(node).textOverflow==='ellipsis'&&node.scrollWidth>node.clientWidth).map(node=>node.textContent.trim())
  }));
  expect(result.overflow).toBeLessThanOrEqual(0);
  expect(result.shortTargets).toEqual([]);
  expect(result.ellipsis).toEqual([]);
}

test('half-month preview is opt-in, preselects an open visit and never calls formal write', async ({page})=>{
  const errors=[]; const formalRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://script.google.com/**',route=>{formalRequests.push(route.request().url());return route.abort();});
  await page.goto(BASE);

  await expect(page.locator('[data-view="patrol"] h1')).toContainText('巡店檢查');
  await expect(page.locator('[data-patrol-check-view="patrol"]')).toHaveClass(/active/);
  await expect(page.locator('#patrolCheckContent')).toBeVisible();
  await expect(page.locator('#halfMonthCheckPreview')).toBeHidden();
  await page.locator('.patrol-check-selector').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-01-selector-390x844.png'});

  await page.locator('[data-patrol-check-view="half-month"]').click();
  await expect(page.locator('#halfMonthCheckPreview')).toBeVisible();
  await expect(page.locator('#halfMonthCheckPreview')).toContainText('PREVIEW / 尚未寫入正式資料');
  await expect(page.locator('#halfMonthCheckPreview')).toContainText('目前在：');
  await expect(page.locator('#halfMonthCheckPreview')).toContainText('酒泉');
  await expect(page.locator('#halfMonthStore')).toHaveCount(0);
  await expect(page.locator('.half-preview-summary article')).toHaveCount(4);
  await expect(page.locator('.half-preview-store')).toHaveCount(9);
  await page.locator('.half-preview-period').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-02-overview-390x844.png'});
  await page.locator('.half-preview-stores').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-03-nine-stores-390x844.png'});

  await page.locator('[data-half-preview-action="start"]').click();
  await expect(page.locator('#halfMonthStore')).toHaveValue('酒泉');
  await expect(page.locator('.half-preview-question')).toHaveCount(18);
  await expect(page.locator('.half-preview-abnormal:visible')).toHaveCount(0);
  await page.locator('.half-preview-form-meta').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-04-start-form-390x844.png'});

  await page.locator('[data-half-preview-question="1"] [data-half-answer="abnormal"]').click();
  const issue=page.locator('[data-half-preview-question="1"]');
  await expect(issue.locator('.half-preview-abnormal')).toBeVisible();
  await issue.locator('[data-half-note]').fill('展示設備未依規定陳列');
  await issue.locator('[data-half-improvement]').fill('今日完成調整並回傳佐證');
  await issue.locator('[data-half-evidence]').fill('https://drive.google.com/file/d/preview-only/view');
  await issue.scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-05-abnormal-expanded-390x844.png'});

  for(let item=2;item<=18;item++) await page.locator(`[data-half-preview-question="${item}"] [data-half-answer="ok"]`).click();
  await page.locator('[data-half-preview-question="1"] [data-half-note]').fill('展示設備未依規定陳列');
  await page.locator('[data-half-preview-question="1"] [data-half-improvement]').fill('今日完成調整並回傳佐證');
  await page.locator('[data-half-preview-action="complete"]').click();
  await expect(page.locator('.half-preview-result')).toContainText('酒泉');
  await expect(page.locator('.half-preview-result')).toContainText('18/18');
  await expect(page.locator('.half-preview-result-list')).toContainText('01 督導駐點');
  await expect(page.locator('.half-preview-result-list')).toContainText('待改善');
  await page.locator('.half-preview-result').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-06-result-390x844.png'});

  await expectMobileSafe(page);
  expect(formalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('without an open visit the store remains an explicit placeholder',async({page})=>{
  await page.goto(BASE);
  await page.evaluate(()=>{ window.LiamSupervisorHalfMonthPreviewData.openVisit=null; });
  await page.locator('[data-patrol-check-view="half-month"]').click();
  await expect(page.locator('#halfMonthCheckPreview')).not.toContainText('目前在：');
  await page.locator('[data-half-preview-action="start"]').click();
  await expect(page.locator('#halfMonthStore')).toHaveValue('');
  await expect(page.locator('#halfMonthStore option').first()).toHaveText('請選擇店點');
});

test('preview draft and incomplete completion stay local and fail closed',async({page})=>{
  let formalRequests=0;
  await page.route('https://script.google.com/**',route=>{formalRequests+=1;return route.abort();});
  await page.goto(BASE);
  await page.locator('[data-patrol-check-view="half-month"]').click();
  await page.locator('[data-half-preview-action="start"]').click();
  await page.locator('[data-half-preview-action="draft"]').click();
  await expect(page.locator('#halfMonthPreviewMessage')).toContainText('正式資料仍為 0 次寫入');
  await page.locator('[data-half-preview-action="complete"]').click();
  await expect(page.locator('#halfMonthPreviewMessage')).toContainText('18 題未選狀態');
  await expect(page.locator('.half-preview-result')).toHaveCount(0);
  expect(formalRequests).toBe(0);
});
