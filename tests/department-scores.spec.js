const {test,expect}=require('@playwright/test');
const crypto=require('node:crypto'),fs=require('node:fs');
const XLSX=require('../assets/vendor/xlsx.full.min.js'),Core=require('../department-scores-core.js'),F=require('./helpers/department-scores-synthetic.cjs'),backend=require('./helpers/department-scores-backend.cjs');
const PAGE=process.env.TEST_BASE_URL ? new URL('department-ops.html',process.env.TEST_BASE_URL).href : 'http://127.0.0.1:8763/department-ops.html';
const p=months=>({action:'department_scores_publish',token:'authorized',contract:Core.CONTRACT,confirm:true,requestId:crypto.randomUUID(),expectedGeneration:0,selectedMonthKeys:months.map(m=>m.monthKey),months,sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64)});
const encode=workbook=>Buffer.from(XLSX.write(workbook,{type:'array',bookType:'xlsx'}));
const buffer=options=>encode(F.workbook(options));
const monthlyBuffer=(month=8)=>{const key=String(month).padStart(2,'0'),wb={SheetNames:['店務管理月報 疏失總表','MAIL','服務查核','近6個月缺失數'],Sheets:{'店務管理月報 疏失總表':F.sheet({month}),'MAIL':XLSX.utils.aoa_to_sheet([['區域','主管','轄下店數','店務缺失總數',`Y26${key}初版店務管理指標成績`,'排名']]),'服務查核':XLSX.utils.aoa_to_sheet([['直營',null,'轄下店數',`${month}月平反後分數`]]),'近6個月缺失數':XLSX.utils.aoa_to_sheet([['類別','指標項目',month===9?'Y2610':'Y2608']])}};return encode(wb);};
const session=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
async function setup(page,{seed=true,loseAck=false}={}){
 const b=backend(),calls=[];let deny=false;if(seed)b.invoke(p([F.month({month:6}),F.month({month:7})]));
 await page.route('https://script.google.com/**',async route=>{
  const body=route.request().postDataJSON();calls.push(body);
  let response;
  try{if(deny&&body.action.startsWith('department_scores_'))throw new Error('AUTH_SESSION_EXPIRED');if(body.action==='ptauth')response={status:'ok',token:session,expiresAt:Math.floor(Date.now()/1000)+3600};else if(body.action==='department_ops_read')response={status:'ok',available:false,gold:{months:[]},monthly:{revision:'synthetic-empty',history:{}}};else response={status:'ok',...b.invoke({...body,token:body.token===session?'authorized':body.token})};}
  catch(e){response={status:'error',message:e.message};}
  if(loseAck&&body.action==='department_scores_publish'){loseAck=false;return route.fulfill({status:503,body:'unavailable'});}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(response)});
 });
 await page.goto(PAGE);return {b,calls,expire:()=>{deny=true;}};
}
async function login(page){await page.locator('#passcode').fill('synthetic-passcode');await page.locator('#authForm button').click();await expect(page.locator('#workspace')).toBeVisible();await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreMessage')).not.toContainText('正在');}
test('品管課單月原檔從上傳區可預覽、逐月保存讀回，重複點擊不重送、失敗保留舊版',async({page})=>{
 const {b,calls}=await setup(page);await login(page);
 const original=b.invoke({action:'department_scores_read',token:'authorized'}).months;
 for(const month of [8,9]){
  await page.locator('#scoreFile').setInputFiles({name:`synthetic-quality-month-${month}.xlsx`,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:monthlyBuffer(month)});
  await page.locator('#scoreImport').click();await expect(page.locator('#scoreUpdateMessage')).toContainText('預覽完成');await expect(page.locator('#scorePreviewMeta')).toContainText('品管課月報');await expect(page.locator('[data-score-month]')).toHaveAttribute('value','2026-0'+month);
  await page.locator('#scoreConfirm').check();await page.locator('#scorePublish').dblclick();await expect(page.locator('#scoreUpdateMessage')).toContainText('逐項讀回對帳完成');
 }
 expect(calls.filter(p=>p.action==='department_scores_publish')).toHaveLength(2);const saved=b.invoke({action:'department_scores_read',token:'authorized'});expect(saved.months).toHaveLength(4);for(const slot of original)expect(saved.months.find(s=>s.month.monthKey===slot.month.monthKey)).toEqual(slot);
 await page.locator('#scoreFile').setInputFiles({name:'bad.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('not a workbook')});await page.locator('#scoreImport').click();await expect(page.locator('#scoreUpdateMessage')).toHaveClass(/error/);expect(b.invoke({action:'department_scores_read',token:'authorized'})).toEqual(saved);expect(calls.filter(p=>p.action==='department_scores_publish')).toHaveLength(2);
});
test('匿名不讀私有內容，登入後持久讀取，reload無需原檔',async({page})=>{
 const {calls}=await setup(page);await expect(page.locator('#workspace')).toBeHidden();expect(calls.length).toBe(0);await expect(page.locator('#scoreBody')).toBeEmpty();
 await login(page);await expect(page.locator('#scoreDashboard')).toBeVisible();await expect(page.locator('#scoreBody')).toContainText('合成店A1');await expect(page.locator('#scoreSourceMeta')).toContainText('不完整（2/6月）');expect(await page.locator('#scoreFile').inputValue()).toBe('');
 await page.reload();await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody')).toContainText('合成店A1');expect(await page.locator('#scoreFile').inputValue()).toBe('');
});
test('選檔預覽不寫入，明確確認、差異與同hash防重',async({page})=>{
 const {b,calls}=await setup(page,{seed:false});await login(page);
 await page.locator('#scoreFile').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:buffer({month:7})});await page.locator('#scoreImport').click();await expect(page.locator('#scorePreview')).toBeVisible();await expect(page.locator('#scorePublish')).toBeDisabled();expect(calls.filter(c=>c.action==='department_scores_publish').length).toBe(0);
 await page.locator('#scoreConfirm').check();await page.locator('#scorePublish').click();await expect(page.locator('#scoreMessage')).toContainText('逐項讀回對帳完成');expect(b.invoke({action:'department_scores_read',token:'authorized'}).generation).toBe(1);
 await page.locator('#scoreFile').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:buffer({month:7})});await page.locator('#scoreImport').click();await expect(page.locator('#scoreMessage')).toContainText('無需重複保存');await expect(page.locator('[data-score-month]')).not.toBeChecked();await page.locator('[data-score-month]').check();await page.locator('#scoreConfirm').check();await page.locator('#scorePublish').click();await expect(page.locator('#scoreMessage')).toContainText('去重');expect(b.invoke({action:'department_scores_read',token:'authorized'}).generation).toBe(1);
});
test('錯檔／核心錯誤／缺列停月，分項錯誤仍可預覽並來源定位',async({page})=>{
 const {calls}=await setup(page);await login(page);
 await page.locator('#scoreFile').setInputFiles({name:'wrong.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:encode({SheetNames:['其他'],Sheets:{其他:XLSX.utils.aoa_to_sheet([['wrong']])}})});await page.locator('#scoreImport').click();await expect(page.locator('#scoreMessage')).toContainText('年度');await expect(page.locator('#scorePreview')).toBeHidden();
 for(const opt of [{missingRow:true},{errorScore:true}]){await page.locator('#scoreFile').setInputFiles({name:'bad.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:buffer(opt)});await page.locator('#scoreImport').click();await expect(page.locator('#scorePreviewMeta')).toContainText('停止 1 月');await expect(page.locator('#scorePublish')).toBeDisabled();}
 await page.locator('#scoreFile').setInputFiles({name:'rank-error.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:buffer({errorRank:true})});await page.locator('#scoreImport').click();await expect(page.locator('#scoreErrors')).toContainText('#REF!');expect(calls.filter(c=>c.action==='department_scores_publish').length).toBe(0);
 await page.locator('#scorePeriod').selectOption('2026-07');await page.locator('[data-score-detail="合成店A1"]').click();await expect(page.locator('#scoreDetail')).toContainText('7月!G61');await expect(page.locator('#scoreDetail')).toContainText('頁次');await expect(page.locator('#scoreDetail')).toContainText('沒有個案事件');
});
test('保存回應不明不自動重送，讀回後顯示已保存成績',async({page})=>{
 const {calls}=await setup(page,{seed:false,loseAck:true});await login(page);await page.locator('#scoreFile').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:buffer()});await page.locator('#scoreImport').click();await page.locator('#scoreConfirm').check();await page.locator('#scorePublish').click();await expect(page.locator('#scoreMessage')).toContainText('503');expect(calls.filter(c=>c.action==='department_scores_publish').length).toBe(1);await expect(page.locator('#scorePublish')).toBeDisabled();await page.locator('#scoreRefresh').click();await expect(page.locator('#scoreBody')).toContainText('合成店A1');
});
test('同月更正、歷史預覽與明確回復，匯出可擴充資料',async({page})=>{
 await setup(page);await login(page);const w=F.workbook(),s=w.Sheets['7月'];s.G61={t:'n',v:99};s.F61={t:'n',v:1};
 await page.locator('#scoreFile').setInputFiles({name:'correction.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:encode(w)});await page.locator('#scoreImport').click();await page.locator('#scoreDiff summary').click();await expect(page.locator('#scoreDiff')).toContainText('原成績 G');await page.locator('#scoreConfirm').check();await page.locator('#scorePublish').click();await expect(page.locator('#scoreMessage')).toContainText('讀回對帳完成');
 const history=await page.locator('#scoreHistory option').nth(1).getAttribute('value');await page.locator('#scoreHistory').selectOption(history);await page.locator('#scoreHistoryPreview').click();await expect(page.locator('#scoreRestorePreview')).toBeVisible();await expect(page.locator('#scoreRestoreDiff')).toContainText('99.5');await expect(page.locator('#scoreRestore')).toBeDisabled();await page.locator('#scoreRestoreConfirm').check();await page.locator('#scoreRestore').click();await expect(page.locator('#scoreMessage')).toContainText('歷史回復');
 const download=page.waitForEvent('download');await page.locator('#scoreBrief').click();const file=await download;const data=JSON.parse(fs.readFileSync(await file.path(),'utf8'));expect(data.contract).toBe('north12-scores-brief-v1');expect(data.limitations.join()).toContain('模板尚未提供');
});
for(const viewport of [{width:1440,height:1100},{width:390,height:844}])test(`桌面手機 ${viewport.width} 四區、篩選、頁面無橫向溢位`,async({page})=>{
 await page.setViewportSize(viewport);await setup(page);await login(page);await expect(page.locator('#scoreRegions article')).toHaveCount(4);await page.locator('#scoreRegion').selectOption('北一二D');await expect(page.locator('#scoreBody tr')).toHaveCount(3);await page.locator('#scoreStore').selectOption('合成店D1');await expect(page.locator('#scoreBody tr')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`test-results/scores-${viewport.width}.png`,fullPage:true});
});

test('短效驗證到期即鎖回登入並清除已呈現私有成績',async({page})=>{
 const {expire}=await setup(page);await login(page);await expect(page.locator('#scoreBody')).toContainText('合成店A1');expire();await page.locator('#scoreRefresh').click();await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#authPanel')).toBeVisible();await expect(page.locator('#scoreBody')).toBeEmpty();await expect(page.locator('#scoreSummary')).toBeEmpty();await expect(page.locator('#scoreDetail')).toBeEmpty();
});
