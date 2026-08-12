const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fixture=require('./fixtures/half-month-hread-fixture.cjs');

const APP_URL=`file://${path.resolve(__dirname,'../app.html')}#patrol`;
const TOKEN='formal-write-short-token';
test.use({viewport:{width:390,height:844},serviceWorkers:'block'});

async function install(page,{mismatch=false}={}){
  const state={rows:fixture.rows.map(row=>({...row})),writes:[],hreads:0,media:0};
  await page.route('https://script.google.com/**',async route=>{
    const request=route.request();
    if(request.method()==='POST'){
      const payload=JSON.parse(request.postData()||'{}');
      if(payload.action==='ptauth') return route.fulfill({json:{status:'ok',token:TOKEN,expiresIn:1800}});
      if(payload.action==='ptlogout') return route.fulfill({json:{status:'ok'}});
      return route.fulfill({json:{status:'error',message:'unexpected POST'}});
    }
    const url=new URL(request.url());
    const action=url.searchParams.get('action')||'';
    if(action==='sread') return route.fulfill({json:{status:'ok',schedule:{month:'2026-08',stores:[]}}});
    if(action==='ptread') return route.fulfill({json:{status:'ok',stores:fixture.STORES.map(name=>({name})),rows:[]}});
    if(action==='ptvisit_read') return route.fulfill({json:{status:'ok',events:[{serverTime:'2026-08-12T09:12:00+08:00',date:'2026-08-12',action:'arrival',store:'酒泉',visitSessionId:'open'}],openVisit:{serverTime:'2026-08-12T09:12:00+08:00',date:'2026-08-12',action:'arrival',store:'酒泉',visitSessionId:'open'}}});
    if(action==='hread'){
      state.hreads+=1;
      const rows=state.rows.map(row=>({...row}));
      if(mismatch&&state.writes.length) rows.find(row=>row.store==='六張犁'&&Number(row.item)===6).improvement='server mismatch';
      return route.fulfill({json:{status:'ok',rows}});
    }
    if(action==='hwrite'){
      const incoming=JSON.parse(url.searchParams.get('payload')||'[]');
      const callback=url.searchParams.get('callback')||'';
      state.writes.push(incoming.map(row=>({...row})));
      for(const row of incoming){
        const index=state.rows.findIndex(current=>current.month===row.month&&current.period===row.period&&current.store===row.store&&Number(current.item)===Number(row.item));
        const next={...row,savedAt:'2026-08-12T10:00:00+08:00'};
        if(index>=0) state.rows[index]=next; else state.rows.push(next);
      }
      return route.fulfill({contentType:'application/javascript',body:`${callback}(${JSON.stringify({status:'ok',written:incoming.length})});`});
    }
    if(action==='half_media_upload'){ state.media+=1; return route.fulfill({json:{status:'error',message:'forbidden'}}); }
    return route.fulfill({json:{status:'error',message:`unexpected ${action}`}});
  });
  return state;
}

async function openForm(page){
  await page.goto(APP_URL);
  await page.evaluate(token=>sessionStorage.setItem('bei12b_pt_session_token',token),TOKEN);
  await page.reload();
  expect(await page.evaluate(()=>sessionStorage.getItem('bei12b_pt_session_token'))).toBe(TOKEN);
  await page.locator('[data-patrol-check-view="half-month"]').click();
  const start=page.locator('[data-half-preview-action="start"]');
  await expect(start,await page.locator('#halfMonthCheckPreview').innerText()).toBeEnabled();
  await start.click();
}

test('openVisit only preselects and explicit save writes then verifies hread parity',async({page})=>{
  const state=await install(page);
  await openForm(page);
  await expect(page.locator('#halfMonthStore')).toHaveValue('酒泉');
  expect(state.writes).toHaveLength(0);
  await page.locator('#halfMonthStore').selectOption('六張犁');
  await page.locator('#halfMonthInspector').fill('督導');
  await page.locator('[data-half-preview-question="6"] [data-half-answer="abnormal"]').click();
  await page.locator('[data-half-preview-question="6"] [data-half-note]').fill('正式異常原文');
  await page.locator('[data-half-preview-question="6"] [data-half-improvement]').fill('正式改善方式');
  await page.locator('[data-half-preview-action="save"]').click();
  await expect(page.locator('#halfMonthPreviewMessage')).toContainText('已儲存，並完成正式 hread 逐欄核對');
  expect(state.writes.length).toBeGreaterThan(0);
  expect(state.hreads).toBe(2);
  expect(state.media).toBe(0);
  const written=state.writes.flat();
  expect(written).toHaveLength(18);
  expect(written.find(row=>row.item===6)).toMatchObject({store:'六張犁',period:'H1',result:'abnormal',note:'正式異常原文',improvement:'正式改善方式'});
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,short:Array.from(document.querySelectorAll('[data-view="patrol"] button')).filter(button=>button.getBoundingClientRect().width>0&&button.getBoundingClientRect().height<44).map(button=>button.textContent.trim())}));
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.short).toEqual([]);
});

test('readback mismatch is a visible failure and never reports success',async({page})=>{
  await install(page,{mismatch:true});
  await openForm(page);
  await page.locator('#halfMonthStore').selectOption('六張犁');
  await page.locator('#halfMonthInspector').fill('督導');
  await page.locator('[data-half-preview-question="6"] [data-half-answer="abnormal"]').click();
  await page.locator('[data-half-preview-question="6"] [data-half-note]').fill('正式異常原文');
  await page.locator('[data-half-preview-question="6"] [data-half-improvement]').fill('正式改善方式');
  await page.locator('[data-half-preview-action="save"]').click();
  await expect(page.locator('#halfMonthPreviewMessage')).toContainText('儲存失敗：寫後讀回不一致');
  await expect(page.locator('#halfMonthPreviewMessage')).not.toContainText('已儲存');
});

test('repeat save updates the same 18 business keys without touching another store or period',async({page})=>{
  const state=await install(page);
  const untouched=state.rows.filter(row=>row.store==='酒泉'||row.period==='H2').map(row=>JSON.stringify(row));
  await openForm(page);
  await page.locator('#halfMonthStore').selectOption('六張犁');
  await page.locator('#halfMonthInspector').fill('督導');
  await page.locator('[data-half-preview-action="save"]').click();
  await expect(page.locator('#halfMonthPreviewMessage')).toContainText('已儲存');
  await page.locator('[data-half-preview-action="save"]').click();
  await expect(page.locator('#halfMonthPreviewMessage')).toContainText('已儲存');
  const keys=state.rows.filter(row=>row.store==='六張犁'&&row.period==='H1').map(row=>`${row.period}|${row.store}|${row.item}`);
  expect(new Set(keys).size).toBe(keys.length);
  expect(state.rows.filter(row=>row.store==='酒泉'||row.period==='H2').map(row=>JSON.stringify(row))).toEqual(untouched);
});
