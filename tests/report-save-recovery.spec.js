const {test,expect}=require('@playwright/test');
const {setup}=require('./fixtures/report-save-gas.cjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8891/';
const date='2099-10-02',store='酒泉';
async function install(page) {
  const {api}=setup();const state={calls:[],lost:false,offline:false,hold:false,held:[],errors:[],readFail:false};
  page.on('pageerror',e=>state.errors.push(e.message));
  await page.route('**/*',async route=>{
    const request=route.request();if(request.url().startsWith(base))return route.continue();
    if(request.method()!=='POST')return route.abort();
    const p=request.postDataJSON();state.calls.push(p);
    if(state.offline)return route.abort();
    let result;
    try {
      if(p.action==='read') {
        if(state.readFail)throw new Error('synthetic read unavailable');
        result={status:'ok',data:api.readData(p.date,p.seg)};
        if(p.include16)result.carry16={schema:'daily-fill-pair-v1',date:p.date,seg:16,data:api.readData(p.date,16)};
      } else if(p.action==='pread')result={status:'ok',data:api.readPersonal(p.date,p.seg)};
      else if(p.action==='report_save_status')result=api.reportSaveStatus_(p);
      else if(p.action==='write'||p.action==='pwrite'){
        result=p.action==='write'?api.reportWritePayload_(p):api.personalWritePayload_(p);
        if(state.lost){state.lost=false;return route.abort();}
        if(state.hold){state.held.push(()=>route.fulfill({json:result}));return;}
      }else throw new Error('unexpected test action '+p.action);
    }catch(error){result={status:'error',message:error.message};}
    await route.fulfill({json:result});
  });
  await page.goto(base+'index.html');
  await page.evaluate(d=>{document.getElementById('fillDate').value=d;},date);
  state.api=api;return state;
}
async function select(page){await page.locator('.store-card[data-store="酒泉"]').click();await expect(page.locator('.btn-save-main')).toBeEnabled();}
const writes=s=>s.calls.filter(p=>p.action==='write'||p.action==='pwrite');
for(const width of [390,1440])test(`store draft recovers after reload and confirms one cloud commit at ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:844});const s=await install(page);await select(page);
 await page.locator('#f_aq999').fill('7');await page.reload();await page.evaluate(d=>document.getElementById('fillDate').value=d,date);await select(page);
 await expect(page.locator('#f_aq999')).toHaveValue('7');await expect(page.locator('#dailyDraftNote')).toContainText('尚未送至雲端');
 await page.locator('.btn-save-main').click();await expect(page.locator('#reportSaveStatus')).toContainText('已確認儲存至雲端');
 expect(writes(s)).toHaveLength(1);expect(s.api.readData(date,16)[store].aq999).toBe(7);await expect(page.locator('#dailyDraftNote')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(s.errors).toEqual([]);
 await page.screenshot({path:info.outputPath(`store-confirmed-${width}.png`),fullPage:false});
});
test('initial read failure retains draft through reload and read retry sends no write',async({page})=>{
 const s=await install(page);s.readFail=true;await page.locator('.store-card[data-store="酒泉"]').click();await expect(page.locator('#dailyReadRetry')).toBeVisible();
 await page.locator('#f_aq999').fill('5');await page.reload();await page.evaluate(d=>document.getElementById('fillDate').value=d,date);await page.locator('.store-card[data-store="酒泉"]').click();await expect(page.locator('#f_aq999')).toHaveValue('5');
 s.readFail=false;await page.locator('#dailyReadRetry').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await expect(page.locator('#f_aq999')).toHaveValue('5');expect(writes(s)).toHaveLength(0);expect(s.errors).toEqual([]);
});
test('lost reply survives reload and confirmation never sends another write',async({page})=>{
 const s=await install(page);await select(page);await page.locator('#f_aq999').fill('3');s.lost=true;await page.locator('.btn-save-main').click();await expect(page.locator('#reportSaveStatus')).toContainText('尚未確認');
 await page.reload();await page.evaluate(d=>document.getElementById('fillDate').value=d,date);await select(page);await page.getByRole('button',{name:'確認／重試原送出'}).click();
 await expect(page.locator('#reportSaveStatus')).toContainText('已確認儲存至雲端');expect(writes(s)).toHaveLength(1);expect(s.errors).toEqual([]);
});
test('duplicate clicks and later edits cannot be cleared by an earlier completion',async({page})=>{
 const s=await install(page);await select(page);await page.locator('#f_aq999').fill('3');s.hold=true;
 await page.evaluate(()=>{_doSave('酒泉','2099-10-02',getFormData());_doSave('酒泉','2099-10-02',getFormData());});await expect.poll(()=>s.held.length).toBe(1);
 await page.locator('#f_aq999').fill('9');await s.held[0]();await expect(page.locator('#reportSaveStatus')).toContainText('已確認儲存至雲端');await expect(page.locator('#f_aq999')).toHaveValue('9');await expect(page.locator('#dailyDraftNote')).toBeVisible();expect(writes(s)).toHaveLength(1);expect(s.errors).toEqual([]);
});
test('a second intentional save uses the committed revision, and a stale draft requires review',async({page})=>{
 const s=await install(page);await select(page);await page.locator('#f_aq999').fill('2');await page.locator('.btn-save-main').click();await expect(page.locator('#reportSaveStatus')).toContainText('已確認儲存');
 await page.locator('#f_aq999').fill('4');await expect(page.locator('#reportSaveStatus')).toContainText('尚未送出');await page.locator('.btn-save-main').click();await expect(page.locator('#reportSaveStatus')).toContainText('已確認儲存');expect(writes(s)).toHaveLength(2);
 await page.locator('#f_aq999').fill('8');s.api.reportWritePayload_({action:'write',date,store,seg:16,data:{aq999:9}});
 await page.locator('.btn-save-main').click();await expect(page.locator('#reportSaveStatus')).toContainText('未覆蓋');expect(writes(s)).toHaveLength(2);
 await page.getByRole('button',{name:'保留草稿備份，讀取雲端版本'}).click();await expect(page.locator('#f_aq999')).toHaveValue('9');await page.getByRole('button',{name:'取回衝突草稿供核對'}).click();await expect(page.locator('#f_aq999')).toHaveValue('8');expect(writes(s)).toHaveLength(2);expect(s.errors).toEqual([]);
});
test('the reported read-success screen never claims that a new edit has been submitted',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const s=await install(page);
 s.api.reportWritePayload_({action:'write',date,store:'六張犁',seg:16,data:{kpi:100,rank:1}});
 await page.locator('.store-card[data-store="六張犁"]').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await page.locator('#f_kpi').fill('100');
 await page.evaluate(()=>{reportConnectionDisplay={status:'ready',endpoint:GAS_URL,date:'2099-10-02',seg:16,readAt:'21:32'};updateConnectionBadge();});
 await expect(page.locator('#connBadge')).toHaveText('🟢 已讀取雲端資料');await expect(page.locator('#filledSummary')).toContainText('本次修改請另確認儲存');await expect(page.locator('#reportSaveStatus')).toContainText('尚未送出');
 expect(writes(s)).toHaveLength(0);expect(s.errors).toEqual([]);await page.screenshot({path:info.outputPath('read-is-separate-from-submit-390.png'),fullPage:false});
});
test('personal draft and failed upload expose recovery, with immutable segment and identity',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const s=await install(page);
 await page.locator(".tab-btn[onclick=\"switchTab('personal')\"]").click();await page.waitForFunction(()=>document.getElementById('personalStore').options.length>1);
 await page.evaluate(()=>{document.getElementById('personalStore').value='酒泉';document.getElementById('personalName').value='合成同仁';onPersonalNameChange();});
 for(const [id,value]of Object.entries({p_a999:'1',p_haosu:'1',p_r1399:'1',p_achieve:'1',p_insurance:'80'}))await page.locator('#'+id).fill(value);
 await page.reload();await page.locator(".tab-btn[onclick=\"switchTab('personal')\"]").click();await page.waitForFunction(()=>document.getElementById('personalStore').options.length>1);
 await page.evaluate(d=>{document.getElementById('fillDate').value=d;document.getElementById('personalStore').value='酒泉';document.getElementById('personalName').value='合成同仁';onPersonalNameChange();},date);
 await expect(page.locator('#p_a999')).toHaveValue('1');s.lost=true;await page.getByRole('button',{name:'✅ 確認送出',exact:true}).click();await expect(page.locator('#personalFailSavedStatus')).toContainText('尚未確認');
 await page.getByRole('button',{name:'確認／重試原送出'}).click();await expect(page.locator('#personalFailSavedStatus')).toContainText('已確認儲存至雲端');expect(writes(s)).toHaveLength(1);
 expect(s.api.readPersonal(date,16)[store]['合成同仁'].data.a999).toBe(1);await page.locator('#personalFailSavedStatus').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('personal-recovery-390.png'),fullPage:false});
 await page.locator('#pSeg21').click();await expect(page.locator('#p_a999')).toHaveValue('');expect(s.errors).toEqual([]);
});
