const {test,expect}=require('@playwright/test');
const {install}=require('./fixtures/daily-report-summary-synthetic.cjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8881/';
for(const width of [390,1440])test.describe(`pending edit ${width}`,()=>{
 test.use({viewport:{width,height:844}});
 test.beforeEach(async({page})=>{
  page.__errors=[];page.__external=[];
  page.on('pageerror',e=>page.__errors.push(e.message));
  page.on('request',r=>{if(!r.url().startsWith(base))page.__external.push(new URL(r.url()).hostname);});
  await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  await page.addInitScript(install);await page.goto(base+'index.html',{waitUntil:'load'});
  await page.evaluate(()=>__holdRead=true);
 });
 test.afterEach(async({page})=>{expect(page.__errors).toEqual([]);expect(page.__external).toEqual([]);expect(await page.evaluate(()=>__summaryCalls.filter(p=>['write','pwrite'].includes(p.action)).length)).toBe(0);});
 const select=async page=>{await page.locator('.store-card[data-store="酒泉"]').click();await page.waitForFunction(()=>__heldReads.length===1);};
 const release=async(page,index=0)=>{await page.evaluate(i=>__heldReads[i].release(),index);await expect(page.locator('.btn-save-main')).toBeEnabled();};
 test('can type before reply; UI and direct save remain gated; untouched server fields survive',async({page})=>{
  await select(page);await expect(page.locator('#f_aq999')).toBeEnabled();await expect(page.locator('.btn-save-main')).toBeDisabled();
  await page.locator('#f_aq999').fill('55');await page.evaluate(async()=>{await saveData();await _doSave('酒泉','2099-10-02',getFormData());});
  expect(await page.evaluate(()=>__summaryCalls.length)).toBe(1);await release(page);
  await expect(page.locator('#f_aq999')).toHaveValue('55');await expect(page.locator('#f_rt999')).toHaveValue('2');await expect(page.locator('#f_rank')).toHaveValue('21');
 });
 test('explicit zero and blank edits survive late nonempty data',async({page})=>{
  await select(page);await page.locator('#f_aq999').fill('0');await page.locator('#f_aq1399').fill('8');await page.locator('#f_aq1399').fill('');
  await release(page);await expect(page.locator('#f_aq999')).toHaveValue('0');await expect(page.locator('#f_aq1399')).toHaveValue('');
 });
 test('management and rate edits merge without dropping untouched saved fields',async({page})=>{
  await select(page);await page.locator('#f_mgmt_mycharge_clicked').fill('1');await page.locator('#f_mgmt_mycharge_tagged').fill('4');
  await page.locator('#f_insurance_num').fill('1');await page.locator('#f_insurance_den').fill('4');await release(page);
  await expect(page.locator('#f_mgmt_mycharge_pct')).toHaveValue('25.0');await expect(page.locator('#f_insurance_pct')).toHaveValue('25.0');await expect(page.locator('#f_mgmt_op_target')).toHaveValue('20');
 });
 test('pending drafts stay with the store and reuse one physical read',async({page})=>{
  await select(page);await page.locator('#f_aq999').fill('55');await page.evaluate(()=>selectStore('萬大'));await expect(page.locator('#f_aq999')).toHaveValue('');await page.locator('#f_aq999').fill('66');
  await page.evaluate(()=>selectStore('酒泉'));await expect(page.locator('#f_aq999')).toHaveValue('55');expect(await page.evaluate(()=>__summaryCalls.length)).toBe(1);
  await release(page);await expect(page.locator('#f_aq999')).toHaveValue('55');await page.evaluate(()=>selectStore('萬大'));await expect(page.locator('.btn-save-main')).toBeEnabled();await expect(page.locator('#f_aq999')).toHaveValue('66');
 });
 test('date ABA cannot overwrite pending drafts with stale responses',async({page})=>{
  await select(page);await page.locator('#f_aq999').fill('55');
  await page.evaluate(()=>{document.getElementById('fillDate').value='2099-10-01';selectStore('酒泉');});await page.waitForFunction(()=>__heldReads.length===2);await page.locator('#f_aq999').fill('66');
  await page.evaluate(()=>{document.getElementById('fillDate').value='2099-10-02';selectStore('酒泉');});await page.waitForFunction(()=>__heldReads.length===3);await expect(page.locator('#f_aq999')).toHaveValue('55');
  await page.evaluate(()=>{__heldReads[0].release();__heldReads[1].release();});await expect(page.locator('.btn-save-main')).toBeDisabled();await expect(page.locator('#f_aq999')).toHaveValue('55');await release(page,2);await expect(page.locator('#f_aq999')).toHaveValue('55');
 });
 test('16/21 drafts are isolated and carry stays locked until both reads verify',async({page})=>{
  await select(page);await page.locator('#f_rank').fill('88');await page.locator('#f_aq999').fill('55');await page.locator('#newSeg21').click();await page.waitForFunction(()=>__heldReads.length===2);
  await expect(page.locator('#f_rank')).toBeDisabled();await expect(page.locator('#f_rank')).toHaveAttribute('readonly','');await page.locator('#f_aq999').fill('66');
  await page.evaluate(()=>__heldReads.find(r=>r.payload.seg===21).release());await expect(page.locator('.btn-save-main')).toBeDisabled();await expect(page.locator('#f_aq999')).toHaveValue('66');
  await page.evaluate(()=>__heldReads.find(r=>r.payload.seg===16).release());await expect(page.locator('.btn-save-main')).toBeEnabled();await expect(page.locator('#f_aq999')).toHaveValue('66');await expect(page.locator('#f_rank')).toHaveValue('21');
  await page.locator('#newSeg16').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await expect(page.locator('#f_rank')).toHaveValue('88');await expect(page.locator('#f_aq999')).toHaveValue('55');expect(await page.evaluate(()=>__summaryCalls.length)).toBe(2);
 });
 test('timeout preserves editable local draft; manual retry never resends a write',async({page})=>{
  await page.clock.install({time:new Date('2099-10-02T07:00:00Z')});await select(page);await page.locator('#f_aq999').fill('55');await page.clock.fastForward(30001);
  await expect(page.locator('#dailyReadRetry')).toBeVisible();await expect(page.locator('.btn-save-main')).toBeDisabled();await expect(page.locator('#f_aq999')).toBeEnabled();await page.locator('#f_aq999').fill('56');await page.evaluate(()=>saveData());
  await page.evaluate(()=>__heldReads[0].release());await expect(page.locator('#f_aq999')).toHaveValue('56');await page.locator('#dailyReadRetry').click();await page.waitForFunction(()=>__heldReads.length===2);await expect(page.locator('#f_aq999')).toHaveValue('56');await release(page,1);await expect(page.locator('#f_aq999')).toHaveValue('56');
 });
 test('login reset clears pending local edits and ignores abandoned response',async({page})=>{
  await select(page);await page.locator('#f_aq999').fill('55');await page.evaluate(()=>dispatchEvent(new Event('portal-login-changed')));await page.evaluate(()=>__heldReads[0].release());
  await expect(page.locator('#fillFormArea')).toBeHidden();await expect(page.locator('#f_aq999')).toHaveValue('');await page.locator('.store-card[data-store="酒泉"]').click();await page.waitForFunction(()=>__heldReads.length===2);await release(page,1);await expect(page.locator('#f_aq999')).toHaveValue('1');
 });
 test('clear while pending remains explicit blanks after the saved row returns',async({page})=>{
  await select(page);await page.locator('#f_aq999').fill('55');await page.evaluate(()=>clearForm());await release(page);await expect(page.locator('#f_aq999')).toHaveValue('');await expect(page.locator('#f_rank')).toHaveValue('');await expect(page.locator('#dailyDraftNote')).toBeVisible();
 });
});
