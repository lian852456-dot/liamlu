const { test, expect } = require('@playwright/test');
const path = require('node:path');

const PAGE_URL=process.env.TEST_BASE_URL
  ? new URL('audit-report.html',process.env.TEST_BASE_URL).href
  : 'file://'+path.resolve(__dirname,'../audit-report.html');
const STORES=[
  ['DNB10062','台北酒泉'],['DNB10082','台北永吉'],['DNB10094','台北復興南'],['DNB10146','台北杭州南'],['DNB10xxx_wanda','台北萬大'],['DNB10059','台北通化'],['DNB10284','台北大稻埕'],['DNB10307','台北三創'],['DNB10440','台北六張犁']
].map(([store_id,store_name])=>({store_id,store_name}));
const ITEMS=[
  {item_id:'island_display',item_name:'中島、展示機環境清潔'},
  {item_id:'op_zone',item_name:'OP 商品、專區清潔'},
  {item_id:'counter_seating',item_name:'櫃台電腦後方／客戶座位區清潔'}
];
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4JcAAAAASUVORK5CYII=','base64');

function ownStatus(overrides={}){
  return {status:'ok',batch_id:'audit-cleaning-202608',batch_name:'稽核前環境清潔確認',submission_id:'submission_test_123456789012345',store_id:'DNB10062',store_name:'台北酒泉',inspector_name:'測試人員',submission_status:'submitted',submitted_at:'2026-08-20T14:00:00+08:00',reviewed_at:'',updated_at:'2026-08-20T14:00:00+08:00',revision:1,items:ITEMS.map(item=>({...item,status:'submitted',reviewer_comment:'',note:'',photo_count:1,photos:[{client_photo_id:`server_${item.item_id}_123456`,photo_file_id:`file_${item.item_id}`,private_url:'data:image/png;base64,'+PNG.toString('base64'),photo_name:`${item.item_id}.png`,revision:1,status:'submitted'}]})),timeline:[],...overrides};
}

async function mockApi(page,options={}){
  const calls=[];const uploads=new Map();let failOnce=Boolean(options.failOnce);let overviewExpired=Boolean(options.overviewExpired);let authed=false;
  await page.route('https://script.google.com/**',async route=>{
    const payload=JSON.parse(route.request().postData()||'{}');calls.push(payload);let body;
    if(payload.action==='audit_config')body={status:'ok',contract:'audit-cleaning-v1',batch:{batch_id:'audit-cleaning-202608',batch_name:'稽核前環境清潔確認',starts_on:'2026-08-20',due_on:'2026-08-31',active:true},stores:STORES,items:ITEMS,maxPhotosPerItem:10};
    else if(payload.action==='audit_status')body=options.initialStatus||{status:'error',message:'找不到本次回報或驗證已失效'};
    else if(payload.action==='audit_start')body=ownStatus({submission_id:payload.submission_id,store_id:payload.store_id,store_name:STORES.find(s=>s.store_id===payload.store_id).store_name,inspector_name:payload.inspector_name,submission_status:'draft',submitted_at:'',items:ITEMS.map(item=>({...item,status:'draft',reviewer_comment:'',note:'',photo_count:0,photos:[]}))});
    else if(payload.action==='audit_upload'){
      if(failOnce&&payload.file.name.includes('fail')){failOnce=false;body={status:'error',message:'模擬單張失敗'};}
      else{uploads.set(payload.client_photo_id,payload);body={status:'ok',duplicate:false,photo:{client_photo_id:payload.client_photo_id,photo_file_id:'file_'+payload.client_photo_id,private_url:'data:image/png;base64,'+PNG.toString('base64'),photo_name:payload.file.name,revision:options.initialStatus?.revision||1,status:'draft'}};}
    }else if(payload.action==='audit_submit'){
      const byItem=ITEMS.map(item=>{const photos=[...uploads.values()].filter(row=>row.item_id===item.item_id).map(row=>({client_photo_id:row.client_photo_id,photo_file_id:'file_'+row.client_photo_id,private_url:'data:image/png;base64,'+PNG.toString('base64'),photo_name:row.file.name,revision:options.initialStatus?.revision||1,status:'submitted'}));const previous=options.initialStatus?.items?.find(row=>row.item_id===item.item_id)?.photos||[];return {...item,status:'submitted',reviewer_comment:'',note:payload.notes[item.item_id]||'',photo_count:previous.length+photos.length,photos:[...previous,...photos]};});
      body=ownStatus({submission_id:payload.submission_id,submission_status:'submitted',revision:options.initialStatus?.revision||1,items:byItem,readback_verified:true});
    }else if(payload.action==='ptauth'){
      const ok=payload.key==='correct-pass'||payload.token==='valid-token';authed=ok;body=ok?{status:'ok',token:'valid-token',expiresIn:1800}:{status:'error',message:'unauthorized'};
    }else if(payload.action==='audit_overview'){
      if(overviewExpired){overviewExpired=false;body={status:'error',message:'unauthorized'};}
      else if(!authed&&payload.token!=='valid-token')body={status:'error',message:'unauthorized'};
      else body={status:'ok',batch:{batch_id:'audit-cleaning-202608',batch_name:'稽核前環境清潔確認'},stores:STORES.map((store,index)=>({store_id:store.store_id,store_name:store.store_name,submission_id:index?'': 'submission_test_123456789012345',inspector_name:index?'':'測試人員',status:index?'missing':'submitted',submitted_at:index?'':'2026-08-20T14:00:00+08:00',last_rework_at:'',items:ITEMS.map(item=>({...item,status:index?'missing':'submitted',photo_count:index?0:1}))}))};
    }else if(payload.action==='audit_detail')body=ownStatus();
    else if(payload.action==='audit_review')body=ownStatus({submission_status:payload.decision==='return'?'rework':'submitted',items:ITEMS.map(item=>({...item,status:item.item_id===payload.item_id?(payload.decision==='return'?'rework':'approved'):'submitted',reviewer_comment:payload.decision==='return'?payload.comment:'',note:'',photo_count:1,photos:[{client_photo_id:`server_${item.item_id}_123456`,private_url:'data:image/png;base64,'+PNG.toString('base64'),photo_name:'photo.png',revision:1,status:'submitted'}]}))});
    else if(payload.action==='ptlogout')body={status:'ok'};
    else body={status:'error',message:'unknown'};
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  });
  return {calls,uploads};
}

async function addPhoto(page,itemIndex,name='photo.png'){
  await page.locator('.audit-item').nth(itemIndex).locator('.photo-input').setInputFiles({name,mimeType:'image/png',buffer:PNG});
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
  expect(await page.locator('#storeSelect option').allTextContents()).toEqual(['請選擇店點',...STORES.map(s=>s.store_name)]);
  expect(await page.locator('#storeSelect option').evaluateAll(options=>options.slice(1).map(o=>[o.value,o.textContent]))).toEqual(STORES.map(s=>[s.store_id,s.store_name]));
  await expect(page.locator('#submitButton')).toBeDisabled();await expect(page.locator('#missingText')).toContainText('門市店點');
  await page.selectOption('#storeSelect','DNB10062');await page.fill('#inspectorName','   ');await expect(page.locator('#submitButton')).toBeDisabled();
  await page.fill('#inspectorName',' 測試人員 ');await addPhoto(page,0,'one.png');await addPhoto(page,0,'two.png');await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(2);
  await page.locator('.audit-item').first().locator('.preview-button').first().click();await expect(page.locator('#photoDialog')).toBeVisible();await expect(page.locator('#dialogCaption')).toContainText('第 1／2 張');await page.locator('#closePhotoDialog').click();
  await page.locator('.audit-item').first().locator('.delete-button').first().click();await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1);
  const eleven=Array.from({length:10},(_,i)=>({name:`extra-${i}.png`,mimeType:'image/png',buffer:PNG}));await page.locator('.audit-item').first().locator('.photo-input').setInputFiles(eleven);await expect(page.locator('#globalMessage')).toContainText('單項最多 10 張');await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1);
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('partial upload failure preserves successes and retries only the failed photo before readback success',async({page})=>{
  const mock=await mockApi(page,{failOnce:true});await page.goto(PAGE_URL);await page.selectOption('#storeSelect','DNB10062');await page.fill('#inspectorName','測試人員');await addPhoto(page,0,'ok.png');await addPhoto(page,0,'fail.png');await addPhoto(page,1,'op.png');await addPhoto(page,2,'counter.png');
  await page.locator('#submitButton').click();await expect(page.locator('#globalMessage')).toContainText('1 張照片上傳失敗');expect(mock.calls.filter(call=>call.action==='audit_submit')).toHaveLength(0);expect(mock.calls.filter(call=>call.action==='audit_upload')).toHaveLength(4);
  await page.locator('#submitButton').click();await expect(page.locator('#completionTitle')).toHaveText('回報完成');await expect(page.locator('#completionCard')).toBeVisible();expect(mock.calls.filter(call=>call.action==='audit_upload')).toHaveLength(5);expect(mock.calls.filter(call=>call.action==='audit_upload'&&call.file.name==='ok.png')).toHaveLength(1);expect(mock.calls.filter(call=>call.action==='audit_submit')).toHaveLength(1);
});

test('supervisor overview stays locked until PT auth and expired token reauth preserves store draft',async({page})=>{
  const mock=await mockApi(page,{overviewExpired:true});await page.goto(PAGE_URL);await page.selectOption('#storeSelect','DNB10062');await page.fill('#inspectorName','尚未送出的姓名');await addPhoto(page,0,'draft.png');await page.locator('#modeSwitch').click();await expect(page.locator('#supervisorGate')).toBeVisible();expect(mock.calls.filter(call=>call.action==='audit_overview')).toHaveLength(0);
  await page.fill('#supervisorPasscode','wrong');await page.locator('#supervisorLoginButton').click();await expect(page.locator('#supervisorAuthMessage')).toContainText('錯誤');expect(mock.calls.filter(call=>call.action==='audit_overview')).toHaveLength(0);
  await page.fill('#supervisorPasscode','correct-pass');await page.locator('#supervisorLoginButton').click();await expect(page.locator('#reauthModal')).toBeVisible();await page.fill('#reauthPasscode','correct-pass');await page.locator('#reauthButton').click();await expect(page.locator('.store-review-card')).toHaveCount(9);
  await page.locator('#modeSwitch').click();await expect(page.locator('#inspectorName')).toHaveValue('尚未送出的姓名');await expect(page.locator('.audit-item').first().locator('.photo-tile')).toHaveCount(1);
});

test('single returned item is the only unlocked upload target and keeps reason/original photos',async({page})=>{
  const status=ownStatus({submission_status:'rework',revision:2,items:ITEMS.map(item=>({...item,status:item.item_id==='op_zone'?'rework':'approved',reviewer_comment:item.item_id==='op_zone'?'請補拍死角':'',note:'原備註',photo_count:1,photos:[{client_photo_id:`server_${item.item_id}_123456`,photo_file_id:`file_${item.item_id}`,private_url:'data:image/png;base64,'+PNG.toString('base64'),photo_name:'original.png',revision:1,status:item.item_id==='op_zone'?'rework':'approved'}]})),timeline:[{item_id:'op_zone',item_name:'OP 商品、專區清潔',event_type:'returned',status:'rework',comment:'請補拍死角',actor:'supervisor',revision:1,created_at:'2026-08-20T15:00:00+08:00'}]});
  await page.addInitScript(draft=>localStorage.setItem('bei12b_audit_draft_v1',JSON.stringify(draft)),{batch_id:'audit-cleaning-202608',store_id:'DNB10062',inspector_name:'測試人員',submission_id:'submission_test_123456789012345',edit_token:'edit_test_123456789012345678901234',notes:{},items:{}});
  const mock=await mockApi(page,{initialStatus:status});await page.goto(PAGE_URL);await expect(page.locator('.return-reason:not([hidden])')).toContainText('請補拍死角');await expect(page.locator('.photo-input')).toHaveCount(3);await expect(page.locator('.photo-input').nth(0)).toBeDisabled();await expect(page.locator('.photo-input').nth(1)).toBeEnabled();await expect(page.locator('.photo-input').nth(2)).toBeDisabled();
  await addPhoto(page,1,'rework.png');await page.locator('#submitButton').click();await expect(page.locator('#completionTitle')).toHaveText('回報完成');expect(mock.calls.filter(call=>call.action==='audit_upload').map(call=>call.item_id)).toEqual(['op_zone']);
});

test('desktop review supports per-item return reason and one-click pending list',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedText=text;}}}));const mock=await mockApi(page);await page.setViewportSize({width:1280,height:900});await page.goto(PAGE_URL);await page.locator('#modeSwitch').click();await page.fill('#supervisorPasscode','correct-pass');await page.locator('#supervisorLoginButton').click();await expect(page.locator('.store-review-card')).toHaveCount(9);await page.locator('#copyPendingButton').click();await expect(page.locator('#copyPendingButton')).toHaveText('已複製');
  await page.locator('.review-item-button').first().click();await expect(page.locator('#reviewDialog')).toBeVisible();if(process.env.UPDATE_AUDIT_SCREENSHOTS==='1')await page.locator('#reviewDialog').screenshot({path:path.resolve(__dirname,'../docs/screenshots/audit-report-20260820/audit-report-supervisor-desktop.png')});let dialogMessage='';page.once('dialog',async dialog=>{dialogMessage=dialog.message();await dialog.accept();});await page.locator('[data-review-item="island_display"] .return-button').click();expect(dialogMessage).toContain('必須輸入原因');
  await page.locator('[data-review-item="island_display"] textarea').fill('請補拍中島底部');await page.locator('[data-review-item="island_display"] .return-button').click();await expect.poll(()=>mock.calls.filter(call=>call.action==='audit_review').length).toBe(1);expect(mock.calls.find(call=>call.action==='audit_review').comment).toBe('請補拍中島底部');
});
