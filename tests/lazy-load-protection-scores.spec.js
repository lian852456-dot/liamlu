// 店務成績（部區管理）延遲載入驗收：首次直接匯出、等待中重複點擊只匯出一次、
// 登出後不套用等待中的預覽。合成資料與 GAS 模擬沿用 department-scores.spec.js
// 的 fixture（逐字複製，不連正式服務）。
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
async function login(page){await page.locator('#passcode').fill('synthetic-passcode');await page.locator('#authForm button').click();await expect(page.locator('#workspace')).toBeVisible();await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreMessage')).not.toContainText('正在');for(const id of ['scoreUpdateTools','scoreHistoryTools','scoreExports'])await page.locator('#'+id+' > summary').click();}

const XLSX_URL='**/assets/vendor/xlsx.full.min.js*';
async function holdVendor(page){let open;const gate=new Promise(r=>{open=r;});let hits=0;await page.route(XLSX_URL,async route=>{hits++;await gate;await route.continue();});return {release:open,hits:()=>hits};}
// Holds the server-side logout so the page stays on its lock screen (no reload)
// while the pending download finishes: the old page's guards are what is tested.
async function holdLogoutReload(page){let open;const g=new Promise(r=>{open=r;});await page.route(/script\.google\.com/,async route=>{const body=route.request().postData()||'',url=route.request().url();if(/ptlogout/.test(body+url))await g;return route.fallback();});return open;}
async function logoutFromOtherTab(page){const other=await page.context().newPage();other.on('dialog',d=>d.accept());await other.goto(new URL('home.html',PAGE).href);await other.waitForLoadState('networkidle');for(let i=0;i<20;i++){const r=await other.evaluate(()=>window.PortalLogout.request());if(r!==false)break;await other.waitForTimeout(250);}void other.close().catch(()=>{});} // closing the tab that just logged out can stall while its own logout finishes; the context is closed after the test anyway

test('scores export: first direct export, repeat clicks while loading, second export',async({page})=>{
 const held=await holdVendor(page);await setup(page);await login(page);
 expect(await page.evaluate(()=>typeof window.XLSX)).toBe('undefined');
 const downloads=[];page.on('download',d=>downloads.push(d));
 await page.click('#scoreExport');await page.click('#scoreExport',{force:true});await page.click('#scoreExport',{force:true});
 await expect(page.locator('#scoreExport')).toBeDisabled();
 held.release();
 await expect.poll(()=>downloads.length).toBe(1);await page.waitForTimeout(800);expect(downloads.length).toBe(1);
 await expect(page.locator('#scoreExport')).toBeEnabled();
 const name=downloads[0].suggestedFilename();expect(name).toMatch(/^北.*\.xlsx$/);
 const wb=XLSX.read(fs.readFileSync(await downloads[0].path()),{type:'buffer'});expect(wb.SheetNames).toEqual(['門市月成績','原缺失項目','說明']);
 expect(XLSX.utils.sheet_to_json(wb.Sheets['門市月成績'],{header:1}).length).toBeGreaterThan(1);
 const again=page.waitForEvent('download');await page.click('#scoreExport');const d2=await again;expect(d2.suggestedFilename()).toBe(name);
});

test('scores preview: a logout while SheetJS is downloading discards the pending preview',async({page})=>{
 const held=await holdVendor(page);const {calls}=await setup(page);await login(page);const allowReload=await holdLogoutReload(page);
 await page.evaluate(()=>{window.__meta=document.getElementById('scorePreviewMeta');window.__preview=document.getElementById('scorePreview');});
 await page.locator('#scoreFile').setInputFiles({name:'synthetic-quality-month-8.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:monthlyBuffer(8)});
 await page.locator('#scoreImport').click();
 await expect(page.locator('#vendorLoaderNotice')).toBeVisible();
 await logoutFromOtherTab(page);await expect(page.locator('#portal-logout-screen')).toBeVisible();
 held.release();
 await expect.poll(()=>page.evaluate(()=>window.VendorLoader.isReady('xlsx'))).toBe(true);
 await page.waitForTimeout(1200);
 // The (now detached) preview was not filled in or shown, and nothing was saved.
 expect(await page.evaluate(()=>({hidden:window.__preview.hidden,meta:window.__meta.textContent.includes('synthetic-quality-month-8')}))).toEqual({hidden:true,meta:false});
 expect(calls.filter(c=>c.action==='department_scores_publish')).toHaveLength(0);
 await expect(page.locator('#portal-logout-screen')).toBeVisible();
 allowReload();
});

test('scores preview: waits for the download, then previews exactly as before',async({page})=>{
 const held=await holdVendor(page);await setup(page);await login(page);
 await page.locator('#scoreFile').setInputFiles({name:'synthetic-quality-month-8.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:monthlyBuffer(8)});
 await page.locator('#scoreImport').click();held.release();
 await expect(page.locator('#scoreUpdateMessage')).toContainText('預覽完成');
 await expect(page.locator('[data-score-month]')).toHaveAttribute('value','2026-08');
});

// iPhone acceptance 2026-11-08: repeat taps after SheetJS is ready must not export again.
for (const gap of [150, 800]) {
  test(`scores export: three taps ${gap} ms apart give one file once SheetJS is loaded`, async ({ page }) => {
    await setup(page); await login(page);
    await page.evaluate(() => window.VendorLoader.ensure('xlsx'));
    let downloads = 0; page.on('download', () => { downloads += 1; });
    for (let i = 0; i < 3; i += 1) { await page.click('#scoreExport', { force: true, noWaitAfter: true }); await page.waitForTimeout(gap); }
    await page.waitForTimeout(600);
    expect(downloads).toBe(1);
    await expect(page.locator('#scoreExport')).toBeEnabled({ timeout: 6000 });
  });
}
