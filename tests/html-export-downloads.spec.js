const {test,expect}=require('@playwright/test'),fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),crypto=require('node:crypto');
const inventory=require('../html-export-inventory.json'),{fixture}=require('./helpers/readonly-dashboard-fixture.cjs'),D=require('./helpers/department-readonly-synthetic.cjs'),X=require('../assets/vendor/xlsx.full.min.js'),{source}=require('./helpers/renewal-detail-workbook.cjs'),{createRuntime,parsed,OPERATOR}=require('./helpers/tradein-synthetic-runtime.cjs');
let server,base;const results=[];
test.beforeAll(async()=>{const root=path.resolve(__dirname,'..');server=http.createServer(async(req,res)=>{try{const f=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);if(path.relative(root,f).startsWith('..'))throw Error();const b=await fs.readFile(f);res.writeHead(200,{'Content-Type':({'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'}[path.extname(f)]||'text/html')+';charset=utf-8'});res.end(b);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;});
test.afterAll(async()=>{await fs.writeFile(path.join(test.info().project.outputDir,'html-download-coverage.json'),JSON.stringify(results,null,2));await new Promise(r=>server.close(r));});
async function route(page,handler){await page.route('**/*',async r=>{const u=new URL(r.request().url());if(u.origin===base)return r.continue();if(u.hostname!=='script.google.com')return r.abort();let p;try{p=JSON.parse(r.request().postData());}catch{p=JSON.parse(new URLSearchParams(r.request().postData()).get('payload'));}if(!p)p=Object.fromEntries(u.searchParams);const data=handler(p);if(u.searchParams.get('transport')==='iframe'){const m=JSON.stringify({type:'north12b-gas-response-v1',requestId:u.searchParams.get('requestId'),body:data}).replace(/</g,'\\u003c');return r.fulfill({contentType:'text/html;charset=utf-8',body:'<meta charset="utf-8"><script>top.postMessage('+m+',"*")</script>'});}return r.fulfill({json:data});});}
async function openDownloadedOffline(browser,bytes,kind,info){
 const html=bytes.toString('utf8');expect(Buffer.from(html).equals(bytes)).toBe(true);expect(html.startsWith('<!doctype html>\n')).toBe(true);expect(html).toContain('north12-single-html/v1');
 const context=await browser.newContext({offline:true,viewport:{width:390,height:900}}),page=await context.newPage(),network=[],errors=[];page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
 // Load the actual downloaded bytes into a fresh browser while it is already
 // offline. No document URL, server, cached assets or blocked reference file is used.
 await page.setContent(html,{waitUntil:'load'});await expect(page.locator('h1').first()).toBeVisible();
 await expect(page.locator('script[src],link[href],iframe,form,input[type=file],input[type=password]')).toHaveCount(0);
 if(kind==='kpi'||kind==='awards'){await page.locator('#search').fill('找不到的合成值');await expect(page.locator('section tbody tr:visible')).toHaveCount(0);await page.locator('#search').fill('');}
 if(kind==='store'){await page.locator('[data-tab=traffic]').click();await page.locator('#store').selectOption({index:1});}
 if(kind==='officer'){await page.locator('[data-tab=insights]').click();await expect(page.locator('#content')).toContainText('Tier A～F');}
 if(kind==='department'){await page.locator('[data-tab=gold]').click();await expect(page.locator('#peopleBody')).toContainText('測＊員');}
 if(kind==='patrol'){await page.locator('#query').fill('合成缺失');await expect(page.locator('#visible')).toContainText('1');}
 if(kind==='tradein'){await expect(page.locator('main')).toContainText('合成高價機');await expect(page.locator('main')).toContainText('1,000 元');await page.locator('#query').fill('不存在');await expect(page.locator('#count')).toContainText('顯示 0');await page.locator('#query').fill('');}
 if(kind.startsWith('query-')){await expect(page.locator('#queryStatus')).toContainText('唯讀快照');const sourceKind=kind.slice(6);await page.locator('#'+sourceKind+'Tab').click();await page.locator('#'+sourceKind+'Search').fill('不存在的合成機款');await expect(page.locator('#'+sourceKind+'Results')).toContainText('沒有符合');await page.locator('#'+sourceKind+'Search').fill('');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(network).toEqual([]);expect(errors).toEqual([]);await page.screenshot({path:info.outputPath('offline-open.png'),fullPage:false});await context.close();
 return {offlineBeforeLoad:true,externalRequests:0,pageErrors:0,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}
const book=()=>({name:'SYNTHETIC-full-renewal.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(source(),{bookType:'xlsx',type:'buffer'}))});
async function battle(page,entry){
 const f=fixture();await route(page,p=>p.action==='private_access'?f.privateResult:p.action==='kpicalc_access'?f.kpiResult:{status:'error',message:'synthetic unrelated read'});
 await page.goto(base+'/'+entry.page.split('#')[0]);
 if(entry.page.startsWith('index'))await page.getByRole('button',{name:/KPI戰情/}).click();
 await page.locator('[data-b-a]').click();const area=entry.page.startsWith('awards')?'awardsBattleContent':'kpiBattleContent';await page.locator('#'+area+' #privateEmployeeId').fill('SYNTH01');await page.locator('#'+area+' [data-private-dashboard-action=login]').click();
 if(entry.kind==='awards'&&!entry.page.startsWith('awards')){if(entry.page.startsWith('index'))await page.getByRole('button',{name:/台獎戰情/}).click();else await page.evaluate(()=>location.hash='awards');}
 await expect(page.locator(entry.control)).toBeEnabled();
}
async function readonly(page){
 const f=fixture(),expiresAt=Date.now()+1800000;await page.addInitScript(({expiresAt})=>{localStorage.setItem('north12b_private_dashboard_device_id','SYNTHETIC_DEVICE_123456');sessionStorage.setItem('north12b_password_session_v1',JSON.stringify({v:1,owner:'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',deviceId:'SYNTHETIC_DEVICE_123456',token:'B1_a_'+'a'.repeat(64),logoutEpoch:'',expiresAt}));},{expiresAt});
 await route(page,()=>({...f,status:'ok',trustSource:'password-bound',phoneEligible:false,expiresAt}));await page.goto(base+'/readonly-dashboard.html');await expect(page.locator('#store-export')).toBeEnabled();
}
async function department(page){
 const f=D.input(),token=Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
 await route(page,p=>({status:'ok',...(p.action==='ptauth'?{token,expiresAt:Math.floor(Date.now()/1000)+3600}:p.action==='department_ops_read'?f.gold:p.action==='department_scores_read'?f.scores:{})}));await page.goto(base+'/department-ops.html');await page.locator('#passcode').fill('SYNTHETIC');await page.locator('#authForm button').click();await expect(page.locator('#goldDashboard')).toBeVisible();await page.locator('.department-export > summary').click();
}
async function patrol(page){
 const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Zp0AAAAASUVORK5CYII=';
 const snapshot={status:'ok',contract:'patrol-inspection-export-v1',month:'2026-11',stores:['萬大'],rows:[{checkId:'synthetic-check',date:'2026-11-04',store:'萬大',inspector:'合成督導',item:104,result:'abnormal',note:'合成缺失',media:[{id:'SYNTHETIC_PHOTO',name:'合成照片',mimeType:'image/png'}]}],revision:'synthetic-r1',readAt:'2026-11-05T00:00:00Z',demo:true};
 await route(page,p=>p.action==='pthealth'?{status:'ok',configured:true,contract:'patrol-auth-v3',sessionContract:'patrol-session-v2'}:p.action==='ptauth'?{status:'ok',token:'synthetic-token',expiresIn:1800,sessionContract:'patrol-session-v2'}:p.action==='half_export_snapshot'?snapshot:p.action==='half_export_photo'?{status:'ok',contract:snapshot.contract,mimeType:'image/png',dataUrl:png}:{status:'ok',rows:[],stores:[],schedule:null});
 await page.goto(base+'/patrol.html');await page.locator('#patrolPasscode').fill('SYNTHETIC');await page.getByRole('button',{name:'驗證並進入'}).click();await expect(page.locator('#patrolAuthGate')).toBeHidden();await page.locator('[data-view=half]').click();await page.locator('#halfExportMonth').fill('2026-11');
}
async function tradein(page){
 const r=createRuntime(),s=parsed();r.configure(s);const a={employeeId:OPERATOR,adminSecret:r.secret},p=r.a.tradeinPerformancePreview({source:s,...a}),v=r.a.tradeinPerformancePublish({source:s,...p,...a});r.a.tradeinPerformancePublicPublish({...a,month:s.month,sourceHash:s.source_sha256,expectedActiveHash:v.snapshotHash});await page.clock.install({time:new Date('2026-10-09T14:00:00Z')});await route(page,p=>r.dispatch(p));await page.goto(base+'/tradein-progress.html');await expect(page.locator('#downloadReminderHtml')).toBeEnabled();await page.locator('#reminderPriceSource > summary').click();
 const raw={sources:[{file:'SYNTHETIC.xlsx',sheet:'價格設定',date:'2026-11-01',validThrough:'2026-11-14',sha256:'a'.repeat(64)}],devices:[1000,900,800].map((price,i)=>({id:'s'+i,brand:'合成品牌',category:'手機',model:i?'合成機款'+i:'合成高價機',capacity:'128G',sourceFile:'SYNTHETIC.xlsx',variants:[{rawModel:'合成規格',items:[{vendor:'dianzi',grade:'A',price,row:i+2,part:'SYNTH-PART-'+i}]}]}))};
 await page.locator('#reminderPriceDate').fill('2026-11-05');await page.locator('#reminderPriceDate').dispatchEvent('change');await page.locator('#reminderPriceFile').setInputFiles({name:'SYNTHETIC-price.html',mimeType:'text/html',buffer:Buffer.from('<script type="application/json" id="DATA">'+JSON.stringify({recycle:raw})+'</script>')});await expect(page.locator('#reminderPriceStatus')).toContainText('已載入');await expect(page.locator('#reminderText')).toHaveValue(/合成高價機 128G｜1,000 元/);
}
for(const entry of inventory.entries)test(entry.id+' downloads its real HTML and opens in a fresh offline browser',async({page,browser},info)=>{
 if(['kpi','awards'].includes(entry.kind))await battle(page,entry);
 else if(entry.id==='store-readonly'||entry.id==='dashboard-renewal'){await readonly(page);if(entry.id==='dashboard-renewal'){await page.locator('#renewal-source').setInputFiles(book());await expect(page.locator('#renewal-export')).toBeEnabled();}}
 else if(entry.id==='officer-renewal'){await page.goto(base+'/north12-officer.html');await page.locator('#files').setInputFiles(book());await expect(page.locator('#export')).toBeEnabled();}
 else if(entry.kind==='department')await department(page);
 else if(entry.kind==='patrol')await patrol(page);
 else if(entry.kind.startsWith('query-')){const F=require('./threec-search-fixture.cjs');await route(page,p=>F[p.kind]());await page.goto(base+'/'+entry.page);await expect(page.locator(entry.control)).toBeEnabled();}
 else await tradein(page);
 const pending=page.waitForEvent('download');await page.locator(entry.control).click();const download=await pending;expect(download.suggestedFilename()).toMatch(/\.html$/);const bytes=await fs.readFile(await download.path());await download.saveAs(info.outputPath(entry.id+'.html'));const checks=await openDownloadedOffline(browser,bytes,entry.kind,info);if(entry.kind==='tradein'){await page.locator('#reminderPriceDate').fill('2026-11-15');await page.locator('#reminderPriceDate').dispatchEvent('change');await expect(page.locator('#reminderText')).not.toHaveValue(/1,000 元/);await expect(page.locator('#reminderText')).toHaveValue(/無有效且完整/);const wait=page.waitForEvent('download');await page.locator(entry.control).click();const expired=await wait;expect(await fs.readFile(await expired.path(),'utf8')).not.toContain('1,000 元');}results.push({...entry,...checks,bytes:bytes.length,downloadedFilename:download.suggestedFilename(),status:'passed'});
});
