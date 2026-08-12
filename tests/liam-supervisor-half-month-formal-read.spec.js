const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fixture=require('./fixtures/half-month-hread-fixture.cjs');
const {patrolSummaryResponse}=require('./fixtures/patrol-summary-response.cjs');

const FORMAL_URL=`file://${path.resolve(__dirname,'../app.html')}#patrol`;
const TOKEN='formal-read-short-token';
const TODAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
test.use({viewport:{width:390,height:844},serviceWorkers:'block'});

async function installFormalRoutes(page,{expireHread=false}={}){
  const state={hread:0,writes:[],requests:[]};
  await page.addInitScript(token=>sessionStorage.setItem('bei12b_pt_session_token',token),TOKEN);
  await page.route('https://script.google.com/**',async route=>{
    const request=route.request();
    let action='';
    if(request.method()==='POST'){
      const payload=JSON.parse(request.postData()||'{}');
      action=payload.action||'';
      if(['hwrite','half_media_upload'].includes(action)) state.writes.push(action);
      if(action==='ptauth') return route.fulfill({json:{status:'ok',token:TOKEN,expiresIn:1800}});
      if(action==='ptlogout') return route.fulfill({json:{status:'ok'}});
      return route.fulfill({json:{status:'error',message:'unexpected POST'}});
    }
    const url=new URL(request.url());
    action=url.searchParams.get('action')||'';
    state.requests.push(action);
    if(['hwrite','half_media_upload'].includes(action)) state.writes.push(action);
    if(action==='sread') return route.fulfill({json:{status:'ok',schedule:{month:'2026-08',stores:[]}}});
    if(action==='ptsummary') return route.fulfill({json:patrolSummaryResponse('2026-08')});
    if(action==='ptvisit_read') return route.fulfill({json:{status:'ok',events:[{serverTime:`${TODAY}T09:12:00+08:00`,date:TODAY,action:'arrival',store:'台北酒泉',note:'',visitSessionId:'formal-open'}],openVisit:{serverTime:`${TODAY}T09:12:00+08:00`,date:TODAY,action:'arrival',store:'台北酒泉',note:'',visitSessionId:'formal-open'}}});
    if(action==='hread'){
      state.hread+=1;
      return route.fulfill({json:expireHread?{status:'error',message:'unauthorized'}:{status:'ok',rows:fixture.rows}});
    }
    return route.fulfill({json:{status:'error',message:`unexpected action ${action}`}});
  });
  return state;
}

async function mobileAssertions(page){
  const state=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    shortButtons:Array.from(document.querySelectorAll('[data-view="patrol"] button')).filter(button=>!button.hidden&&button.getBoundingClientRect().width>0&&button.getBoundingClientRect().height<44).map(button=>button.textContent.trim()),
    ellipsis:Array.from(document.querySelectorAll('[data-view="patrol"] *')).filter(node=>node instanceof HTMLElement&&getComputedStyle(node).textOverflow==='ellipsis'&&node.scrollWidth>node.clientWidth).map(node=>node.textContent.trim())
  }));
  expect(state.overflow).toBeLessThanOrEqual(0);
  expect(state.shortButtons).toEqual([]);
  expect(state.ellipsis).toEqual([]);
}

test('formal hread maps nine stores while recovery remains read-only',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const state=await installFormalRoutes(page);
  await page.goto(FORMAL_URL);
  await page.locator('[data-patrol-check-view="half-month"]').click();
  await expect(page.locator('#halfMonthCheckPreview')).toContainText('FORMAL READ / 正式唯讀');
  await expect(page.locator('.half-preview-summary article').nth(0)).toContainText('5 / 9');
  await expect(page.locator('.half-preview-summary article').nth(1)).toContainText('3 店');
  await expect(page.locator('.half-preview-summary article').nth(2)).toContainText('4');
  await expect(page.locator('.half-preview-summary article').nth(3)).toContainText('2 店');
  await expect(page.locator('.half-preview-store')).toHaveCount(9);
  await expect(page.locator('.half-preview-store').first()).toContainText('通化');
  await expect(page.locator('.half-preview-store').nth(2)).toContainText('六張犁');
  await expect(page.locator('.half-preview-store').nth(2)).toContainText('5/18 已填');
  await expect(page.locator('.half-preview-store').nth(4)).toContainText('台北三創');
  await expect(page.locator('.half-preview-store').nth(4)).toContainText('異常 2');
  await page.locator('.half-preview-period').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-formal-01-overview-390x844.png'});
  await page.locator('.half-preview-stores').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-formal-02-nine-stores-390x844.png'});

  await page.locator('[data-half-preview-action="start"]').click();
  await expect(page.locator('#halfMonthStore')).toHaveValue('酒泉');
  await expect(page.locator('#halfMonthProgress')).toContainText('18 / 18');
  await expect(page.locator('[data-half-preview-question="18"] [data-half-answer="na"]')).toHaveClass(/active/);
  await page.locator('.half-preview-form-meta').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-formal-03-clean-store-390x844.png'});

  await page.locator('#halfMonthStore').selectOption('台北三創');
  const abnormal=page.locator('[data-half-preview-question="3"]');
  await expect(abnormal.locator('[data-half-answer="abnormal"]')).toHaveClass(/active/);
  await expect(abnormal.locator('[data-half-note]')).toHaveValue('台北三創 第3題正式異常原文');
  await expect(abnormal.locator('[data-half-evidence]')).toHaveValue('https://drive.google.com/file/d/%E5%8F%B0%E5%8C%97%E4%B8%89%E5%89%B5-3/view');
  await abnormal.scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-formal-04-abnormal-store-390x844.png'});

  await page.locator('#halfMonthStore').selectOption('六張犁');
  await expect(page.locator('#halfMonthProgress')).toContainText('5 / 18');
  await expect(page.locator('[data-half-preview-question="6"] .half-preview-result-label')).toContainText('尚未填寫');
  await expect(page.locator('[data-half-preview-question="1"] [data-half-answer="ok"]')).toBeDisabled();
  await expect(page.locator('[data-half-preview-action="save"]')).toHaveCount(0);
  await expect(page.locator('.preview-only-banner')).toContainText('FORMAL READ / 正式唯讀');
  await page.locator('.half-preview-form-meta').scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-output/half-month-formal-05-incomplete-store-390x844.png'});

  expect(state.hread).toBe(1);
  expect(state.writes).toEqual([]);
  expect(errors).toEqual([]);
  await mobileAssertions(page);
});

test('period selector reads cached H2 rows without a write or second hread',async({page})=>{
  const state=await installFormalRoutes(page);
  await page.goto(FORMAL_URL);
  await page.locator('[data-patrol-check-view="half-month"]').click();
  await expect(page.locator('.half-preview-summary')).toBeVisible();
  await page.locator('[data-half-period="H2"]').click();
  await expect(page.locator('.half-preview-period')).toContainText('2026 年 8 月下半月');
  await expect(page.locator('.half-preview-summary article').first()).toContainText('0 / 9');
  await expect(page.locator('.half-preview-summary article').last()).toContainText('9 店');
  expect(state.hread).toBe(1);
  expect(state.writes).toEqual([]);
});

test('without a patrol session formal half-month stays locked and sends no hread',async({page})=>{
  const requests=[];
  await page.route('https://script.google.com/**',route=>{requests.push(route.request().url());return route.abort();});
  await page.goto(FORMAL_URL);
  await page.locator('[data-patrol-check-view="half-month"]').click();
  await expect(page.locator('#halfMonthCheckPreview')).toContainText('請先解鎖班表／巡店');
  expect(requests).toEqual([]);
});

test('expired hread reuses the existing patrol timeout UX and fails closed',async({page})=>{
  const state=await installFormalRoutes(page,{expireHread:true});
  await page.goto(FORMAL_URL);
  await page.locator('[data-patrol-check-view="half-month"]').click();
  await expect(page.locator('#halfMonthCheckPreview')).toContainText('班表／巡店授權已逾時，請重新驗證');
  await expect(page.locator('#halfMonthCheckPreview')).not.toContainText('5 / 9');
  expect(state.hread).toBe(1);
  expect(state.writes).toEqual([]);
});
