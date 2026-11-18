const {test,expect}=require('@playwright/test');
const {setup}=require('./fixtures/report-save-gas.cjs'),F=require('./fixtures/insurance-progress.cjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8879/';
test.use({viewport:{width:390,height:844}});
async function install(page,source){
 const s=setup({insuranceData:()=>source}),calls=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request();if(req.url().startsWith(base))return route.continue();if(req.method()!=='POST')return route.abort();
  const p=req.postDataJSON();calls.push(p);let result;
  try{
   if(p.action==='write')result=s.api.reportWritePayload_(p);
   else if(p.action==='report_save_status')result=s.api.reportSaveStatus_(p);
   else if(p.action==='read')result={status:'ok',data:s.api.readData(p.date,p.seg),...(p.include16?{carry16:{schema:'daily-fill-pair-v1',date:p.date,seg:16,data:s.api.readData(p.date,16)}}:{})};
   else result={status:'error',message:'SYNTHETIC unavailable'};
  }catch(e){result={status:'error',message:e.message};}await route.fulfill({json:result});
 });
 await page.goto(base+'index.html');await page.locator('#fillDate').fill(F.date);
 // Synthetic authorized source, supplied only in the local route harness.
 await page.evaluate(d=>{insuranceProgressData=d;updateInsuranceConsultForm();},source);
 await page.locator('.tab-btn.report-tab').first().click();
 if(await page.locator('.store-card[data-store="台北三創"]').isHidden())await page.locator('#dailyStoreToggle').click();
 await page.locator('.store-card[data-store="台北三創"]').click();
 await expect(page.locator('.btn-save-main')).toBeEnabled();return {...s,calls,errors};
}
async function closing(page){
 for(const key of ['aq999','aq1399','haosu','rt999','rt1399'])await page.locator('#f_'+key).fill('1');
 await page.locator('#f_insurance_num').fill('10');await page.locator('#f_insurance_den').fill('10');
 for(const [key,n] of Object.entries({op_online:5,op_accum:9,op_target:14,mycharge_clicked:0,mycharge_tagged:0}))await page.locator('#f_mgmt_'+key).fill(String(n));
}
test('mobile both segments monthly low rate requires five fields despite daily 100%; save/reload and summaries use frozen provenance',async({page},info)=>{
 const source=F.data(),s=await install(page,source);
 for(const seg of [16,21]){
  await page.locator('#newSeg'+seg).click();await expect(page.locator('.btn-save-main')).toBeEnabled();
  await closing(page);await page.locator('#f_cobranded_card').fill('0');
  await expect(page.locator('#insuranceConsultSection')).toBeVisible();await expect(page.locator('#insuranceProgressStatus')).toContainText('2099-10-01');
  await page.locator('.btn-save-main').click();await expect(page.locator('#insuranceConsultError')).toContainText('請益對象');
  expect(s.calls.filter(p=>p.action==='write')).toHaveLength(seg===16?0:1);
  for(const [key,value] of Object.entries(F.values))await page.locator('#f_insurance_'+key).fill('  '+value+' '+seg+'  ');
  await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('已儲存');
  const v=JSON.parse(s.api.readData(F.date,seg)[F.store].insurance_consult_json);expect(v.progress.rate).toBe(.4);expect(v.values.advisor).toBe(F.values.advisor+' '+seg);
  await page.evaluate(()=>{insuranceProgressData.meta.storeInsuranceProgress.rows[0].rate=.8;updateInsuranceConsultForm();});await expect(page.locator('#insuranceConsultSection')).toBeVisible();
  await page.evaluate(()=>{insuranceProgressData.meta.storeInsuranceProgress.rows[0].rate=.4;});
 }
 await page.locator('#newSeg16').click();await expect(page.locator('#f_insurance_advisor')).toHaveValue(F.values.advisor+' 16');
 await page.evaluate(()=>{insuranceProgressData.meta.storeInsuranceProgress.rows[0].rate=.8;updateInsuranceConsultForm();});await expect(page.locator('#insuranceConsultSection')).toBeVisible();
 await page.locator('#insuranceConsultSection').scrollIntoViewIfNeeded();await page.addStyleTag({content:'#celebCanvas{visibility:hidden!important}'});
 await page.screenshot({path:info.outputPath('SYNTHETIC-monthly-insurance-mobile.png')});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(s.errors).toEqual([]);
});
test('50% and unverified period do not require fields; daily zero does not trigger and inactive text is not saved',async({page})=>{
 const source=F.data(.5),s=await install(page,source);await expect(page.locator('#insuranceConsultSection')).toBeHidden();
 await page.locator('#f_insurance_num').fill('0');await page.locator('#f_insurance_den').fill('10');await expect(page.locator('#insuranceConsultSection')).toBeHidden();
 await page.evaluate(()=>document.getElementById('f_insurance_advisor').value='殘留合成文字');
 await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('已儲存');expect(JSON.parse(s.api.readData(F.date,16)[F.store].insurance_consult_json).values).toEqual({});
 source.meta.storeInsuranceProgress.status='pending';source.meta.storeInsuranceProgress.cutoff=null;
 await page.evaluate(d=>{insuranceProgressData=d;},source);await page.locator('#newSeg21').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await closing(page);
 await expect(page.locator('#insuranceProgressStatus')).toContainText('統計期間待核');await expect(page.locator('#insuranceConsultSection')).toBeHidden();
 await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('已儲存');expect(JSON.parse(s.api.readData(F.date,21)[F.store].insurance_consult_json).progress.status).toBe('pending');expect(s.errors).toEqual([]);
});
