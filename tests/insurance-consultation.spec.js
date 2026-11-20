const {test,expect}=require('@playwright/test'),F=require('./fixtures/insurance-progress.cjs'),{setup}=require('./helpers/insurance-runtime.cjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8879/';
async function install(page,source=F.data(),role='employee'){
 const f=setup(source),calls=[],errors=[];if(role==='manager')f.rows.DashboardUsers[2][3]='店長';
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const req=route.request();if(req.url().startsWith(base))return route.continue();if(req.method()!=='POST')return route.abort();
  const p=req.postDataJSON();calls.push(p);await route.fulfill({json:f.handle(p)});
 });
 await page.goto(base+'insurance-consultation.html');await page.locator('[data-b-employee]').fill(role==='supervisor'?'SYNTHBOSS':'SYNTH002');await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');await page.locator('[data-b-submit]').click();await expect(page.locator('#insuranceWorkspace')).toBeVisible();return {f,calls,errors};
}
for(const width of [390,1440])test('self hero, five fields, readback and immutable daily key at '+width,async({page},info)=>{
 await page.setViewportSize({width,height:900});const s=await install(page);
 await expect(page.locator('#selfRate')).toHaveText('42.86%');await expect(page.locator('#selfState')).toHaveText('今日需回覆');await expect(page.locator('#selfCutoff')).toContainText(F.date);
 expect((await page.locator('#selfState').boundingBox()).y).toBeLessThan(350);await expect(page.locator('#insuranceList .task')).toHaveCount(1);await expect(page.locator('#insuranceList')).not.toContainText('SYNTH002');
 await expect(page.locator('#insuranceHero')).toContainText('50%');await expect(page.locator('#insuranceWeeks')).toContainText('累計 8');await expect(page.locator('#insuranceWeeks')).toContainText('累計 11');await expect(page.locator('#insuranceRewards')).toContainText('待結');
 await page.screenshot({path:info.outputPath('SYNTHETIC-self-'+width+'.png')});
 for(const [missing] of InsuranceFields()){
  for(const [key,value] of Object.entries(F.values))await page.locator('[name="'+key+'"]').fill(key===missing?'  ':value);
  await page.locator('#insuranceSubmit').click();await expect(page.locator('#insuranceError')).toContainText('請填寫');
 }
 expect(s.calls.filter(p=>p.action==='employee_insurance_submit')).toHaveLength(0);
 for(const [key,value] of Object.entries(F.values))await page.locator('[name="'+key+'"]').fill(' '+value+' ');
 await page.locator('#insuranceSubmit').click();await expect(page.locator('#selfState')).toHaveText('已完成');await expect(page.locator('#insuranceMessage')).toContainText('讀回確認');expect(s.f.fileWrites).toBe(1);
 await page.locator('#insuranceRefresh').click();await expect(page.locator('#selfState')).toHaveText('已完成');await expect(page.locator('[name="advisor"]')).toHaveValue(F.values.advisor);await expect(page.locator('[name="advisor"]')).toHaveAttribute('readonly','');
 expect(s.calls.some(p=>['employee_kpi_read','employee_dashboard_read','write','pwrite'].includes(p.action))).toBe(false);expect(s.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(!await page.locator('[data-b-logout]').isVisible())await page.locator('#insuranceLogin .b-options > summary').click();await page.locator('[data-b-logout]').click();await expect(page.locator('#selfRate')).toHaveText('—');await expect(page.locator('#insuranceWorkspace')).toBeHidden();
});
function InsuranceFields(){return Object.keys(F.values).map(k=>[k]);}
test('personal 42.857% and same-store 50% are independent; pending store does not block personal',async({page})=>{
 const source=F.data();source.meta.insuranceConsultationSource.stores.status='pending';source.meta.insuranceConsultationSource.stores.cutoff=null;
 const s=await install(page,source,'manager');await expect(page.locator('#selfState')).toHaveText('今日需回覆');await expect(page.locator('[data-kind="store"]')).toContainText('資料待核');await expect(page.locator('#insuranceForm')).toBeVisible();expect(s.errors).toEqual([]);
});
test('personal exactly 50% exempt and missing rate pending, no five fields',async({page})=>{
 const s=await install(page,F.data(.5));await expect(page.locator('#selfState')).toHaveText('達標免回覆');await expect(page.locator('#insuranceForm')).toBeHidden();
 s.f.source=F.data(null);await page.locator('#insuranceRefresh').click();await expect(page.locator('#selfState')).toHaveText('資料待核');await expect(page.locator('#insuranceForm')).toBeHidden();expect(s.f.fileWrites).toBe(0);
});
test('general store and personal forms are compact and have no insurance-consultation gate',async({page},info)=>{
 await page.setViewportSize({width:390,height:900});const {setup:reportSetup}=require('./fixtures/report-save-gas.cjs'),r=reportSetup();
 await page.route('**/*',async route=>{const req=route.request();if(req.url().startsWith(base))return route.continue();if(req.method()!=='POST')return route.abort();const p=req.postDataJSON();let result={status:'error'};if(p.action==='read')result={status:'ok',data:{},...(p.include16?{carry16:{schema:'daily-fill-pair-v1',date:p.date,seg:16,data:{}}}:{})};if(p.action==='report_save_status')result=r.api.reportSaveStatus_(p);if(p.action==='write')result=r.api.reportWritePayload_(p);await route.fulfill({json:result});});
 await page.goto(base+'index.html');await page.locator('.tab-btn.report-tab').first().click();await page.locator('.store-card[data-store="台北三創"]').click();await expect(page.locator('.btn-save-main')).toBeEnabled();
 await expect(page.locator('#insuranceConsultSection')).toHaveCount(0);await expect(page.locator('a[href="insurance-consultation.html"]')).toBeVisible();
 for(const seg of [16,21]){await page.locator('#newSeg'+seg).click();await expect(page.locator('.btn-save-main')).toBeEnabled();for(const key of ['aq999','aq1399','haosu','rt999','rt1399'])await page.locator('#f_'+key).fill('1');await page.locator('#f_insurance_num').fill('0');await page.locator('#f_insurance_den').fill('10');for(const [k,v]of Object.entries({op_online:5,op_accum:9,op_target:14,mycharge_clicked:0,mycharge_tagged:0}))await page.locator('#f_mgmt_'+k).fill(String(v));await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('已儲存');}
 await page.reload();await page.locator('.tab-btn.report-tab').first().click();await page.locator('.store-card[data-store="台北三創"]').click();await page.locator('.daily-core').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('SYNTHETIC-general-store-mobile.png')});
 const a=await page.locator('#f_aq999').boundingBox(),b=await page.locator('#f_aq1399').boundingBox();expect(Math.abs(a.y-b.y)).toBeLessThan(2);expect(a.height).toBeLessThanOrEqual(48);
 await page.getByRole('button',{name:/個人追蹤/}).click();await page.locator('#personalStore').selectOption('台北三創');await page.locator('#personalName').fill('合成同仁');
 await expect(page.locator('#personalFormSection')).toBeVisible();const c=await page.locator('#p_kpi').boundingBox(),d=await page.locator('#p_achieve').boundingBox();expect(Math.abs(c.y-d.y)).toBeLessThan(2);expect(d.x).toBeGreaterThan(c.x);const hs=await page.locator('#p_haosu').boundingBox(),card=await page.locator('#p_cobranded_card').boundingBox();expect(Math.abs(hs.y-card.y)).toBeLessThan(2);
 await page.locator('#personalFormSection').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('SYNTHETIC-general-personal-mobile.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:1440,height:900});const desktop=await page.locator('#p_achieve').boundingBox(),third=await page.locator('#p_a999').boundingBox();expect(Math.abs(desktop.y-third.y)).toBeLessThan(2);await page.screenshot({path:info.outputPath('SYNTHETIC-general-personal-desktop.png')});
 await page.locator('.tab-btn.report-tab').first().click();await page.locator('.daily-core').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('SYNTHETIC-general-store-desktop.png')});
});
