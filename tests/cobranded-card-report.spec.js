const {test,expect}=require('@playwright/test');
const {setup}=require('./fixtures/report-save-gas.cjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8877/';
const date='2099-10-02',store='台北三創',name='合成同仁';
test.use({viewport:{width:390,height:844}});
async function install(page){
 const {api}=setup(),calls=[],errors=[];const control={denyPeople:false};
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request();if(req.url().startsWith(base))return route.continue();
  if(req.method()!=='POST')return route.abort();
  const p=req.postDataJSON();calls.push(p);let result;
  try{
   if(p.action==='report_save_status')result=api.reportSaveStatus_(p);
   else if(p.action==='write')result=api.reportWritePayload_(p);
   else if(p.action==='pwrite')result=api.personalWritePayload_(p);
   else if(p.action==='read')result={status:'ok',data:api.readData(p.date,p.seg),...(p.include16?{carry16:{schema:'daily-fill-pair-v1',date:p.date,seg:16,data:api.readData(p.date,16)}}:{})};
   else if(p.action==='pread')result=control.denyPeople?{status:'error',code:'AUTH_DENIED',message:'synthetic denied'}:{status:'ok',data:api.readPersonal(p.date,p.seg)};
   else result={status:'error',message:'synthetic unavailable'};
  }catch(e){result={status:'error',message:e.message};}
  await route.fulfill({json:result});
 });
 await page.goto(base+'index.html');
 await page.locator('#fillDate').fill(date);
 return {api,calls,errors,control};
}
async function selectStore(page,seg){
 await page.locator('.tab-btn.report-tab').first().click();
 if(await page.locator('.store-card[data-store="台北三創"]').isHidden())await page.locator('#dailyStoreToggle').click();
 await page.locator('.store-card[data-store="台北三創"]').click();await page.locator('#newSeg'+seg).click();
 await expect(page.locator('.btn-save-main')).toBeEnabled();
}
async function closing(page){
 for(const key of ['aq999','aq1399','haosu','rt999','rt1399'])await page.locator('#f_'+key).fill('1');
 for(const key of ['insurance_num','insurance_den'])await page.locator('#f_'+key).fill('0');
 for(const [key,n] of Object.entries({op_online:5,op_accum:9,op_target:14,mycharge_clicked:0,mycharge_tagged:0}))await page.locator('#f_mgmt_'+key).fill(String(n));
}
test('mobile store 16/21 saves and reloads blank/zero/count with independent OP 14 and card 3 target',async({page},info)=>{
 const s=await install(page);
 for(const seg of [16,21]){
  await selectStore(page,seg);if(seg===21)await closing(page);
  for(const value of ['0','2','']){
   await page.locator('#f_cobranded_card').fill(value);await page.locator('.btn-save-main').click();
   await expect(page.locator('#toast')).toContainText('已儲存');
   expect(s.api.readData(date,seg)[store].cobranded_card).toBe(value===''?'':Number(value));
   await expect(page.locator('#filledSummary')).toContainText(`聯名卡上線數 ${value===''?'未提供':value} / 3 張`);
  }
  const count=s.calls.filter(p=>p.action==='write').length;
  for(const bad of ['-1','1.5']){await page.locator('#f_cobranded_card').fill(bad);await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('非負整數');}
  expect(s.calls.filter(p=>p.action==='write')).toHaveLength(count);
  await page.locator('#f_cobranded_card').fill('2');await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('已儲存');
 }
 const saved=s.api.readData(date,21)[store];expect(JSON.parse(saved.management_focus_json)).toMatchObject({op_online:5,op_accum:9,op_target:14});expect(saved.cobranded_card).toBe(2);
 await page.reload();await page.locator('#fillDate').fill(date);await selectStore(page,21);
 await expect(page.locator('#f_cobranded_card')).toHaveValue('2');await expect(page.locator('#f_mgmt_op_target')).toHaveValue('14');
 await expect(page.locator('#cardStoreTarget')).toContainText('固定 3 張');
 await page.locator('#f_mgmt_op_target').fill('');await page.locator('.btn-save-main').click();await expect(page.locator('#closingReportError')).toContainText('OP 目標');
 await page.locator('#f_cobranded_card').scrollIntoViewIfNeeded();await page.addStyleTag({content:'#celebCanvas{visibility:hidden!important}'});await page.screenshot({path:info.outputPath('SYNTHETIC-store-card.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(s.errors).toEqual([]);
});
test('mobile personal card zero stays on original pass route, both segments read back and old absence stays unavailable',async({page},info)=>{
 const s=await install(page);
 await page.getByRole('button',{name:/個人追蹤/}).click();
 await page.locator('#personalStore').selectOption(store);await page.locator('#personalName').fill(name);
 for(const seg of [16,21]){
  await page.locator('#pSeg'+seg).click();
  for(const key of ['a999','haosu','r1399','achieve'])await page.locator('#p_'+key).fill('1');await page.locator('#p_insurance').fill('80');
  for(const value of ['0','4','']){
   await page.locator('#p_cobranded_card').fill(value);await page.getByRole('button',{name:'✅ 確認送出',exact:true}).click();
   await expect(page.locator('#toast')).toContainText('個人回報已確認儲存至雲端');
   const record=s.api.readPersonal(date,seg)[store][name];expect(record.data.cobranded_card).toBe(value===''?'':Number(value));expect(record.failed).toEqual([]);
   await expect(page.locator('#personalFailSection')).toBeHidden();
  }
 }
 const count=s.calls.filter(p=>p.action==='pwrite').length;
 await page.locator('#p_cobranded_card').fill('-1');await page.getByRole('button',{name:'✅ 確認送出',exact:true}).click();await expect(page.locator('#toast')).toContainText('非負整數');expect(s.calls.filter(p=>p.action==='pwrite')).toHaveLength(count);
 const historical=await page.evaluate(()=>_renderTodayCard({data:{a999:1},failed:[],extra:{},cloudState:'confirmed'},16));expect(historical).toContain('聯名卡上線數 <strong>未提供</strong>');
 await expect(page.locator('#personalFormSection')).not.toContainText('目標 3');
 await page.locator('#p_cobranded_card').fill('0');await page.locator('#p_cobranded_card').scrollIntoViewIfNeeded();await page.addStyleTag({content:'#celebCanvas{visibility:hidden!important}'});await page.screenshot({path:info.outputPath('SYNTHETIC-person-card.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(s.errors).toEqual([]);
});
test('supervisor summary uses only selected store segment; original personal access denial hides the count',async({page})=>{
 const s=await install(page);
 for(const seg of [16,21]){
  s.api.reportWritePayload_({action:'write',date,store,seg,data:{cobranded_card:seg===16?2:3}});
  s.api.personalWritePayload_({action:'pwrite',date,store,seg,name,record:{date,store,seg,name,data:{cobranded_card:20},failed:[],extra:{}}});
 }
 await page.getByRole('button',{name:/彙整大盤/}).click();await page.locator('#sumDate').fill(date);
 await expect(page.locator('[data-cobranded-total]')).toHaveText('2 張');
 await page.locator('#sumSeg21').click();await expect(page.locator('[data-cobranded-total]')).toHaveText('3 張');
 await expect(page.locator('[data-summary-store="台北三創"] .sum-metrics')).toContainText('3 / 3');
 await expect(page.locator('#summaryCards')).toContainText('涵蓋 1 / 9 店');
 await page.locator('#panel-summary [data-summary-group="consult"]').click();
 await expect(page.locator('[data-summary-store="台北三創"] .sum-person')).toContainText('聯名卡上線數：20 張');
 await expect(page.locator('[data-cobranded-total]')).toHaveText('3 張');
 s.control.denyPeople=true;await page.locator('#sumSeg16').click();
 await expect(page.locator('#panel-summary')).toContainText('個人明細未取得或權限失效');
 await expect(page.locator('#panel-summary')).not.toContainText('聯名卡上線數：20 張');expect(s.errors).toEqual([]);
});
