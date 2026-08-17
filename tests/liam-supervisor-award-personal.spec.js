const { test, expect } = require('@playwright/test');
const path = require('node:path');

const APP_URL = process.env.LIAM_APP_BASE_URL || `file://${path.resolve(__dirname, '../app.html')}`;
const STORES = ['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','台北三創','六張犁'];

test.use({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });

function personalRows() {
  return [
    { name:'安＊一', store:'酒泉', category:'業代', phone_award_actual:9000, phone_award_projected:11000, phone_award_rank:1, phone_award_eligible:'Y' },
    { name:'白＊二', store:'台灣大哥大數位生活台北三創', role:'副店', phone_award_actual:8000, phone_award_projected:9500, phone_award_rank:2, phone_award_eligible:'Y' },
    { name:'陳＊三', store:'永吉', category:'業代', phone_award_actual:7000, phone_award_projected:8200, phone_award_rank:3, phone_award_eligible:'N' },
    { name:'丁＊四', store:'復興南', category:'店長', phone_award_actual:0, phone_award_projected:1200, phone_award_rank:18, phone_award_eligible:'N' },
    { name:'何＊五', store:'杭州南', category:'', phone_award_actual:null, phone_award_projected:null, phone_award_rank:null, phone_award_eligible:'' }
  ];
}

function formalSnapshot(awardDate = '2026-08-17') {
  const coreStoreOrder = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
  return {
    publishedAt:'2026-08-17T09:55:00+08:00',
    kpiBattle:{
      report_date:'2026-08-17', data_as_of_date:'2026-08-16', source_file:'0817.xlsx', generated_at:'2026-08-17T09:55:00+08:00',
      aggregate:{ overall_kpi:1.1, company_rank:20, addon_score:13 }, stores:[], personal:personalRows()
    },
    awardsBattle:{
      report_date:awardDate, generated_at:'2026-08-17T09:55:00+08:00', overall:{ award:{}, items:[] },
      stores:coreStoreOrder.map((store,index)=>({ store, award:{ actual_total:index * 1000, award:index < 3 ? 'Y':'N' }, items:[{ display_name:`${store} 指定機款`, actual:index, target:10 }] }))
    }
  };
}

async function installFormalRoutes(page, snapshot = formalSnapshot(), actions = []) {
  await page.addInitScript(()=>{
    localStorage.setItem('north12b_private_dashboard_employee_id','TEST01');
    localStorage.setItem('north12b_private_dashboard_device_id','approved-device-1');
  });
  await page.route('https://script.google.com/**', async route=>{
    const payload=JSON.parse(route.request().postData() || '{}');
    actions.push(payload.action);
    if(payload.action==='private_access') return route.fulfill({json:{status:'ok',profile:{maskedName:'測＊員'},snapshot}});
    if(payload.action==='kpicalc_access') return route.fulfill({json:{status:'ok',data:{meta:{month:'2026-08',snapshotDay:16,sourceFile:'0817.xlsx'},items:[],aggregateRates:{},stores:[]}}});
    if(payload.action==='read') return route.fulfill({json:{status:'ok',data:{},summary:{semantics:'formal-index-summary-v1',completedStores:0,totalStores:9,missingStores:STORES,metrics:{},stores:[]}}});
    if(payload.action==='pread') return route.fulfill({json:{status:'ok',data:{}}});
    return route.fulfill({status:403,json:{status:'error',message:`unexpected ${payload.action}`}});
  });
}

async function openPersonalAwards(page) {
  await page.locator('.bottom-nav [data-nav="battle"]').click();
  await page.locator('[data-battle-kind="award"]').click();
  await expect(page.locator('[data-award-person-scope]')).toBeVisible();
  await page.locator('[data-award-person-scope]').click();
  await expect(page.locator('[data-award-personal-root]')).toBeVisible();
}

test('390x844 personal award leaderboard supports formal values, filters, sorts, refresh and logout', async ({ page }) => {
  const errors=[];
  const consoleErrors=[];
  const actions=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{ if(message.type()==='error') consoleErrors.push(message.text()); });
  await installFormalRoutes(page,formalSnapshot(),actions);
  await page.goto(APP_URL);
  await expect(page.locator('#viewerState')).toHaveText('測＊員');
  await openPersonalAwards(page);

  await expect(page.locator('#awardPersonStoreSelect')).toHaveValue('all');
  await expect(page.locator('#awardPersonSortSelect')).toHaveValue('amount-desc');
  await expect(page.locator('#awardPersonStoreSelect option')).toHaveText(['全部店點',...STORES]);
  await expect(page.locator('.award-person-row')).toHaveCount(5);
  await expect(page.locator('.award-person-order')).toHaveText(['🥇','🥈','🥉','18','—']);
  await expect(page.locator('.award-person-row').nth(3)).toContainText('$0');
  await expect(page.locator('.award-person-row').nth(4)).toContainText('尚未同步');
  await expect(page.locator('.award-person-list')).toContainText('台北三創');

  await page.locator('#awardPersonStoreSelect').selectOption('台北三創');
  await expect(page.locator('.award-person-row')).toHaveCount(1);
  await expect(page.locator('.award-person-row')).toContainText('白＊二');
  await page.locator('#awardPersonStoreSelect').selectOption('all');
  await page.locator('#awardPersonSortSelect').selectOption('amount-asc');
  await expect(page.locator('.award-person-row').first()).toContainText('$0');
  await expect(page.locator('.award-person-row').last()).toContainText('尚未同步');
  await expect(page.locator('.award-person-row').first().locator('.award-person-order')).toHaveText('18');
  await expect(page.locator('.award-person-row').filter({hasText:'安＊一'}).locator('.award-person-order')).toHaveText('🥇');
  await page.locator('#awardPersonSortSelect').selectOption('name');
  const nameOrder=await page.locator('.award-person-name strong').allTextContents();
  const expectedNameOrder=await page.evaluate(names=>names.slice().sort((a,b)=>a.localeCompare(b,'zh-Hant')),nameOrder);
  expect(nameOrder).toEqual(expectedNameOrder);
  await page.locator('#awardPersonSortSelect').selectOption('amount-desc');
  await expect(page.locator('.award-person-order')).toHaveText(['🥇','🥈','🥉','18','—']);
  await page.evaluate(()=>window.scrollTo(0,0));

  const layout=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    scrollX:window.scrollX,
    visibleRows:Array.from(document.querySelectorAll('.award-person-row')).filter(row=>row.getBoundingClientRect().top<innerHeight).length,
    scopeTargets:Array.from(document.querySelectorAll('.scope-control button:not([hidden])')).map(button=>button.getBoundingClientRect().height)
  }));
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.scrollX).toBe(0);
  expect(layout.visibleRows).toBeGreaterThanOrEqual(4);
  expect(layout.scopeTargets.every(height=>height>=44)).toBe(true);
  await page.screenshot({path:'test-output/liam-supervisor-award-personal-390x844.png'});

  const readsBeforeRefresh=actions.filter(action=>action==='private_access').length;
  await page.reload();
  await expect(page.locator('#viewerState')).toHaveText('測＊員');
  await openPersonalAwards(page);
  await expect(page.locator('.award-person-row')).toHaveCount(5);
  expect(actions.filter(action=>action==='private_access').length).toBeGreaterThan(readsBeforeRefresh);

  await page.locator('[data-profile-entry]').click();
  await page.locator('#privateLogout').click();
  await page.locator('.bottom-nav [data-nav="battle"]').click();
  await page.locator('[data-battle-kind="award"]').click();
  await page.locator('[data-award-person-scope]').click();
  await expect(page.locator('[data-award-personal-root]')).toContainText('請先從右上角解鎖正式資料');
  await expect(page.locator('[data-award-personal-root]')).not.toContainText('安＊一');
  expect(await page.evaluate(()=>localStorage.getItem('north12b_private_dashboard_employee_id'))).toBeNull();
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('personal award fails closed when KPI and award report dates differ', async ({ page }) => {
  await installFormalRoutes(page,formalSnapshot('2026-08-16'));
  await page.goto(APP_URL);
  await expect(page.locator('#viewerState')).toHaveText('測＊員');
  await openPersonalAwards(page);
  await expect(page.locator('[data-award-personal-root]')).toContainText('台獎日期與 KPI 日期不一致');
  await expect(page.locator('.award-person-row')).toHaveCount(0);
});

test('unapproved or logged-out state never requests or displays formal personal awards', async ({ page }) => {
  const formalActions=[];
  await page.route('https://script.google.com/**',async route=>{
    formalActions.push(JSON.parse(route.request().postData() || '{}').action);
    await route.fulfill({status:403,json:{status:'error',message:'device not approved'}});
  });
  await page.goto(APP_URL);
  await openPersonalAwards(page);
  await expect(page.locator('[data-award-personal-root]')).toContainText('請先從右上角解鎖正式資料');
  await expect(page.locator('.award-person-row')).toHaveCount(0);
  expect(formalActions).not.toContain('private_access');
});
