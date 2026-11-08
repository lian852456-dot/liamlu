// 延遲載入保護的驗收：逾時、清理、重試、載入提示、防重複匯出，以及登出或
// 切換資料情境後不再套用等待中的匯入或匯出。部區管理的合成資料與 GAS 模擬
// 沿用 department-gold-monthly-ui.spec.js 的 fixture（逐字複製，不連正式服務）。
const {test,expect}=require('@playwright/test');
const crypto=require('node:crypto');
const fs=require('node:fs');
const C=require('../department-gold-monthly-core.js');
const X=require('../assets/vendor/xlsx.full.min.js');
const baseURL=process.env.DEPARTMENT_GOLD_PREVIEW_URL||'http://127.0.0.1:8765';
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const staff=(medal,extra={})=>({employeeId:'DEMO001',employeeName:'示*甲',region:'北一二A',storeCode:'SYN-A',store:'合成一店',role:'合成職稱',medal,sourceRow:4,sourceFields:[],...extra});
const month=(key,records,final=false)=>({...C.validateMonth({schema:C.SCHEMA,monthKey:key,sheetName:'動員(全員)',sourceName:'synthetic.xlsx',sourceHash:hash(key),dateRange:{start:key+'-01',end:key+'-28',cutoff:key+'-28'},settlementStatus:final?'final':'provisional',finalConfirmed:final,records,validation:{sourceTotal:records.reduce((s,r)=>s+r.medal,0)}}),versionId:'synthetic-'+key});
function replacement(monthNumber=9){
  const number=String(monthNumber).padStart(2,'0'),lastDay=monthNumber===9?30:31;
  const rows=[[`資料日期 : 2026/${number}/01~${number}/${lastDay}`,...Array(13).fill(null),'SPE加分總計','金牌'],[`Y26/${monthNumber}_北一二(全員)`],['部','區域','區域','督導區','營業店點代碼','服務中心','店內職稱','員編','員工姓名','職級','正/派','9M(含)以上','其他','店型',null,null,'活動金牌'],['北一區','北一二','北一二區','北一二B','SYN-B','合成二店','合成職稱','DEMO001','示*甲',null,null,null,null,null,999,20,999],['北一區','北一二','北一二區','北一二',null,'統計',null,null,null,null,null,null,null,null,999,20]];
  const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),'動員(全員)');return {name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(wb,{type:'buffer',bookType:'xlsx'}))};
}
async function setup(page,{empty=false,planRouteFailures=0,loseCommitResponse=false,holdCommit=false}={}){
  let revision='synthetic-r1',counter=0;
  let releaseCommit;const commitGate=new Promise(resolve=>{releaseCommit=resolve;});
  const all=empty?[]:[month('2026-06',[staff(80)]),month('2026-07',[staff(40)],true),month('2026-08',[staff(70,{region:'北一二B',storeCode:'SYN-B',store:'合成二店'})],true),month('2026-09',[staff(10,{region:'北一二B',storeCode:'SYN-B',store:'合成二店'}),staff(2,{employeeId:'DEMO002',employeeName:'示*乙',storeCode:'SYN-C',store:'合成三店'})])];
  const versions=new Map(all.map(m=>[m.versionId,m])),history={},operations={},calls=[];
  for(const m of all)history[m.monthKey]=[{versionId:m.versionId,cutoff:m.dateRange.cutoff,total:m.validation.total,status:m.settlementStatus,sourceName:m.sourceName}];
  const read=operationId=>({available:all.length>0,gold:{type:'north12-monthly-v2',months:all.slice().sort((a,b)=>a.monthKey.localeCompare(b.monthKey))},monthly:{revision,history,operation:operations[operationId]||null}});
  await page.addInitScript(()=>{if(!localStorage.getItem('north12b_portal_logout_event_v1'))sessionStorage.setItem('bei12b_patrol_session_token_v2','synthetic-session');});
  await page.route(/https:\/\/script\.google\.com\/macros\//,async route=>{
    const p=JSON.parse(route.request().postData()||'{}');calls.push(p);let result;
    if(p.action==='ptauth')result={token:'synthetic-session'};
    else if(p.action==='ptlogout')result={loggedOut:true};
    else if(p.action==='department_ops_read')result=read(p.operationId);
    else if(p.action==='department_ops_publish'){
      if(p.mode.endsWith('plan')&&planRouteFailures>0){planRouteFailures--;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'error',message:'unknown patrol action'})});return;}
      const restoring=p.mode.startsWith('restore'),incoming=restoring?[versions.get(p.versionId)]:p.months;
      if(p.mode.endsWith('plan'))result={planReceipt:'synthetic-plan',changes:incoming.map(m=>{const old=all.find(s=>s.monthKey===m.monthKey);return {monthKey:m.monthKey,beforeTotal:old?.validation.total??null,total:m.validation.total,changedPeople:C.diff(old,m).length,older:!!old&&m.dateRange.cutoff<old.dateRange.cutoff,finalDowngrade:old?.settlementStatus==='final'&&m.settlementStatus!=='final'};}),differences:incoming.map(m=>({monthKey:m.monthKey,rows:C.diff(all.find(s=>s.monthKey===m.monthKey),m)}))};
      else {
        if(holdCommit)await commitGate;
        for(const m of incoming){const index=all.findIndex(x=>x.monthKey===m.monthKey),saved=restoring?m:{...m,versionId:'synthetic-new-'+(++counter)};if(index<0)all.push(saved);else all[index]=saved;versions.set(saved.versionId,saved);if(!restoring)(history[m.monthKey]||=[]).push({versionId:saved.versionId,cutoff:m.dateRange.cutoff,total:m.validation.total,status:m.settlementStatus,sourceName:m.sourceName});}
        revision='synthetic-r'+(++counter+1);operations[p.operationId]={revision,operationId:p.operationId};result={result:'committed',...read(p.operationId)};
        if(loseCommitResponse){loseCommitResponse=false;result={message:'unknown patrol action'};}
      }
    }else result={message:'unexpected fixture action'};
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({status:result.message?'error':'ok',...result})});
  });
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL+'/department-ops.html');await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#goldMessage')).not.toContainText('正在');
  return {calls,errors,all,releaseCommit,failNextPlan:()=>{planRouteFailures++;}};
}

const BASE='http://127.0.0.1:8875/';
const XLSX_URL='**/assets/vendor/xlsx.full.min.js*';
function gate(){let open;const promise=new Promise(r=>{open=r;});return {promise,open};}
async function holdVendor(page,pattern=XLSX_URL){const g=gate();let hits=0;await page.route(pattern,async route=>{hits++;await g.promise;await route.continue();});return {release:g.open,hits:()=>hits};}
async function loaderPage(page){await page.goto(BASE+'offline.html');await page.addScriptTag({url:'/vendor-loader.js'});}
// Logs out from a second tab, the way a cross-tab logout reaches a busy page.
// Holds the server-side logout so the page stays on its lock screen (no reload)
// while the pending download finishes: the old page's guards are what is tested.
async function holdLogoutReload(page){let open;const g=new Promise(r=>{open=r;});await page.route(/script\.google\.com/,async route=>{const body=route.request().postData()||'',url=route.request().url();if(/ptlogout/.test(body+url))await g;return route.fallback();});return open;}
async function logoutFromOtherTab(page){const other=await page.context().newPage();other.on('dialog',d=>d.accept());await other.goto(baseURL+'/home.html');await other.waitForLoadState('networkidle');for(let i=0;i<20;i++){const r=await other.evaluate(()=>window.PortalLogout.request());if(r!==false)break;await other.waitForTimeout(250);}await other.close();}

test.describe('vendor loader',()=>{
  test('a stalled download times out, cleans up its script and can be retried',async({page})=>{
    await page.route(XLSX_URL,()=>{});            // never answers
    await loaderPage(page);
    const result=await page.evaluate(async()=>{VendorLoader.configure({timeoutMs:400});const t=performance.now();try{await VendorLoader.ensure('xlsx');return {ok:true};}catch(e){return {ok:false,code:e.code,message:e.message,ms:performance.now()-t,scripts:document.querySelectorAll('script[data-vendor]').length,notice:!!document.getElementById('vendorLoaderNotice')};}});
    expect(result).toMatchObject({ok:false,code:'VENDOR_TIMEOUT',scripts:0,notice:false});
    expect(result.message).toContain('逾時');
    expect(result.ms).toBeGreaterThanOrEqual(700); // two attempts
    await page.unroute(XLSX_URL);
    expect(await page.evaluate(()=>VendorLoader.ensure('xlsx').then(()=>VendorLoader.isReady('xlsx')))).toBe(true);
  });
  test('a failed first attempt is retried automatically once',async({page})=>{
    let hits=0;await page.route(XLSX_URL,route=>{hits++;return hits===1?route.abort():route.continue();});
    await loaderPage(page);
    expect(await page.evaluate(()=>VendorLoader.ensure('xlsx').then(()=>VendorLoader.isReady('xlsx')))).toBe(true);
    expect(hits).toBe(2);
  });
  test('two failed attempts give a clear network error and leave nothing behind',async({page})=>{
    await page.route(XLSX_URL,route=>route.abort());
    await loaderPage(page);
    const r=await page.evaluate(()=>VendorLoader.ensure('xlsx').then(()=>({ok:true}),e=>({ok:false,code:e.code,message:e.message,scripts:document.querySelectorAll('script[data-vendor]').length})));
    expect(r).toMatchObject({ok:false,code:'VENDOR_NETWORK',scripts:0});
    expect(r.message).toContain('再按一次');
  });
  test('a slow download shows a visible notice that disappears when ready',async({page})=>{
    const held=await holdVendor(page);await loaderPage(page);
    await page.evaluate(()=>{window.__done=VendorLoader.ensure('xlsx');});
    await expect(page.locator('#vendorLoaderNotice')).toContainText('正在下載試算表元件');
    await expect(page.locator('#vendorLoaderNotice')).toHaveAttribute('role','status');
    held.release();await page.evaluate(()=>window.__done);
    await expect(page.locator('#vendorLoaderNotice')).toHaveCount(0);
  });
  test('concurrent callers share one download',async({page})=>{
    const held=await holdVendor(page);await loaderPage(page);
    await page.evaluate(()=>{window.__all=Promise.all([VendorLoader.ensure('xlsx'),VendorLoader.ensure('xlsx'),VendorLoader.ensure('xlsx')]);});
    await page.waitForTimeout(200);held.release();await page.evaluate(()=>window.__all);
    expect(held.hits()).toBe(1);
  });
  test('run() ignores repeat clicks while waiting and restores the button',async({page})=>{
    const held=await holdVendor(page);await loaderPage(page);
    await page.evaluate(()=>{const b=document.createElement('button');b.id='x';document.body.append(b);window.__runs=0;window.__results=[];
      for(let i=0;i<3;i++)window.__results.push(VendorLoader.run('k',['xlsx'],()=>{window.__runs++;},{button:b}));});
    expect(await page.evaluate(()=>document.getElementById('x').disabled)).toBe(true);
    held.release();
    expect(await page.evaluate(()=>Promise.all(window.__results))).toEqual([true,false,false]);
    expect(await page.evaluate(()=>({runs:window.__runs,disabled:document.getElementById('x').disabled}))).toEqual({runs:1,disabled:false});
  });
});

test.describe('department-ops gold monthly export (first export downloads SheetJS)',()=>{
  test('first direct export, repeat clicks while loading and a second export',async({page})=>{
    const held=await holdVendor(page);const state=await setup(page);
    expect(await page.evaluate(()=>typeof window.XLSX)).toBe('undefined');
    const downloads=[];page.on('download',d=>downloads.push(d));
    await page.click('#exportGold');await page.click('#exportGold',{force:true});await page.click('#exportGold',{force:true});
    await expect(page.locator('#exportGold')).toBeDisabled();
    await expect(page.locator('#vendorLoaderNotice')).toBeVisible();
    held.release();
    await expect.poll(()=>downloads.length).toBe(1);await page.waitForTimeout(800);expect(downloads.length).toBe(1);
    await expect(page.locator('#exportGold')).toBeEnabled();
    const first=downloads[0];expect(first.suggestedFilename()).toMatch(/^[^/]*金牌[^/]*\.xlsx$/);
    const wb=X.read(fs.readFileSync(await first.path()),{type:'buffer'});expect(wb.SheetNames).toContain('每人月值');
    expect(X.utils.sheet_to_json(wb.Sheets['每人月值'],{header:1}).length).toBeGreaterThan(1);
    const second=page.waitForEvent('download');await page.click('#exportGold');const d2=await second;
    expect(d2.suggestedFilename()).toBe(first.suggestedFilename());expect(X.read(fs.readFileSync(await d2.path()),{type:'buffer'}).SheetNames).toContain('每人月值');
    expect(state.errors).toEqual([]);
  });
  test('a logout while SheetJS is downloading cancels the pending export',async({page})=>{
    const held=await holdVendor(page);const state=await setup(page);const allowReload=await holdLogoutReload(page);
    let downloaded=false;page.on('download',()=>{downloaded=true;});
    await page.click('#exportGold');await expect(page.locator('#exportGold')).toBeDisabled();
    await logoutFromOtherTab(page);
    await expect(page.locator('#portal-logout-screen')).toBeVisible();
    held.release();
    await expect.poll(()=>page.evaluate(()=>window.VendorLoader.isReady('xlsx'))).toBe(true); // the wait did finish in the old page
    await page.waitForTimeout(1200);
    expect(downloaded).toBe(false);
    await expect(page.locator('#portal-logout-screen')).toBeVisible(); // still the same page, no reload yet
    expect(state.errors).toEqual([]);
    allowReload();
  });
  test('a logout while SheetJS is downloading discards the pending import',async({page})=>{
    const held=await holdVendor(page);const state=await setup(page);const allowReload=await holdLogoutReload(page);
    await page.evaluate(()=>{window.__previewWrites=0;const body=document.getElementById('monthlyPreviewBody');new MutationObserver(()=>{window.__previewWrites++;}).observe(body,{childList:true,subtree:true});window.__previewBody=body;});
    await page.locator('#goldFile').setInputFiles(replacement());await page.click('#goldImport');
    await expect(page.locator('#vendorLoaderNotice')).toBeVisible();
    await logoutFromOtherTab(page);await expect(page.locator('#portal-logout-screen')).toBeVisible();
    held.release();
    await expect.poll(()=>page.evaluate(()=>window.VendorLoader.isReady('xlsx'))).toBe(true);
    await page.waitForTimeout(1200);
    // The detached preview was never filled in, and nothing was sent for saving.
    expect(await page.evaluate(()=>({writes:window.__previewWrites,html:window.__previewBody.innerHTML}))).toEqual({writes:0,html:''});
    expect(state.calls.filter(c=>c.action==='department_ops_publish')).toHaveLength(0);
    await expect(page.locator('#portal-logout-screen')).toBeVisible();
    expect(state.errors).toEqual([]);
    allowReload();
  });
  test('import waits for the download, then shows the preview as before',async({page})=>{
    const held=await holdVendor(page);const state=await setup(page);
    await page.locator('#goldFile').setInputFiles(replacement());await page.click('#goldImport');
    await expect(page.locator('#goldImport')).toBeDisabled();
    held.release();
    await expect(page.locator('#monthlyPreview')).toBeVisible();
    await expect(page.locator('#goldMessage')).toContainText('已辨識');
    expect(state.errors).toEqual([]);
  });
});

test.describe('app phone stock import',()=>{
  const csv=n=>Buffer.from(`店點,機型,庫存數,庫存日期\n通化,測試機${n},${n},2026/11/07\n`);
  async function openApp(page){await page.route(u=>!u.href.startsWith(BASE),r=>r.abort());await page.goto(BASE+'app.html?preview=1',{waitUntil:'load'});}
  test('a logout while SheetJS is downloading discards the pending import',async({page})=>{
    const held=await holdVendor(page);await openApp(page);
    const before=await page.evaluate(()=>localStorage.getItem('north12b_phone_stock_local_snapshot_v1'));
    await page.setInputFiles('#stockFile',{name:'a.csv',mimeType:'text/csv',buffer:csv(7)});
    await expect(page.locator('#stockImportMessage')).toContainText('正在解析');
    await page.evaluate(()=>window.dispatchEvent(new Event('portal-before-logout')));
    held.release();await page.waitForTimeout(1200);
    expect(await page.evaluate(()=>localStorage.getItem('north12b_phone_stock_local_snapshot_v1'))).toBe(before);
    await expect(page.locator('#stockImportMessage')).not.toContainText('已匯入');
  });
  test('when two files are picked while waiting, the latest pick wins',async({page})=>{
    const held=await holdVendor(page);await openApp(page);
    await page.setInputFiles('#stockFile',{name:'a.csv',mimeType:'text/csv',buffer:csv(3)});
    await page.setInputFiles('#stockFile',{name:'b.csv',mimeType:'text/csv',buffer:csv(9)});
    held.release();
    await expect(page.locator('#stockImportMessage')).toContainText('已匯入 1 筆');
    await expect(page.locator('#stockTotal')).toHaveText('符合條件 9 台');
  });
});

test('run() skips the task and its error handler when the page context changed while waiting',async({page})=>{
  const held=await holdVendor(page);await loaderPage(page);
  await page.evaluate(()=>{window.__valid=true;window.__calls=[];window.__r=VendorLoader.run('ctx',['xlsx'],()=>{window.__calls.push('task');},{isCurrent:()=>window.__valid,onError:()=>window.__calls.push('error')});});
  await page.evaluate(()=>{window.__valid=false;});held.release();
  expect(await page.evaluate(()=>window.__r)).toBe(false);
  expect(await page.evaluate(()=>window.__calls)).toEqual([]);
});

// iPhone acceptance 2026-11-08 found repeat taps exporting again once SheetJS
// had loaded (fast network): the guard must also cover the moments after an export.
for (const gap of [150, 400, 800]) {
  for (const preloaded of [false, true]) {
    test(`gold export: three taps ${gap} ms apart give one file (${preloaded ? 'SheetJS already loaded' : 'first export'})`, async ({ page }) => {
      const state = await setup(page);
      if (preloaded) await page.evaluate(() => window.VendorLoader.ensure('xlsx'));
      let downloads = 0; page.on('download', () => { downloads += 1; });
      for (let i = 0; i < 3; i += 1) { await page.click('#exportGold', { force: true, noWaitAfter: true }); await page.waitForTimeout(gap); }
      await page.waitForTimeout(600);
      expect(downloads).toBe(1);
      await expect(page.locator('#exportGold')).toBeEnabled({ timeout: 6000 });
      const next = page.waitForEvent('download'); await page.click('#exportGold'); await next; // a deliberate export after the pause still works
      expect(downloads).toBe(2);
      expect(state.errors).toEqual([]);
    });
  }
}
