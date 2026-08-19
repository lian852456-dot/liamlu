const { test, expect } = require('@playwright/test');
const path = require('node:path');

const APP_URL = process.env.LIAM_APP_BASE_URL || `file://${path.resolve(__dirname, '../app.html')}`;
const PERSONAL_STORES = ['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','台北三創','六張犁'];
const CORE_STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];

test.use({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });

function personalRows() {
  return [
    { name:'安＊一', store:'酒泉', category:'業代', phone_award_actual:9000, phone_award_projected:11000, phone_award_rank:1, phone_award_eligible:'Y', overall_rate:1.2, rank:1, overall_rate_dod:0.01, rank_dod:1, metrics:{AQ:{rate:1,actual:10,target:10}} },
    { name:'白＊二', store:'台灣大哥大數位生活台北三創', role:'副店', phone_award_actual:8000, phone_award_projected:9500, phone_award_rank:2, phone_award_eligible:'Y', overall_rate:1.1, rank:2, overall_rate_dod:0.01, rank_dod:0, metrics:{AQ:{rate:1,actual:10,target:10}} },
    { name:'陳＊三', store:'永吉', category:'業代', phone_award_actual:7000, phone_award_projected:8200, phone_award_rank:3, phone_award_eligible:'N', overall_rate:.9, rank:3, overall_rate_dod:-.01, rank_dod:-1, metrics:{AQ:{rate:.9,actual:9,target:10}} },
    { name:'丁＊四', store:'復興南', category:'店長', phone_award_actual:0, phone_award_projected:1200, phone_award_rank:18, phone_award_eligible:'N', metrics:{AQ:{rate:.8,actual:8,target:10}} },
    { name:'何＊五', store:'杭州南', category:'', phone_award_actual:null, phone_award_projected:null, phone_award_rank:null, phone_award_eligible:'', overall_rate:.8, rank:5, overall_rate_dod:0, rank_dod:0, metrics:{AQ:{rate:.7,actual:7,target:10}} }
  ];
}

function awardItems(seed = 0) {
  return Array.from({length:13},(_,index)=>({
    display_name:`指定機款 ${index+1}`,
    actual:seed+index,
    target:10,
    rate:(seed+index)/10,
    difference:index-5,
    threshold_target:5,
    store_reward_50:500,
    store_reward_100:1000,
    award:index<2?'Y':'N'
  }));
}

function formalSnapshot(awardDate = '2026-08-19') {
  return {
    publishedAt:'2026-08-19T09:55:00+08:00',
    kpiBattle:{
      report_date:'2026-08-19', source_as_of_date:'2026-08-18', source_file:'0819.xlsx', generated_at:'2026-08-19T09:55:00+08:00',
      aggregate:{ overall_kpi:1.1, company_rank:20, addon_score:13 }, stores:[], personal:personalRows()
    },
    awardsBattle:{
      report_date:awardDate,
      generated_at:'2026-08-19T09:55:00+08:00',
      supervisor:{actual_total:9234,projected:12000,rank:21,award:'Y'},
      overall:{ award:{district_award_amount:9234}, items:awardItems() },
      stores:CORE_STORES.map((store,index)=>({ store, award:{actual_total:index*1000,award:index<3?'Y':'N'}, items:awardItems(index) }))
    }
  };
}

async function installFormalRoutes(page, snapshot = formalSnapshot(), actions = []) {
  await page.addInitScript(()=>{
    localStorage.setItem('north12b_private_dashboard_employee_id','TEST01');
    localStorage.setItem('north12b_private_dashboard_device_id','approved-device-1');
  });
  await page.route('https://script.google.com/**',async route=>{
    const payload=JSON.parse(route.request().postData()||'{}');
    actions.push(payload.action);
    if(payload.action==='private_access') return route.fulfill({json:{status:'ok',profile:{maskedName:'測＊員'},snapshot}});
    if(payload.action==='kpicalc_access') return route.fulfill({json:{status:'ok',data:{meta:{month:'2026-08',snapshotDay:18,sourceFile:'0819.xlsx'},items:[],aggregateRates:{},stores:[]}}});
    if(payload.action==='read') return route.fulfill({json:{status:'ok',data:{},summary:{semantics:'formal-index-summary-v1',completedStores:0,totalStores:9,missingStores:PERSONAL_STORES,metrics:{},stores:[]}}});
    if(payload.action==='pread') return route.fulfill({json:{status:'ok',data:{}}});
    return route.fulfill({status:403,json:{status:'error',message:`unexpected ${payload.action}`}});
  });
}

async function openAwardBattle(page) {
  await page.locator('.bottom-nav [data-nav="battle"]').click();
  await page.locator('[data-battle-kind="award"]').click();
  await expect(page.locator('[data-battle-scope="personal"]')).toBeVisible();
}

async function openPersonalAwards(page) {
  await openAwardBattle(page);
  await page.locator('[data-battle-scope="personal"]').click();
  await expect(page.locator('[data-award-personal-root]')).toBeVisible();
}

test('390x844 keeps area and store awards, then supports formal personal filters, sorts, refresh and logout',async({page})=>{
  const pageErrors=[];
  const consoleErrors=[];
  const actions=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{ if(message.type()==='error')consoleErrors.push(message.text()); });
  await installFormalRoutes(page,formalSnapshot(),actions);
  await page.goto(APP_URL);
  await expect(page.locator('#viewerState')).toHaveText('測＊員');

  await openAwardBattle(page);
  await expect(page.locator('#battleContent')).toContainText('督導區台獎摘要');
  await expect(page.locator('#battleContent')).toContainText('$9,234');
  await expect(page.locator('#battleContent')).toContainText('21');
  await expect(page.locator('.award-battle-row')).toHaveCount(10);
  await page.locator('[data-battle-scope="store"]').click();
  await page.locator('#battleStoreSelect').selectOption('酒泉');
  await expect(page.locator('.award-store-item')).toHaveCount(13);

  await page.locator('[data-battle-scope="personal"]').click();
  await expect(page.locator('#awardPersonStoreSelect')).toHaveValue('all');
  await expect(page.locator('#awardPersonSortSelect')).toHaveValue('amount-desc');
  await expect(page.locator('#awardPersonStoreSelect option')).toHaveText(['全部店點',...PERSONAL_STORES]);
  await expect(page.locator('.award-person-row')).toHaveCount(5);
  await expect(page.locator('.award-person-rank')).toHaveText(['🥇','🥈','🥉','18','—']);
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
  await expect(page.locator('.award-person-row').first().locator('.award-person-rank')).toHaveText('18');
  await expect(page.locator('.award-person-row').filter({hasText:'安＊一'}).locator('.award-person-rank')).toHaveText('🥇');
  await page.locator('#awardPersonSortSelect').selectOption('name');
  const names=await page.locator('.award-person-name strong').allTextContents();
  const expected=await page.evaluate(values=>values.slice().sort((a,b)=>a.localeCompare(b,'zh-Hant')),names);
  expect(names).toEqual(expected);

  await page.evaluate(()=>window.scrollTo(0,0));
  const layout=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    scrollX:window.scrollX,
    visibleRows:[...document.querySelectorAll('.award-person-row')].filter(row=>row.getBoundingClientRect().top<innerHeight).length
  }));
  expect(layout.overflow).toBe(0);
  expect(layout.scrollX).toBe(0);
  expect(layout.visibleRows).toBeGreaterThanOrEqual(4);
  const bottomLayout=await page.evaluate(()=>{
    window.scrollTo(0,document.documentElement.scrollHeight);
    return {
      lastBottom:document.querySelector('.award-person-row:last-child').getBoundingClientRect().bottom,
      navTop:document.querySelector('.bottom-nav').getBoundingClientRect().top
    };
  });
  expect(bottomLayout.lastBottom).toBeLessThan(bottomLayout.navTop);
  await page.screenshot({path:'test-output/liam-supervisor-award-personal-main-390x844.png',fullPage:true});

  const readsBefore=actions.filter(action=>action==='private_access').length;
  await page.reload();
  await expect(page.locator('#viewerState')).toHaveText('測＊員');
  await openPersonalAwards(page);
  await expect(page.locator('.award-person-row')).toHaveCount(5);
  expect(actions.filter(action=>action==='private_access').length).toBeGreaterThan(readsBefore);

  await page.locator('[data-profile-entry]').click();
  await page.locator('#privateLogout').click();
  await page.locator('.bottom-nav [data-nav="battle"]').click();
  await page.locator('[data-battle-kind="award"]').click();
  await page.locator('[data-battle-scope="personal"]').click();
  await expect(page.locator('#battleContent')).not.toContainText('安＊一');
  expect(await page.evaluate(()=>localStorage.getItem('north12b_private_dashboard_employee_id'))).toBeNull();
  expect(actions.every(action=>['private_access','kpicalc_access','read','pread'].includes(action))).toBe(true);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('personal award date mismatch is fail-closed',async({page})=>{
  await installFormalRoutes(page,formalSnapshot('2026-08-18'));
  await page.goto(APP_URL);
  await expect(page.locator('#viewerState')).toHaveText('測＊員');
  await openPersonalAwards(page);
  await expect(page.locator('[data-award-personal-root]')).toContainText('台獎日期與 KPI 日期不一致');
  await expect(page.locator('.award-person-row')).toHaveCount(0);
});

test('unapproved state does not request or display personal award data',async({page})=>{
  const actions=[];
  await page.route('https://script.google.com/**',async route=>{
    actions.push(JSON.parse(route.request().postData()||'{}').action);
    await route.fulfill({status:403,json:{status:'error',message:'device not approved'}});
  });
  await page.goto(APP_URL);
  await openAwardBattle(page);
  await page.locator('[data-battle-scope="personal"]').click();
  await expect(page.locator('#battleContent')).toContainText('解鎖後顯示 KPI／台獎正式摘要');
  await expect(page.locator('#battleContent')).not.toContainText('安＊一');
  await expect(page.locator('.award-person-row')).toHaveCount(0);
  expect(actions).not.toContain('private_access');
});
