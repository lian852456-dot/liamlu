const {test,expect}=require('@playwright/test');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8891/';
test.beforeEach(async({page})=>{
 await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await page.goto(base+'index.html',{waitUntil:'load'});
 await page.evaluate(()=>{
  __saveCalls=[];__saved=null;__receiptMode='full';__holdVerify=false;__heldSaveReads=[];
  const valid={date:'2099-10-02',store:'酒泉',seg:21,kpi:80,rank:10,aq999:1,aq1399:1,haosu:1,rt999:1,rt1399:1,insurance_num:0,insurance_den:0,insurance_pct:null,management_focus_json:JSON.stringify({op_online:0,op_accum:0,op_target:0,mycharge_clicked:0,mycharge_tagged:0,mycharge_pct:null})};
  const original=fetch;
  fetch=async(url,options={})=>{
   if(new URL(url,location.href).origin===location.origin)return original(url,options);
   const p=JSON.parse(options.body);__saveCalls.push(p);
   if(p.action==='report_save_status')return new Response(JSON.stringify({status:'ok',schema:'report-save-v1',revision:ReportSaveRecovery.revision(__saved||valid),commitId:__saved?._report_commit_id||''}));
   if(p.action==='write'){
    __saved={...p.data,date:p.date,store:p.store,seg:p.seg,_report_commit_id:p.mutation.id,_report_committed_at:'2099-10-02T07:00:00Z'};
    __saved._report_revision=ReportSaveRecovery.revision(__saved);
    const response=new Response(JSON.stringify({status:'ok',schema:'report-save-v1',commitId:p.mutation.id,committedAt:__saved._report_committed_at,rowWritten:true,readbackMatches:true,spreadsheetId:'10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA',sheetName:'回報資料',date:p.date,store:p.store,seg:p.seg,...(__receiptMode==='full'?{readback:__saved}:{})}));
    if(__holdVerify)return new Promise(resolve=>__heldSaveReads.push({resolve:()=>resolve(response),signal:options.signal}));
    return response;
   }
   const response=new Response(JSON.stringify({status:'ok',data:{酒泉:__saved||{...valid,seg:p.seg}}}));
   return response;
  };
  document.getElementById('fillDate').value='2099-10-02';setSeg(21);selectStore('酒泉');
 });
 await expect(page.locator('.btn-save-main')).toBeEnabled();
});
for(const width of [1440,390])test(`full receipt saves without another read on ${width}px`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});
 const before=await page.evaluate(()=>__saveCalls.filter(p=>p.action==='read').length);
 await page.locator('.btn-save-main').click();await expect(page.locator('#toast')).toContainText('已儲存');
 expect(await page.evaluate(()=>__saveCalls.filter(p=>p.action==='write').length)).toBe(1);
 expect(await page.evaluate(()=>__saveCalls.filter(p=>p.action==='read').length)).toBe(before);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('saved-'+width+'.png')});
});
test('slow commit reply leaves visible unknown status and original editable input, with one write',async({page},info)=>{
 await page.clock.install();await page.evaluate(()=>{__holdVerify=true;});
 await page.locator('.btn-save-main').click();await page.waitForFunction(()=>__heldSaveReads.length===1);await page.clock.fastForward(30001);
 await expect(page.locator('#closingReportError')).toContainText('儲存結果尚未確認');await expect(page.locator('#closingReportError')).toContainText('勿直接重送');
 await expect(page.locator('#f_aq999')).toHaveValue('1');await expect(page.locator('#f_aq999')).toBeEnabled();
 expect(await page.evaluate(()=>__saveCalls.filter(p=>p.action==='write').length)).toBe(1);
 expect(await page.evaluate(()=>localStorage.getItem(shadowKey('2099-10-02',21)))).toBe(null);
 await page.evaluate(()=>__heldSaveReads[0].resolve());await expect(page.locator('#closingReportError')).toContainText('尚未確認');
 await page.setViewportSize({width:390,height:844});await page.locator('#closingReportError').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('unknown-390.png')});
});
test('summary retry and scoped mutation invalidation cannot cancel pending save confirmation',async({page})=>{
 await page.evaluate(()=>{__holdVerify=true;});await page.locator('.btn-save-main').click();await page.waitForFunction(()=>__heldSaveReads.length===1);
 await page.evaluate(()=>{
  window.__panelRetry=dailyReportReads.read({action:'read',date:'2099-10-02',seg:21},{force:true}).catch(()=>null);
  invalidateDailyReportReads('2099-10-02',21);
 });
 expect(await page.evaluate(()=>__heldSaveReads[0].signal?.aborted===true)).toBe(false);
 await page.evaluate(()=>__heldSaveReads[0].resolve());await expect(page.locator('#toast')).toContainText('已儲存');expect(await page.evaluate(()=>__saveCalls.filter(p=>p.action==='write').length)).toBe(1);
});
