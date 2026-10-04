const {test, expect} = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4184/';
const date = '2099-10-02';
const closingKeys = ['aq999','aq1399','haosu','rt999','rt1399','insurance_num','insurance_den'];
const management = ['op_online','op_accum','op_target','mycharge_clicked','mycharge_tagged'];

test.beforeEach(async ({page}) => {
  const errors=[],external=[]; page.__layoutErrors=errors; page.__layoutExternal=external;
  page.on('pageerror', e=>errors.push(e.message));
  page.on('request', r=>{if(new URL(r.url()).origin !== new URL(base).origin) external.push(r.url());});
  await page.route('**/*', r => new URL(r.request().url()).origin === new URL(base).origin ? r.continue() : r.abort());
  // Test-only synthetic backend. The real runtime/transport stays in the shipped page.
  // External fetch is intercepted before it can create any HTTP request.
  await page.addInitScript(() => {
    const originalFetch=window.fetch;
    window.__apiCalls=[];
    window.__rows=JSON.parse(sessionStorage.getItem('__dailySyntheticRows') || '[]');
    window.fetch=async (url, options={}) => {
      if(new URL(String(url),location.href).origin === location.origin) return originalFetch(url,options);
      const p=JSON.parse(options.body || '{}'); window.__apiCalls.push(p);
      let result;
      if(p.action==='write') {
        const row={...p.data,date:p.date,store:p.store,seg:p.seg};
        window.__rows=window.__rows.filter(r=>!(r.date===p.date&&r.store===p.store&&Number(r.seg)===Number(p.seg))).concat(row);
        sessionStorage.setItem('__dailySyntheticRows',JSON.stringify(window.__rows));
        result={status:'ok',rowWritten:true,spreadsheetId:'synthetic-only',date:p.date,store:p.store,seg:p.seg,readbackMatches:true};
      } else if(p.action==='read') {
        result={status:'ok',data:Object.fromEntries(window.__rows.filter(r=>r.date===p.date&&Number(r.seg)===Number(p.seg)).map(r=>[r.store,{...r}]))};
        if(window.__badReadback&&Number(p.seg)===21) Object.values(result.data).forEach(r=>r.aq999=999);
      } else result={status:'error',message:'synthetic test does not grant access'};
      return new Response(JSON.stringify(result),{headers:{'content-type':'application/json'}});
    };
  });
  await page.goto(base+'index.html',{waitUntil:'load'});
  await page.evaluate(d=>{document.getElementById('fillDate').value=d;document.getElementById('fillDate').dispatchEvent(new Event('change'));},date);
});
test.afterEach(async ({page})=>{expect(page.__layoutErrors).toEqual([]);expect(page.__layoutExternal).toEqual([]);});
async function choose(page, store='酒泉') {
  const card=page.locator('.store-card[data-store="'+store+'"]');
  if(await card.isHidden()) await page.locator('#dailyStoreToggle').click();
  await card.click(); await expect(page.locator('.btn-save-main')).toBeEnabled();
}
async function seed(page, row) {
  await page.evaluate(row=>{window.__rows.push(row);Object.keys(_cache).forEach(k=>delete _cache[k]);},row);
}
async function complete(page, zero=false) {
  for(const key of closingKeys) await page.locator('#f_'+key).fill(zero?'0':key==='insurance_den'?'2':'1');
  for(const key of management) await page.locator('#f_mgmt_'+key).fill(zero?'0':key==='mycharge_tagged'?'2':'1');
}
for(const width of [390,1440]) test.describe(width+'px',()=>{
  test.use({viewport:{width,height:width===390?844:1000}});
  test('single controls, keyboard selection, rank first and all 26 fields remain',async({page})=>{
    await page.locator('.store-card[data-store="酒泉"]').focus();await page.keyboard.press('Enter');
    await expect(page.locator('.btn-save-main')).toBeEnabled();await expect(page.locator('#dailyStoreGrid')).toBeHidden();
    expect(await page.locator('#fillFormArea input').first().getAttribute('id')).toBe('f_rank');
    const ids=await page.evaluate(()=>Array.from(document.querySelectorAll('[id]')).map(el=>el.id));expect(ids.length).toBe(new Set(ids).size);
    expect(await page.evaluate(()=>FIELDS.every(k=>document.querySelectorAll('#f_'+k).length===1)&&FIELDS.length===26)).toBe(true);
    expect(await page.locator('#fillDate').count()).toBe(1);expect(await page.locator('.btn-save-main').count()).toBe(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const rank=await page.locator('.daily-rank').boundingBox(), core=await page.locator('.daily-core').boundingBox();expect(rank.y).toBeLessThan(core.y);
  });
  test('afternoon partial save and existing shadow are updated only by real save/readback code',async({page})=>{
    await choose(page);await page.locator('#f_rank').fill('24');await page.locator('#f_kpi').fill('88.8');
    await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('已儲存');
    const row=await page.evaluate(d=>JSON.parse(localStorage.getItem(shadowKey(d,16))).酒泉,date);
    expect(row.rank).toBe(24);expect(row.kpi).toBe(88.8);expect(JSON.parse(row.management_focus_json).op_online).toBeNull();
    expect(await page.evaluate(()=>window.__apiCalls.filter(p=>p.action==='write').length)).toBe(1);
  });
  test('first 16:00 rank/KPI inheritance, 0, missing and same-date/store isolation',async({page})=>{
    await seed(page,{date,store:'酒泉',seg:16,kpi:0,rank:0});await choose(page);await page.locator('#newSeg21').click();await expect(page.locator('.btn-save-main')).toBeEnabled();
    await expect(page.locator('#f_rank')).toHaveValue('0');await expect(page.locator('#f_kpi')).toHaveValue('0');
    await expect(page.locator('#f_rank')).toHaveAttribute('readonly','');await expect(page.locator('#f_kpi')).toHaveAttribute('readonly','');
    await expect(page.locator('#dailyCarryNote')).toContainText('首次回報');
    await choose(page,'通化');await expect(page.locator('#f_rank')).toHaveValue('');await expect(page.locator('#dailyCarryNote')).toContainText('尚缺');
    await choose(page,'酒泉');await expect(page.locator('#f_rank')).toHaveValue('0');
    await page.locator('#fillDate').fill('2099-10-03');await expect(page.locator('.btn-save-main')).toBeEnabled();
    await expect(page.locator('#f_rank')).toHaveValue('');await expect(page.locator('#f_kpi')).toHaveValue('');
  });
  test('delayed responses do not cross a segment change; pending save is disabled',async({page})=>{
    await choose(page);
    await page.evaluate(()=>{window.__originalGetData=getData;window.__pending=[];getData=(date,store,seg)=>new Promise(resolve=>window.__pending.push({date,store,seg,resolve}));selectStore('酒泉');});
    await expect(page.locator('.btn-save-main')).toBeDisabled();await page.locator('#newSeg21').click();
    await page.evaluate(()=>{window.__pending.filter(p=>p.seg===16).forEach((p,i)=>p.resolve({kpi:i===0?12:88,rank:i===0?1:24}));window.__pending.find(p=>p.seg===21).resolve(null);});
    await expect(page.locator('#f_rank')).toHaveValue('24');await expect(page.locator('#f_kpi')).toHaveValue('88');await expect(page.locator('.btn-save-main')).toBeEnabled();
  });
  test('existing same-store/day evening rank keeps current main precedence and labels its source',async({page})=>{
    await seed(page,{date,store:'酒泉',seg:16,kpi:88,rank:24});
    await seed(page,{date,store:'酒泉',seg:21,kpi:90,rank:20});
    await choose(page);await page.locator('#newSeg21').click();await expect(page.locator('.btn-save-main')).toBeEnabled();
    await expect(page.locator('#f_rank')).toHaveValue('20');await expect(page.locator('#f_kpi')).toHaveValue('90');
    await expect(page.locator('#dailyCarryNote')).toContainText('晚間回報');await expect(page.locator('#f_rank')).toHaveAttribute('readonly','');
  });
  test('night required errors link to controls, no write; optional fold retains exact values',async({page})=>{
    await choose(page);await page.locator('#newSeg21').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await page.locator('.btn-save-main').click();
    await expect(page.locator('#closingReportError')).toContainText('OP 上線');await expect(page.locator('#f_aq999')).toBeFocused();
    expect(await page.evaluate(()=>window.__apiCalls.some(p=>p.action==='write'))).toBe(false);
    await page.locator('#closingReportError a').filter({hasText:'OP 目標'}).click();await expect(page.locator('#f_mgmt_op_target')).toBeFocused();
    await page.locator('.daily-other summary').click();await page.locator('#f_early_renew').fill('3');await page.locator('#f_acc').fill('42.5');
    await page.locator('.daily-other summary').click();expect(await page.evaluate(()=>getFormData().early_renew)).toBe(3);expect(await page.evaluate(()=>getFormData().acc)).toBe(42.5);
    const box=await page.locator('#f_mgmt_op_target').boundingBox(),dock=await page.locator('.daily-submit-bar').boundingBox();expect(box.y+box.height).toBeLessThan(dock.y);
  });
  test('insurance/MyCharge 0 and blank preserve existing calculations and validation',async({page})=>{
    await choose(page);await page.locator('#newSeg21').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await complete(page);
    await expect(page.locator('#f_insurance_pct')).toHaveValue('50.0');await expect(page.locator('#f_mgmt_mycharge_pct')).toHaveValue('50.0');
    await page.locator('#f_insurance_num').fill('0');await page.locator('#f_insurance_den').fill('0');await expect(page.locator('#f_insurance_pct')).toHaveValue('');
    await page.locator('#f_mgmt_mycharge_clicked').fill('0');await page.locator('#f_mgmt_mycharge_tagged').fill('0');await expect(page.locator('#f_mgmt_mycharge_pct')).toHaveValue('');
    await page.locator('#f_insurance_num').fill('');await page.locator('.btn-save-main').click();await expect(page.locator('#closingReportError')).toContainText('保險分子');
    await page.locator('#f_insurance_num').fill('1');await page.locator('.btn-save-main').click();await expect(page.locator('#closingReportError')).toContainText('分子不可大於分母');
  });
  test('zero condition expands existing four fields, saves latest input through original write/read',async({page})=>{
    await choose(page);await page.locator('#newSeg21').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await complete(page,true);
    await expect(page.locator('#dailyZeroSection')).toBeVisible();await expect(page.locator('#underModal')).toBeHidden();
    await page.locator('.btn-save-main').click();await expect(page.locator('#z_reason')).toBeFocused();
    expect(await page.evaluate(()=>window.__apiCalls.filter(p=>p.action==='write').length)).toBe(0);
    for(const id of ['z_reason','z_consult','z_method','z_plan']) await page.locator('#'+id).fill('合成測試內容');
    // Changing a main field after filling notes must not submit the stale pending snapshot.
    await page.locator('#f_aq1399').fill('2');await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('已儲存');
    const writes=await page.evaluate(()=>window.__apiCalls.filter(p=>p.action==='write'));expect(writes).toHaveLength(1);
    expect(writes[0].data.aq1399).toBe(2);expect(writes[0].data.zero_reason).toBe('合成測試內容');
    expect(await page.evaluate(()=>window.__apiCalls.slice(-2).map(p=>p.action))).toEqual(['write','read']);
    await choose(page,'通化');await page.locator('#f_aq999').fill('0');await expect(page.locator('#z_reason')).toHaveValue('');
  });
  test('night readback mismatch remains failure and cannot create shadow fake success',async({page})=>{
    await choose(page);await page.locator('#newSeg21').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await complete(page);await page.evaluate(()=>window.__badReadback=true);
    await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('讀回不一致');
    expect(await page.evaluate(d=>localStorage.getItem(shadowKey(d,21)),date)).toBeNull();
  });
  test('tab/visibility return retains inputs, dock only on fill, keyboard layout simulation',async({page})=>{
    await choose(page);await page.locator('#f_aq999').fill('5');
    await page.locator('.tab-btn').filter({hasText:'彙整大盤'}).click();await expect(page.locator('.daily-submit-bar')).toBeHidden();
    await page.locator('.tab-btn.report-tab').first().click();await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect(page.locator('#f_aq999')).toHaveValue('5');
    if(width===390){await page.locator('#f_aq999').focus();await page.evaluate(()=>{window.__realVV=window.visualViewport;Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:300,addEventListener(){}}});document.getElementById('f_aq999').dispatchEvent(new FocusEvent('focusin',{bubbles:true}));});await expect(page.locator('.daily-submit-bar')).toHaveClass(/daily-keyboard-open/);}
    await page.locator('#dailyStoreToggle').focus();await page.keyboard.press('Tab');await expect(page.locator('#fillDate')).toBeFocused();
  });
  test('synthetic visual evidence: first report, night and zero; no horizontal overflow',async({page},info)=>{
    await seed(page,{date,store:'酒泉',seg:16,rank:24,kpi:88.8,aq999:3,aq1399:1,rt999:4,rt1399:2,haosu:2,insurance_num:3,insurance_den:4,insurance_pct:75});await choose(page);
    const out=process.env.EVIDENCE_DIR || info.outputDir;fs.mkdirSync(out,{recursive:true});
    // Stabilize screenshots only; keep the existing celebration animation in the shipped runtime.
    await page.addStyleTag({content:'#celebCanvas { visibility:hidden !important; }'});
    await page.evaluate(()=>scrollTo(0,0));
    const rankInput=await page.locator('#f_rank').boundingBox(),dock=await page.locator('.daily-submit-bar').boundingBox();
    expect(rankInput.y+rankInput.height).toBeLessThan(dock.y);
    await page.screenshot({path:path.join(out,'integration-'+width+'-first.png')});
    await page.locator('.daily-core').evaluate(el=>scrollTo(0,el.getBoundingClientRect().top+scrollY-document.querySelector('.site-header').getBoundingClientRect().height-14));
    await page.screenshot({path:path.join(out,'integration-'+width+'-form.png')});
    await page.locator('#newSeg21').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await complete(page);await page.locator('.daily-rank').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(out,'integration-'+width+'-night.png')});
    await page.locator('#f_aq999').fill('0');
    await page.locator('#dailyZeroSection').evaluate(el=>scrollTo(0,el.getBoundingClientRect().top+scrollY-document.querySelector('.site-header').getBoundingClientRect().height-14));
    await page.screenshot({path:path.join(out,'integration-'+width+'-zero.png')});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
});
