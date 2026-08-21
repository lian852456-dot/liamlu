const { test, expect } = require('@playwright/test');
const path = require('node:path');

const PAGE_URL=process.env.TEST_BASE_URL
  ? new URL('audit-report.html',process.env.TEST_BASE_URL).href
  : 'file://'+path.resolve(__dirname,'../audit-report.html');
const STORES=[
  ['DNB10062','台北酒泉'],['DNB10082','台北永吉'],['DNB10094','台北復興南'],['DNB10146','台北杭州南'],['DNB10168','台北萬大'],['DNB10174','台北通化'],['DNB10284','台北大稻埕'],['DNB10307','台北三創'],['DNB10440','台北六張犁']
].map(([store_id,store_name])=>({store_id,store_name}));
const ITEMS=[
  {item_id:'island_display',item_name:'中島、展示機環境清潔'},
  {item_id:'op_zone',item_name:'OP 商品、專區清潔'},
  {item_id:'counter_seating',item_name:'櫃台電腦後方／客戶座位區清潔'}
];
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4JcAAAAASUVORK5CYII=','base64');

function ownStatus(overrides={}){
  return {status:'ok',batch_id:'audit-cleaning-202608',batch_name:'稽核前環境清潔確認',submission_id:'submission_test_123456789012345',store_id:'DNB10062',store_name:'台北酒泉',inspector_name:'王小明',submission_status:'submitted',submitted_at:'2026-08-20T14:00:00+08:00',reviewed_at:'',updated_at:'2026-08-20T14:00:00+08:00',revision:1,items:ITEMS.map(item=>({...item,status:'submitted',reviewer_comment:'',note:'',photo_count:1,photos:[{client_photo_id:`server_${item.item_id}_123456`,photo_name:`${item.item_id}.png`,revision:1,status:'submitted'}]})),timeline:[],...overrides};
}

async function mockApi(page,options={}){
  const calls=[];const uploads=new Map();let failOnce=Boolean(options.failOnce);let overviewExpired=Boolean(options.overviewExpired);let authed=false;let currentStatus=options.initialStatus||null;let expireStoreToken=Boolean(options.expireStoreToken);let trustedUatSubmissionId='';
  const batchId=options.uatBatch?'audit-cleaning-202608-uat':'audit-cleaning-202608';
  const storeAuthorized=payload=>payload.store_token===`store-token-${payload.submission_id}`;
  const supervisorAuthorized=payload=>authed||payload.token==='valid-token';
  await page.route('https://script.google.com/**',async route=>{
    const payload=JSON.parse(route.request().postData()||'{}');calls.push(payload);let body;
    if(payload.action==='audit_config')body={status:'ok',contract:'audit-cleaning-v1',batch:{batch_id:batchId,batch_name:options.uatBatch?'稽核回報正式 UAT':'稽核前環境清潔確認',starts_on:'2026-08-20',due_on:'2026-08-31',active:true},stores:STORES,items:ITEMS,maxPhotosPerItem:10};
    else if(payload.action==='audit_submit_auth'){
      if(payload.employeeId==='EMP900'&&options.uatBatch&&!payload.uat_store_id)body={status:'ok',requires_uat_store:true,profile:{masked_name:'盧＊榮'}};
      else if(payload.employeeId==='EMP900'&&options.uatBatch&&STORES.some(store=>store.store_id===payload.uat_store_id)){const store=STORES.find(row=>row.store_id===payload.uat_store_id);trustedUatSubmissionId=payload.submission_id;body={status:'ok',token:`store-token-${payload.submission_id}`,expiresIn:1800,profile:{...store,masked_name:'盧＊榮',roster_probe_enabled:true}};}
      else body=payload.employeeId==='EMP001'&&/^[A-Za-z0-9_-]{16,128}$/.test(payload.deviceId||'')?{status:'ok',token:`store-token-${payload.submission_id}`,expiresIn:1800,profile:{store_id:'DNB10062',store_name:'台北酒泉',masked_name:'測＊員'}}:{status:'error',message:'unauthorized'};
    }
    else if(payload.action==='audit_roster_probe'){
      if(!options.uatBatch||payload.submission_id!==trustedUatSubmissionId||!storeAuthorized(payload))body={status:'error',message:'unauthorized'};
      else if(payload.roster_employee_id==='EMP002')body={status:'ok',exists:true,roster_status:'active',masked_name:'永＊員',roster_store:'台北永吉',audit_store_id:'DNB10082',audit_store_name:'台北永吉',store_mapping_ok:true,approved_device_bound:true};
      else if(payload.roster_employee_id==='EMP005')body={status:'ok',exists:true,roster_status:'active',masked_name:'外＊員',roster_store:'外區門市',audit_store_id:'',audit_store_name:'',store_mapping_ok:false,approved_device_bound:false};
      else body={status:'ok',exists:false,roster_status:'inactive',masked_name:'',roster_store:'',audit_store_id:'',audit_store_name:'',store_mapping_ok:false,approved_device_bound:false};
    }
    else if(['audit_status','audit_start','audit_upload','audit_photo_delete','audit_submit'].includes(payload.action)&&(!storeAuthorized(payload)||expireStoreToken)){expireStoreToken=false;body={status:'error',message:'unauthorized'};}
    else if(payload.action==='audit_status')body=currentStatus&&currentStatus.submission_id===payload.submission_id?currentStatus:{status:'error',message:'找不到本次回報或驗證已失效'};
    else if(payload.action==='audit_start'){currentStatus=ownStatus({submission_id:payload.submission_id,inspector_name:String(payload.inspector_name||'').trim(),submission_status:'draft',submitted_at:'',items:ITEMS.map(item=>({...item,status:'draft',reviewer_comment:'',note:'',photo_count:0,photos:[]}))});body=currentStatus;}
    else if(payload.action==='audit_upload'){
      if(failOnce&&payload.file.name.includes('fail')){failOnce=false;body={status:'error',message:'模擬單張失敗'};}
      else{uploads.set(payload.client_photo_id,payload);body={status:'ok',duplicate:false,photo:{client_photo_id:payload.client_photo_id,photo_name:payload.file.name,revision:currentStatus?.revision||1,status:'draft'}};}
    }else if(payload.action==='audit_photo_delete')body={status:'ok',deleted:true};
    else if(payload.action==='audit_submit'){
      const byItem=ITEMS.map(item=>{const photos=[...uploads.values()].filter(row=>row.item_id===item.item_id).map(row=>({client_photo_id:row.client_photo_id,photo_name:row.file.name,revision:currentStatus?.revision||1,status:'submitted'}));const previous=currentStatus?.items?.find(row=>row.item_id===item.item_id)?.photos||[];return {...item,status:'submitted',reviewer_comment:'',note:payload.notes[item.item_id]||'',photo_count:previous.length+photos.length,photos:[...previous,...photos]};});
      currentStatus=ownStatus({submission_id:payload.submission_id,store_id:currentStatus?.store_id||'DNB10062',store_name:currentStatus?.store_name||'台北酒泉',inspector_name:currentStatus?.inspector_name||'王小明',submission_status:'submitted',revision:currentStatus?.revision||1,items:byItem,readback_verified:true});body=currentStatus;
    }else if(payload.action==='ptauth'){
      const ok=payload.key==='correct-pass'||payload.token==='valid-token';authed=ok;body=ok?{status:'ok',token:'valid-token',expiresIn:1800}:{status:'error',message:'unauthorized'};
    }else if(payload.action==='audit_overview'){
      if(overviewExpired){overviewExpired=false;body={status:'error',message:'unauthorized'};}
      else if(!supervisorAuthorized(payload))body={status:'error',message:'unauthorized'};
      else body={status:'ok',batch:{batch_id:'audit-cleaning-202608',batch_name:'稽核前環境清潔確認'},stores:STORES.map((store,index)=>{const available=index===0&&currentStatus?.submission_status!=='cancelled';return {store_id:store.store_id,store_name:store.store_name,submission_id:available?(currentStatus?.submission_id||'submission_test_123456789012345'):'',inspector_name:available?'測試人員':'',status:available?(currentStatus?.submission_status||'submitted'):'missing',submitted_at:available?'2026-08-20T14:00:00+08:00':'',last_rework_at:'',items:ITEMS.map(item=>({...item,status:available?'submitted':'missing',photo_count:available?1:0}))};})};
    }else if(payload.action==='audit_detail')body=supervisorAuthorized(payload)?(currentStatus||ownStatus()):{status:'error',message:'unauthorized'};
    else if(payload.action==='audit_photo_read')body=(supervisorAuthorized(payload)||(storeAuthorized(payload)&&payload.edit_token))?{status:'ok',client_photo_id:payload.client_photo_id,photo_name:'private.png',mime_type:'image/png',base64:PNG.toString('base64')}:{status:'error',message:'unauthorized'};
    else if(payload.action==='audit_review'){currentStatus=ownStatus({submission_id:payload.submission_id,submission_status:payload.decision==='return'?'rework':'submitted',items:ITEMS.map(item=>({...item,status:item.item_id===payload.item_id?(payload.decision==='return'?'rework':'approved'):'submitted',reviewer_comment:payload.decision==='return'?payload.comment:'',note:'',photo_count:1,photos:[{client_photo_id:`server_${item.item_id}_123456`,photo_name:'photo.png',revision:1,status:'submitted'}]}))});body=currentStatus;}
    else if(payload.action==='audit_cancel'){currentStatus=ownStatus({submission_id:payload.submission_id,submission_status:'cancelled',timeline:[{item_id:'',item_name:'',event_type:'cancelled',status:'cancelled',comment:payload.comment,actor:'supervisor',revision:1,created_at:'2026-08-20T16:00:00+08:00'}]});body=currentStatus;}
    else if(payload.action==='ptlogout')body={status:'ok'};
    else body={status:'error',message:'unknown'};
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  });
  return {calls,uploads};
}

async function addPhoto(page,itemIndex,name='photo.png'){
  await page.locator('.audit-item').nth(itemIndex).locator('.photo-input').setInputFiles({name,mimeType:'image/png',buffer:PNG});
}

async function authorizeStore(page,employeeId='EMP001'){
  await page.fill('#storeEmployeeId',employeeId);await page.locator('#storeAuthButton').click();
}

test('store-only quality reminder is ordered correctly, responsive and keyboard accessible',async({page})=>{
  await mockApi(page);await page.setViewportSize({width:390,height:844});await page.goto(PAGE_URL);const card=page.locator('#qualityReminderCard');const button=page.locator('#qualityReminderButton');
  await expect(card).toBeVisible();await expect(page.locator('#qualityReminderImage')).toHaveAttribute('src','assets/audit/quality-management-reminder.png');await expect(page.locator('#qualityReminderImage')).toHaveAttribute('alt','品質管理重點提醒：SGS行前清潔及稽核檢查事項');await expect(page.locator('#qualityReminderFallback')).toBeHidden();
  expect(await page.evaluate(()=>{const hero=document.querySelector('.hero');const card=document.querySelector('#qualityReminderCard');const heading=document.querySelector('#storeView .section-heading');const basic=document.querySelector('.basic-card');return Boolean(hero.compareDocumentPosition(card)&Node.DOCUMENT_POSITION_FOLLOWING)&&Boolean(card.compareDocumentPosition(heading)&Node.DOCUMENT_POSITION_FOLLOWING)&&Boolean(card.compareDocumentPosition(basic)&Node.DOCUMENT_POSITION_FOLLOWING);})).toBe(true);
  expect(await page.locator('#qualityReminderImage').evaluate(image=>({width:image.naturalWidth,height:image.naturalHeight}))).toEqual({width:932,height:526});expect(await page.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await card.evaluate(element=>element.scrollIntoView({block:'start'}));if(process.env.UPDATE_AUDIT_SCREENSHOTS==='1')await page.screenshot({path:path.resolve(__dirname,'../docs/screenshots/audit-report-20260820/audit-report-mobile-390x844.png')});
  await page.locator('#modeSwitch').click();await expect(page.locator('#storeView')).toBeHidden();await expect(card).toBeHidden();await page.locator('#modeSwitch').click();await expect(card).toBeVisible();
  await button.click();await expect(page.locator('#photoDialog')).toBeVisible();await expect(page.locator('#previousPhoto')).toBeHidden();await expect(page.locator('#nextPhoto')).toBeHidden();await expect(page.locator('#closePhotoDialog')).toBeFocused();await page.locator('#closePhotoDialog').click();await expect(button).toBeFocused();
  await button.press('Enter');await expect(page.locator('#photoDialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#photoDialog')).toBeHidden();await expect(button).toBeFocused();await button.press('Space');await expect(page.locator('#photoDialog')).toBeVisible();await page.locator('#closePhotoDialog').click();
  await page.setViewportSize({width:1280,height:900});await card.evaluate(element=>element.scrollIntoView({block:'start'}));if(process.env.UPDATE_AUDIT_SCREENSHOTS==='1')await page.screenshot({path:path.resolve(__dirname,'../docs/screenshots/audit-report-20260820/audit-report-quality-reminder-desktop.png')});
});

test('quality reminder image failure shows a clear fallback instead of an empty frame',async({page})=>{
  await mockApi(page);await page.goto(PAGE_URL);await page.locator('#qualityReminderImage').evaluate(image=>{image.src='assets/audit/missing-quality-reminder.png';});await expect(page.locator('#qualityReminderFallback')).toBeVisible();await expect(page.locator('#qualityReminderButton')).toBeDisabled();
});

test('nine canonical stores, required fields, multi-add, delete, preview and ten-photo limit',async({page})=>{
  await mockApi(page);await page.setViewportSize({width:390,height:844});await page.goto(PAGE_URL);
  expect(await page.locator('#storeSelect option').allTextContents()).toEqual(['由核准裝置名冊帶入',...STORES.map(s=>s.store_name)]);
  expect(await page.locator('#storeSelect option').evaluateAll(options=>options.slice(1).map(o=>[o.value,o.textContent]))).toEqual(STORES.map(s=>[s.store_id,s.store_name]));
  await expect(page.locator('#storeSelect')).toBeDisabled();await expect(page.locator('#inspectorName')).toBeEditable();await expect(page.locator('#inspectorName')).toHaveAttribute('placeholder','請輸入實際檢查人員姓名');await expect(page.locator('#submitButton')).toBeDisabled();await expect(page.locator('#missingText')).toContainText('門市店點');
  await authorizeStore(page);await expect(page.locator('#storeAuthMessage')).toContainText('核准裝置驗證成功：台北酒泉｜名冊辨識：測＊員');await expect(page.locator('#storeSelect')).toHaveValue('DNB10062');await expect(page.locator('#storeSelect')).toBeDisabled();await expect(page.locator('#inspectorName')).toHaveValue('');await expect(page.locator('#missingText')).toContainText('檢查人員姓名');await page.fill('#inspectorName','王小明');await addPhoto(page,0,'one.png');await addPhoto(page,0,'two.png');await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(2);
  await page.locator('.audit-item').first().locator('.preview-button').first().click();await expect(page.locator('#photoDialog')).toBeVisible();await expect(page.locator('#dialogCaption')).toContainText('第 1／2 張');await page.locator('#closePhotoDialog').click();
  await page.locator('.audit-item').first().locator('.delete-button').first().click();await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1);
  const eleven=Array.from({length:10},(_,i)=>({name:`extra-${i}.png`,mimeType:'image/png',buffer:PNG}));await page.locator('.audit-item').first().locator('.photo-input').setInputFiles(eleven);await expect(page.locator('#globalMessage')).toContainText('單項最多 10 張');await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1);
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('trusted supervisor can select one store only after UAT identity parity succeeds',async({page})=>{
  const mock=await mockApi(page,{uatBatch:true});await page.setViewportSize({width:390,height:844});await page.goto(PAGE_URL);
  await expect(page.locator('#rosterProbeCard')).toBeHidden();
  await expect(page.locator('#storeSelect')).toBeDisabled();
  await authorizeStore(page,'EMP900');
  await expect(page.locator('#storeAuthMessage')).toContainText('UAT 督導身分已驗證');
  await expect(page.locator('#storeSelect')).toBeEnabled();
  await expect(page.locator('#storeSelect option').first()).toHaveText('請選擇 UAT 店點');
  await page.locator('#storeSelect').selectOption('DNB10082');
  await page.locator('#storeAuthButton').click();
  await expect(page.locator('#storeAuthMessage')).toContainText('核准裝置驗證成功：台北永吉｜名冊辨識：盧＊榮');
  await expect(page.locator('#storeSelect')).toHaveValue('DNB10082');
  await expect(page.locator('#storeSelect')).toBeDisabled();
  await expect(page.locator('#rosterProbeCard')).toBeVisible();
  await page.fill('#rosterProbeEmployeeId','EMP002');await page.locator('#rosterProbeButton').click();
  await expect(page.locator('#rosterProbeResult')).toHaveText('名冊辨識：永＊員｜台北永吉｜狀態：啟用｜店點映射：PASS（台北永吉）｜已綁定 Approved Device');
  await page.fill('#rosterProbeEmployeeId','EMP005');await page.locator('#rosterProbeButton').click();
  await expect(page.locator('#rosterProbeResult')).toContainText('店點映射失敗：名冊值 外區門市 無法對應北一二B九店');
  const authCalls=mock.calls.filter(call=>call.action==='audit_submit_auth');
  expect(authCalls).toHaveLength(2);
  expect(authCalls[0].uat_store_id).toBe('');
  expect(authCalls[1].uat_store_id).toBe('DNB10082');
  expect(mock.calls.filter(call=>call.action==='audit_roster_probe')).toHaveLength(2);
  expect(mock.calls.some(call=>call.action==='private_access'||call.action==='kpicalc_access')).toBe(false);
  expect(await page.locator('body').evaluate(body=>body.scrollWidth<=body.clientWidth)).toBe(true);
});

test('ordinary employee cannot use the UAT selector and stays on the roster store',async({page})=>{
  const mock=await mockApi(page,{uatBatch:true});await page.goto(PAGE_URL);await authorizeStore(page,'EMP001');
  await expect(page.locator('#storeSelect')).toHaveValue('DNB10062');
  await expect(page.locator('#storeSelect')).toBeDisabled();
  await expect(page.locator('#rosterProbeCard')).toBeHidden();
  expect(mock.calls.find(call=>call.action==='audit_submit_auth').uat_store_id).toBe('');
});

test('formal batch never exposes the roster probe entry',async({page})=>{
  await mockApi(page);await page.goto(PAGE_URL);await authorizeStore(page,'EMP001');await expect(page.locator('#rosterProbeCard')).toBeHidden();
});

test('partial upload failure preserves successes and retries only the failed photo before readback success',async({page})=>{
  const mock=await mockApi(page,{failOnce:true});await page.goto(PAGE_URL);await authorizeStore(page);await page.fill('#inspectorName','王小明');await addPhoto(page,0,'ok.png');await addPhoto(page,0,'fail.png');await addPhoto(page,1,'op.png');await addPhoto(page,2,'counter.png');
  await page.locator('#submitButton').click();await expect(page.locator('#globalMessage')).toContainText('1 張照片上傳失敗');expect(mock.calls.filter(call=>call.action==='audit_submit')).toHaveLength(0);expect(mock.calls.filter(call=>call.action==='audit_upload')).toHaveLength(4);
  await page.locator('#submitButton').click();await expect(page.locator('#completionTitle')).toHaveText('回報完成');await expect(page.locator('#completionCard')).toBeVisible();expect(mock.calls.filter(call=>call.action==='audit_upload')).toHaveLength(5);expect(mock.calls.filter(call=>call.action==='audit_upload'&&call.file.name==='ok.png')).toHaveLength(1);expect(mock.calls.filter(call=>call.action==='audit_submit')).toHaveLength(1);
  expect(mock.calls.find(call=>call.action==='audit_start').inspector_name).toBe('王小明');expect(mock.calls.find(call=>call.action==='audit_start').inspector_name).not.toBe('測＊員');
});

test('supervisor overview stays locked until PT auth and expired token reauth preserves store draft',async({page})=>{
  const mock=await mockApi(page,{overviewExpired:true});await page.goto(PAGE_URL);await authorizeStore(page);await page.fill('#inspectorName','王小明');await addPhoto(page,0,'draft.png');await page.locator('#modeSwitch').click();await expect(page.locator('#supervisorGate')).toBeVisible();expect(mock.calls.filter(call=>call.action==='audit_overview')).toHaveLength(0);
  await page.fill('#supervisorPasscode','wrong');await page.locator('#supervisorLoginButton').click();await expect(page.locator('#supervisorAuthMessage')).toContainText('錯誤');expect(mock.calls.filter(call=>call.action==='audit_overview')).toHaveLength(0);
  await page.fill('#supervisorPasscode','correct-pass');await page.locator('#supervisorLoginButton').click();await expect(page.locator('#reauthModal')).toBeVisible();await page.fill('#reauthPasscode','correct-pass');await page.locator('#reauthButton').click();await expect(page.locator('.store-review-card')).toHaveCount(9);
  await page.locator('#modeSwitch').click();await expect(page.locator('#inspectorName')).toHaveValue('王小明');await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1);
});

test('unapproved or expired Approved Device authorization is rejected without losing the local draft',async({page})=>{
  const mock=await mockApi(page,{expireStoreToken:true});await page.goto(PAGE_URL);await page.fill('#inspectorName','王小明');await addPhoto(page,0,'draft-kept.png');
  await authorizeStore(page,'EMP999');await expect(page.locator('#storeAuthMessage')).toContainText('尚未核准');expect(mock.calls.filter(call=>call.action==='audit_start')).toHaveLength(0);
  await authorizeStore(page);await expect(page.locator('#storeAuthMessage')).toContainText('已過期');await expect(page.locator('#inspectorName')).toHaveValue('王小明');await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1);
  expect(await page.evaluate(()=>({draft:localStorage.getItem('bei12b_audit_draft_v1'),session:sessionStorage.getItem('bei12b_audit_store_session')}))).toEqual(expect.objectContaining({session:null}));
  expect(await page.evaluate(()=>localStorage.getItem('bei12b_audit_draft_v1'))).not.toContain('EMP001');
  expect(mock.calls.some(call=>call.action==='private_access')).toBe(false);
});

test('legacy masked roster draft is cleared and remains only an authorization hint',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('bei12b_audit_draft_v1',JSON.stringify({batch_id:'audit-cleaning-202608',store_id:'',inspector_name:'測＊員',submission_id:'submission_legacy_mask_123456789',edit_token:'edit_legacy_mask_1234567890123456',notes:{},items:{}})));
  await mockApi(page);await page.goto(PAGE_URL);await expect(page.locator('#inspectorName')).toHaveValue('');await authorizeStore(page);await expect(page.locator('#storeAuthMessage')).toContainText('名冊辨識：測＊員');await expect(page.locator('#inspectorName')).toHaveValue('');
});

test('employee id persists after closing the page while audit token stays session-only',async({page,context})=>{
  await mockApi(page);await page.goto(PAGE_URL);await authorizeStore(page);await expect(page.locator('#storeAuthMessage')).toContainText('核准裝置驗證成功');
  expect(await page.evaluate(()=>({employee:localStorage.getItem('north12b_private_dashboard_employee_id'),localToken:localStorage.getItem('bei12b_audit_store_session'),sessionToken:sessionStorage.getItem('bei12b_audit_store_session')}))).toEqual(expect.objectContaining({employee:'EMP001',localToken:null,sessionToken:expect.stringContaining('store-token-')}));
  await page.close();const reopened=await context.newPage();await mockApi(reopened);await reopened.goto(PAGE_URL);
  await expect(reopened.locator('#storeEmployeeId')).toHaveValue('EMP001');await expect(reopened.locator('#storeAuthMessage')).toContainText('尚未取得回報授權');await expect(reopened.locator('#storeSelect')).toHaveValue('DNB10062');
  expect(await reopened.evaluate(()=>sessionStorage.getItem('bei12b_audit_store_session'))).toBeNull();
});

test('single returned item is the only unlocked upload target and keeps reason/original photos',async({page})=>{
  const status=ownStatus({submission_status:'rework',revision:2,items:ITEMS.map(item=>({...item,status:item.item_id==='op_zone'?'rework':'approved',reviewer_comment:item.item_id==='op_zone'?'請補拍死角':'',note:'原備註',photo_count:1,photos:[{client_photo_id:`server_${item.item_id}_123456`,photo_name:'original.png',revision:1,status:item.item_id==='op_zone'?'rework':'approved'}]})),timeline:[{item_id:'op_zone',item_name:'OP 商品、專區清潔',event_type:'returned',status:'rework',comment:'請補拍死角',actor:'supervisor',revision:1,created_at:'2026-08-20T15:00:00+08:00'}]});
  await page.addInitScript(({draft,session})=>{localStorage.setItem('bei12b_audit_draft_v1',JSON.stringify(draft));sessionStorage.setItem('bei12b_audit_store_session',JSON.stringify(session));localStorage.setItem('north12b_private_dashboard_employee_id','EMP001');},{draft:{batch_id:'audit-cleaning-202608',store_id:'DNB10062',inspector_name:'王小明',submission_id:'submission_test_123456789012345',edit_token:'edit_test_123456789012345678901234',notes:{},items:{}},session:{token:'store-token-submission_test_123456789012345',auth_source:'approved-device',batch_id:'audit-cleaning-202608',store_id:'DNB10062',submission_id:'submission_test_123456789012345'}});
  const mock=await mockApi(page,{initialStatus:status});await page.goto(PAGE_URL);await expect(page.locator('.return-reason:not([hidden])')).toContainText('請補拍死角');await expect(page.locator('.photo-input')).toHaveCount(3);await expect(page.locator('.photo-input').nth(0)).toBeDisabled();await expect(page.locator('.photo-input').nth(1)).toBeEnabled();await expect(page.locator('.photo-input').nth(2)).toBeDisabled();
  await addPhoto(page,1,'rework.png');await page.locator('#submitButton').click();await expect(page.locator('#completionTitle')).toHaveText('回報完成');expect(mock.calls.filter(call=>call.action==='audit_upload').map(call=>call.item_id)).toEqual(['op_zone']);
});

test('reload and reauthorization restore fifteen private server photos without Promise errors and revoke Blob URLs',async({page})=>{
  const submissionId='submission_reload_123456789012345';const editToken='edit_reload_123456789012345678901234';
  const items=ITEMS.map(item=>({...item,status:'rework',reviewer_comment:'UAT reload',note:'',photo_count:5,photos:Array.from({length:5},(_,index)=>({client_photo_id:`server_${item.item_id}_${String(index).padStart(2,'0')}_123456`,photo_name:`${item.item_id}-${index+1}.png`,revision:1,status:'rework'}))}));
  const status=ownStatus({submission_id:submissionId,submission_status:'rework',items});
  await page.addInitScript(({submissionId,editToken})=>{localStorage.setItem('bei12b_audit_draft_v1',JSON.stringify({batch_id:'audit-cleaning-202608',store_id:'DNB10062',inspector_name:'王小明',submission_id:submissionId,edit_token:editToken,notes:{},items:{}}));localStorage.setItem('north12b_private_dashboard_employee_id','EMP001');sessionStorage.removeItem('bei12b_audit_store_session');},{submissionId,editToken});
  await page.addInitScript(()=>{const create=URL.createObjectURL.bind(URL);const revoke=URL.revokeObjectURL.bind(URL);window.__auditCreated=[];window.__auditRevoked=[];URL.createObjectURL=blob=>{const url=create(blob);window.__auditCreated.push(url);return url;};URL.revokeObjectURL=url=>{window.__auditRevoked.push(url);return revoke(url);};});
  const consoleErrors=[];page.on('console',entry=>{if(entry.type()==='error')consoleErrors.push(entry.text());});
  const mock=await mockApi(page,{initialStatus:status});await page.goto(PAGE_URL);await authorizeStore(page);
  await expect(page.locator('.photo-tile img')).toHaveCount(15);await expect(page.locator('.photo-tile img').first()).toHaveAttribute('src',/^blob:/);
  expect(mock.calls.filter(call=>call.action==='audit_photo_read')).toHaveLength(15);
  await page.evaluate(()=>sessionStorage.removeItem('bei12b_audit_store_session'));await page.reload();
  await expect(page.locator('#storeAuthMessage')).toContainText('尚未取得回報授權');await authorizeStore(page);
  await expect(page.locator('.photo-tile img')).toHaveCount(15);await expect(page.locator('.photo-tile img').last()).toHaveAttribute('src',/^blob:/);
  expect(mock.calls.filter(call=>call.action==='audit_submit_auth')).toHaveLength(2);expect(mock.calls.filter(call=>call.action==='audit_status')).toHaveLength(2);expect(mock.calls.filter(call=>call.action==='audit_photo_read')).toHaveLength(30);
  await page.locator('.preview-button').first().click();await expect(page.locator('#photoDialog')).toBeVisible();await expect(page.locator('#dialogImage')).toHaveAttribute('src',/^blob:/);await page.locator('#closePhotoDialog').click();
  const lifecycle=await page.evaluate(()=>{const created=window.__auditCreated.slice();window.dispatchEvent(new Event('pagehide'));return {created,revoked:window.__auditRevoked.slice()};});
  expect(lifecycle.created).toHaveLength(15);expect(lifecycle.revoked.sort()).toEqual(lifecycle.created.sort());expect(consoleErrors).toEqual([]);expect(consoleErrors.join('\n')).not.toContain('.then is not a function');
});

test('desktop review supports per-item return reason and one-click pending list',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedText=text;}}}));const mock=await mockApi(page);await page.setViewportSize({width:1280,height:900});await page.goto(PAGE_URL);await page.locator('#modeSwitch').click();await page.fill('#supervisorPasscode','correct-pass');await page.locator('#supervisorLoginButton').click();await expect(page.locator('.store-review-card')).toHaveCount(9);await page.locator('#copyPendingButton').click();await expect(page.locator('#copyPendingButton')).toHaveText('已複製');
  await page.locator('.review-item-button').first().click();await expect(page.locator('#reviewDialog')).toBeVisible();if(process.env.UPDATE_AUDIT_SCREENSHOTS==='1')await page.locator('#reviewDialog').screenshot({path:path.resolve(__dirname,'../docs/screenshots/audit-report-20260820/audit-report-supervisor-desktop.png')});let dialogMessage='';page.once('dialog',async dialog=>{dialogMessage=dialog.message();await dialog.accept();});await page.locator('[data-review-item="island_display"] .return-button').click();expect(dialogMessage).toContain('必須輸入原因');
  await page.locator('[data-review-item="island_display"] textarea').fill('請補拍中島底部');await page.locator('[data-review-item="island_display"] .return-button').click();await expect.poll(()=>mock.calls.filter(call=>call.action==='audit_review').length).toBe(1);expect(mock.calls.find(call=>call.action==='audit_review').comment).toBe('請補拍中島底部');
});

test('supervisor private photos use protected Blob URLs and cancellation preserves a reset path',async({page})=>{
  const mock=await mockApi(page);await page.goto(PAGE_URL);await page.locator('#modeSwitch').click();await page.fill('#supervisorPasscode','correct-pass');await page.locator('#supervisorLoginButton').click();await page.locator('.review-item-button').first().click();await expect(page.locator('#reviewDialog')).toBeVisible();
  await expect(page.locator('.supervisor-photo img').first()).toHaveAttribute('src',/^blob:/);expect(mock.calls.some(call=>call.action==='audit_photo_read'&&call.token==='valid-token')).toBe(true);expect(await page.locator('body').evaluate(body=>body.innerHTML.includes('drive.google.com/file/d/'))).toBe(false);
  page.once('dialog',dialog=>dialog.accept());await page.locator('.cancel-submission-button').click();await expect(page.locator('#reviewDetail')).toContainText('此回報已取消');await expect(page.locator('#supervisorActionMessage')).toContainText('舊回報已取消並保留證據');
  const cancelCall=mock.calls.find(call=>call.action==='audit_cancel');expect(cancelCall.token).toBe('valid-token');await page.locator('#reviewForm .dialog-close').click();await expect(page.locator('.store-review-card').first()).toContainText('未回報');
});
