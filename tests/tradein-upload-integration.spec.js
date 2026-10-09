'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path');
const {createRuntime,csv,parsed,OPERATOR,DEVICE}=require('./helpers/tradein-synthetic-runtime.cjs');
const Ref=require('./tradein-reference-fixture.cjs'),Prices=require('./threec-search-fixture.cjs');
const {spawnSync}=require('node:child_process');
let server,BASE;
test.beforeAll(async()=>{
 const root=path.resolve(__dirname,'..');
 server=http.createServer(async(req,res)=>{try{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(path.relative(root,file).startsWith('..'))throw Error('outside');
  const type={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css'}[path.extname(file)];
  if(!type)throw Error('unsupported');
  res.writeHead(200,{'Content-Type':type+';charset=utf-8','Connection':'close'});res.end(await fs.readFile(file));
 }catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));BASE='http://127.0.0.1:'+server.address().port+'/';
});
test.afterAll(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
async function connect(page,r){
 const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-08T09:00:00Z')});
 await page.addInitScript(device=>localStorage.setItem('north12b_private_dashboard_device_id',device),DEVICE);
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===new URL(BASE).origin){
   if(url.pathname.endsWith('/tradein-progress.html'))return route.fulfill({contentType:'text/html; charset=utf-8',
    body:(await fs.readFile(path.resolve(__dirname,'./fixtures/tradein-private-progress.html'),'utf8')).replace('data-performance-release="pending"','data-performance-release="ready"')});
   return route.continue();
  }
  if(url.hostname!=='script.google.com')return route.abort('blockedbyclient');
  let p;try{
   const text=route.request().postData()||'{}';
   try{p=JSON.parse(text);}catch{p=JSON.parse(new URLSearchParams(text).get('payload')||'{}');}
   if(typeof p.action!=='string')return route.abort('blockedbyclient');
  }catch{return route.abort('blockedbyclient');}
  calls.push(p);let body;
  if(p.action.startsWith('tradein_performance_'))body=r.dispatch(p);
  else if(p.action==='threec_snapshot_read')body=Prices[p.kind]();
  else if(p.action==='threec_changes_read')body={status:'ok',changeSet:{kind:p.kind,changes:[],changeCount:0,totalChangeCount:0,hasMore:false}};
  else return route.abort('blockedbyclient');
  if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html',body:'<script>window.top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body})+', "*")</script>'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 return {calls,errors};
}
async function login(page,id=OPERATOR){
 await page.locator('#employeeId').fill(id);await page.locator('#loginForm button').click();
 await expect(page.locator('#privateWorkspace')).toBeVisible();
}
async function upload(page,bytes=csv()){
 await page.locator('#sourceFile').setInputFiles({name:'SYNTHETIC-SAR74.csv',mimeType:'text/csv',buffer:bytes});
 await page.locator('#completeScope').check();await page.locator('#adminSecret').fill('SYNTHETIC_ADMIN_ONLY');
 await page.locator('#previewUpload').click();
}
for(const width of [1280,390,320])test(width+'px synthetic CSV through real parser/API, three scopes, copy, PNG/XLSX and APP readback',async({page},info)=>{
 let bytes=csv();if(width===390){const encoded=spawnSync('python3',['-c','import sys;sys.stdout.buffer.write(sys.stdin.buffer.read().decode("utf-8").encode("cp950"))'],{input:bytes});expect(encoded.status).toBe(0);bytes=encoded.stdout;}
 const r=createRuntime();r.configure(parsed(bytes));const {calls,errors}=await connect(page,r);await page.setViewportSize({width,height:900});
 await page.goto(new URL('tradein-progress.html',BASE).href);await login(page);
 await expect(page.locator('#self')).toContainText('尚未有資料');await expect(page.locator('#exportPanel')).toBeHidden();
 await upload(page,bytes);await expect(page.locator('#uploadPreview')).toContainText('有效回收 4 台');
 await expect(page.locator('#uploadPreview')).toContainText('2 人 × 3 ＝ 6 台');expect(r.writes).toEqual([]);
 await expect(page.locator('#publishUpload')).toBeEnabled();await page.locator('#publishUpload').click();
 await expect(page.locator('#uploadMessage')).toContainText('回讀核對通過');
 await expect(page.locator('#stats')).toContainText('4 台');await expect(page.locator('#stats')).toContainText('0 / 2');
 await page.locator('[data-private-scope="store"]').click();await expect(page.locator('#storeRows tr')).toHaveCount(9);
 await expect(page.locator('#storeRows')).toContainText('1 / 3');
 await page.locator('[data-private-scope="person"]').click();await expect(page.locator('#staffRows tr')).toHaveCount(4);
 await expect(page.locator('#staffRows')).toContainText('不設目標');
 await page.locator('#staffStore').selectOption('萬大');await expect(page.locator('#staffRows tr')).toHaveCount(2);
 // Browser API double, restricted to this isolated context; leaves the owner's clipboard untouched.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.syntheticClipboard=text;}}}));
 await page.locator('#copyReminder').click();await expect(page.locator('#exportFeedback')).toContainText('已複製');
 expect(await page.evaluate(()=>window.syntheticClipboard)).toContain('萬大');
 expect(await page.evaluate(()=>window.syntheticClipboard)).not.toContain('取消回沖原');
 expect(await page.evaluate(()=>window.syntheticClipboard)).toContain('沖回月份待核');
 for(const [button,extension] of [['downloadReminderPng','.png'],['downloadReminderXlsx','.xlsx']]){
  const pending=page.waitForEvent('download');await page.locator('#'+button).click();const download=await pending;
  await download.saveAs(info.outputPath('SYNTHETIC-upload-filtered'+extension));
  const bytes=await fs.readFile(await download.path());expect(bytes.length).toBeGreaterThan(1000);
  if(extension==='.png')expect([...bytes.subarray(0,4)]).toEqual([137,80,78,71]);
  else {expect(bytes.subarray(0,2).toString()).toBe('PK');const content=bytes.toString('utf8');expect(content).not.toContain('ZX00001');expect(content).not.toContain('SYNTHETIC-REC');}
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('SYNTHETIC-upload-'+width+'.png'),fullPage:true});
 const writes=r.writes.length;await page.reload();await expect(page.locator('#stats')).toContainText('4 台');expect(r.writes.length).toBe(writes);
 await page.goto(new URL('app.html',BASE).href);
 await page.getByRole('region',{name:'公開查價'}).getByRole('link',{name:'舊換新專區',exact:true}).click();
 await expect(page.locator('#tradeinResults')).toContainText('示範回收');
 await page.locator('a[href="tradein-progress.html"]').click();await expect(page.locator('#stats')).toContainText('4 台');
 expect(r.writes.length).toBe(writes);expect(calls.filter(p=>p.action==='tradein_performance_publish')).toHaveLength(1);expect(errors).toEqual([]);
});
test('missing monthly basis keeps upload unsynchronizable and makes zero writes',async({page})=>{
 const r=createRuntime();r.configure(parsed());r.configs.delete('north12b-tradein-monthly-roster-2026-10.json');
 await connect(page,r);await page.goto(new URL('tradein-progress.html',BASE).href);await login(page);await upload(page);
 await expect(page.locator('#uploadMessage')).toContainText('本月正式名冊');await expect(page.locator('#publishUpload')).toBeDisabled();
 await expect(page.locator('#exportPanel')).toBeHidden();expect(r.writes).toEqual([]);
});
for(const id of ['12345','12346','12347'])test('real API self projection '+id+' after synthetic publication',async({page})=>{
 const r=createRuntime(),s=parsed();r.configure(s);const p=r.a.tradeinPerformancePreview({source:s,employeeId:OPERATOR,adminSecret:r.secret});
 r.a.tradeinPerformancePublish({source:s,employeeId:OPERATOR,adminSecret:r.secret,...p});
 const {errors}=await connect(page,r);await page.goto(new URL('tradein-progress.html',BASE).href);await login(page,Ref.IDS[id]);
 await expect(page.locator('#supervisorArea')).toBeHidden();await expect(page.locator('#maintenance')).toBeHidden();
 await expect(page.locator('#exportScope option')).toHaveText(['本人']);
 await expect(page.locator('#self')).toContainText(id==='12345'?'本月尚缺 2 台':'保留實績，不設目標');expect(errors).toEqual([]);
});
