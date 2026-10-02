'use strict';
// Local synthetic data only. No existing browser, real token, or private API.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const root=path.resolve(process.argv[2]||''),out=path.resolve(process.argv[3]||'');
if(!process.argv[2]||!process.argv[3])throw Error('Provide isolated shadow and private output directories');
const cacheName=fs.readFileSync(path.join(root,'service-worker.js'),'utf8').match(/const CACHE_NAME = '([^']+)'/)[1];
const req=createRequire(path.join(root,'package.json')),{chromium}=req('playwright');
const C=req('./department-scores-core.js'),F=req('./tests/helpers/department-scores-synthetic.cjs'),{runtime}=req('./tests/helpers/department-ops-integration-runtime.cjs');
const b=runtime(),months=Array.from({length:6},(_,i)=>F.month({month:i+2}));
const token=b.post({action:'ptauth',key:'synthetic-passcode'}).token;
b.post({action:'department_scores_publish',token,contract:C.CONTRACT,confirm:true,requestId:crypto.randomUUID(),expectedGeneration:0,selectedMonthKeys:months.map(m=>m.monthKey),months,sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64)});
let origin,apiCalls=[],vendorReads=0;
const types={'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(request,response)=>{
 try{
  const u=new URL(request.url,origin);
  if(u.pathname==='/api'){
   let text='';for await(const part of request)text+=part;
   const payload=JSON.parse(text);apiCalls.push(payload.action);
   response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return response.end(JSON.stringify(b.post(payload)));
  }
  if(u.pathname==='/old-worker.js'){
   response.writeHead(200,{'Content-Type':'application/javascript','Service-Worker-Allowed':'/','Cache-Control':'no-store'});
   return response.end("self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===self.location.origin)e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});");
  }
  if(u.pathname==='/review-shell.html'){
   response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
   return response.end('<!doctype html><meta charset="utf-8"><script src="department-store-presentation-core.js?v=20261002-store-export-2"></script><script src="department-store-presentation-browser.js?v=20261002-store-export-2"></script><h1>Independent synthetic fixture</h1>');
  }
  const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep))throw Error('invalid path');
  let data=fs.readFileSync(file);
  if(/\.(js|html)$/.test(file))data=Buffer.from(data.toString().replace(/https:\/\/script\.google\.com\/macros\/s\/[^\s'"<>]+\/exec/g,origin+'/api'));
  if(u.pathname.endsWith('pptxgenjs-4.0.1.bundle.js'))vendorReads++;
  response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});response.end(data);
 }catch(e){response.writeHead(404);response.end(String(e.message));}
});
const findings=[],results=[],errors=[],external=[];let cached=[];
function result(name,passed,evidence){results.push({name,passed,evidence});console.log(JSON.stringify(results.at(-1)));if(!passed)findings.push(results.at(-1));}
async function context(browser,sw='block'){
 const c=await browser.newContext({acceptDownloads:true,serviceWorkers:sw});
 await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
 c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));return c;
}
async function login(c){const p=await c.newPage();await p.goto(origin+'/department-ops.html');await p.locator('#passcode').fill('synthetic-passcode');await p.locator('#authForm button').click();await p.locator('#workspace:not([hidden])').waitFor();await p.locator('[data-tab="store"]').click();await p.waitForFunction(()=>document.querySelector('#scoreBody').textContent.includes('合成店A1'));return p;}
async function clicks(p){let downloads=0;p.on('download',()=>downloads++);await p.locator('#scorePptx').click();await p.waitForFunction(()=>/PPT已產生|驗證已|正在產生/.test(document.querySelector('#scoreMessage').textContent));await p.waitForTimeout(250);return {downloads,message:await p.locator('#scoreMessage').textContent()};}
(async()=>{
 fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:'/Users/liamlu/Library/Caches/ms-playwright/chromium_headless_shell-1193/chrome-mac/headless_shell'});
 try{
  let c,p,start,count;
  if(process.env.REVIEW_SW_ONLY!=='1'){
  c=await context(browser);p=await c.newPage();start=apiCalls.length;
  await p.goto(origin+'/department-ops.html');await p.evaluate(()=>document.querySelector('#scorePptx').click());
  result('anonymous integrated export blocked',/驗證已結束/.test(await p.locator('#scoreMessage').textContent())&&apiCalls.length===start,{apiActions:apiCalls.slice(start),vendorReads});await c.close();
  c=await context(browser);p=await login(c);const successful=p.waitForEvent('download');await p.locator('#scorePptx').click();const positive=await successful;await positive.saveAs(path.join(out,'integrated-synthetic.pptx'));result('valid verified controller downloads editable PPTX',!(await positive.failure()),{bytes:fs.statSync(path.join(out,'integrated-synthetic.pptx')).size});await c.close();
  c=await context(browser);p=await login(c);await p.evaluate(()=>{const k='bei12b_patrol_session_token_v2',t=sessionStorage.getItem(k),v=JSON.parse(atob(t.split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));Date.now=()=>v.exp*1000+1000;});
  count=0;p.on('download',()=>count++);await p.locator('#scorePptx').click();await p.waitForFunction(()=>!/正在產生/.test(document.querySelector('#scoreMessage').textContent));
  result('expiry checked at export boundary',count===0,{downloadCount:count,status:await p.locator('#scoreMessage').textContent(),test:'Date.now beyond exact signed exp, before periodic timer'});await c.close();
  for(const [id,value] of [['scorePeriod','2026-06'],['scoreRegion','北一二B'],['scoreStore','合成店A1']]){
  c=await context(browser);p=await login(c);await p.evaluate(async()=>{const Orig=await DepartmentStorePresentationBrowser.loadVendor();window.pptxgen=class extends Orig{async write(o){await new Promise(r=>window.releaseWrite=r);return super.write(o)}};});
  count=0;p.on('download',()=>count++);await p.locator('#scorePptx').click();await p.waitForFunction(()=>!!window.releaseWrite);await p.locator('#'+id).selectOption(value);await p.evaluate(()=>window.releaseWrite());await p.waitForFunction(()=>!/正在產生/.test(document.querySelector('#scoreMessage').textContent));
  result(id+' change cancels old pending export',count===0,{downloadCount:count,selectedValue:value,status:await p.locator('#scoreMessage').textContent()});await c.close();
  }
  c=await context(browser);p=await login(c);await p.evaluate(async()=>{const Orig=await DepartmentStorePresentationBrowser.loadVendor();window.pptxgen=class extends Orig{async write(o){await new Promise(r=>window.releaseWrite=r);return super.write(o)}};});count=0;p.on('download',()=>count++);await p.locator('#scorePptx').click();await p.waitForFunction(()=>!!window.releaseWrite);await p.locator('#scoreRefresh').click();await p.waitForFunction(()=>document.querySelector('#scoreMessage').textContent.includes('已讀取'));await p.evaluate(()=>window.releaseWrite());await p.waitForFunction(()=>document.querySelector('#scoreMessage').textContent.includes('取消匯出'));
  result('reread invalidates pending export',count===0,{downloadCount:count,status:await p.locator('#scoreMessage').textContent()});await c.close();
  c=await context(browser);p=await login(c);await p.evaluate(async()=>{const Orig=await DepartmentStorePresentationBrowser.loadVendor();window.pptxgen=class extends Orig{async write(o){await new Promise(r=>window.releaseWrite=r);return super.write(o)}};});count=0;p.on('download',()=>count++);await p.locator('#scorePptx').click();await p.waitForFunction(()=>!!window.releaseWrite);await p.evaluate(()=>{const t=sessionStorage.getItem('bei12b_patrol_session_token_v2'),v=JSON.parse(atob(t.split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));Date.now=()=>v.exp*1000+1000;window.releaseWrite();});await p.waitForFunction(()=>document.querySelector('#scoreMessage').textContent.includes('取消匯出'));result('expiry rechecked at final async download boundary',count===0,{downloadCount:count});await c.close();
  c=await context(browser);p=await login(c);await p.evaluate(()=>{const t=sessionStorage.getItem('bei12b_patrol_session_token_v2'),v=JSON.parse(atob(t.split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));Date.now=()=>v.exp*1000+1000;});count=0;p.on('popup',()=>count++);await p.locator('#scorePrintPdf').click();result('expired integrated print blocked before popup',count===0&&/驗證已結束/.test(await p.locator('#scoreMessage').textContent()),{popupCount:count});await c.close();
  c=await context(browser);p=await login(c);await p.evaluate(()=>{const original=DepartmentStorePresentation.renderPrintHtml;DepartmentStorePresentation.renderPrintHtml=(m)=>{const html=original(m),t=sessionStorage.getItem('bei12b_patrol_session_token_v2'),v=JSON.parse(atob(t.split('.')[0].replace(/-/g,'+').replace(/_/g,'/')));Date.now=()=>v.exp*1000+1000;return html;};});count=0;p.on('popup',()=>count++);await p.locator('#scorePrintPdf').click();result('expiry rechecked after print preparation before popup',count===0&&/驗證已結束/.test(await p.locator('#scoreMessage').textContent()),{popupCount:count});await c.close();
  c=await context(browser);p=await login(c);const popup=await Promise.all([p.waitForEvent('popup'),p.locator('#scorePrintPdf').click()]).then(x=>x[0]);await popup.waitForLoadState();await p.evaluate(()=>window.dispatchEvent(new Event('department-session-cleared')));await p.waitForTimeout(100);
  result('session clear closes print popup',popup.isClosed(),{closed:popup.isClosed()});await c.close();
  c=await context(browser);p=await login(c);const realPopup=await Promise.all([p.waitForEvent('popup'),p.locator('#scorePrintPdf').click()]).then(x=>x[0]);await realPopup.waitForLoadState();await p.evaluate(async()=>{const Orig=await DepartmentStorePresentationBrowser.loadVendor();window.pptxgen=class extends Orig{async write(o){await new Promise(r=>window.releaseWrite=r);return super.write(o)}};});count=0;p.on('download',()=>count++);await p.locator('#scorePptx').click();await p.waitForFunction(()=>!!window.releaseWrite);p.once('dialog',d=>d.accept());await p.locator('#departmentLogout').click();await p.evaluate(()=>window.releaseWrite());await p.waitForTimeout(100);
  result('PR149 actual portal logout clears print popup',realPopup.isClosed(),{closed:realPopup.isClosed(),dataStillPresent:realPopup.isClosed()?false:await realPopup.locator('body').textContent().then(t=>t.includes('合成店A1'))});
  result('PR149 actual portal logout suppresses pending download',count===0,{downloadCount:count,pageerrors:errors.slice(),locked:await p.evaluate(()=>PortalLogout.isLocked())});await c.close();
  c=await context(browser);p=await login(c);const crossPopup=await Promise.all([p.waitForEvent('popup'),p.locator('#scorePrintPdf').click()]).then(x=>x[0]);await crossPopup.waitForLoadState();const other=await login(c);other.once('dialog',d=>d.accept());await other.locator('#departmentLogout').click();await p.waitForTimeout(200);result('cross-tab actual portal logout clears print popup',crossPopup.isClosed(),{closed:crossPopup.isClosed(),dataStillPresent:!crossPopup.isClosed()});await c.close();
  }
  if(process.env.REVIEW_AUTH_ONLY!=='1'){
  c=await context(browser,'allow');p=await c.newPage();await p.goto(origin+'/review-shell.html');
  await p.evaluate(async()=>{const cache=await caches.open('liam-supervisor-app-synthetic-old');await cache.put('/department-scores.js?v=old',new Response('SYNTHETIC_OLD_CONTROLLER'));await navigator.serviceWorker.register('/old-worker.js',{scope:'/'});await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller)await new Promise(r=>navigator.serviceWorker.addEventListener('controllerchange',r,{once:true}));await navigator.serviceWorker.register('/service-worker.js?v=20261002-store-export-2',{scope:'/',updateViaCache:'none'});});
  await p.waitForFunction(()=>navigator.serviceWorker.controller?.scriptURL.includes('/service-worker.js'));
  for(let i=0;i<40;i++){const keys=await p.evaluate(()=>caches.keys());if(keys.length===1&&keys[0]===cacheName)break;await p.waitForTimeout(50);}
  const state=await p.evaluate(async()=>({controlled:!!navigator.serviceWorker.controller,workerURL:navigator.serviceWorker.controller.scriptURL,keys:await caches.keys(),controller:(await (await fetch('/department-scores.js?v=20261002-store-export-2')).text()).includes('presentationExporter')}));
  result('actual SW cache upgrade preserves integrated controller',state.controlled&&state.controller&&state.keys.length===1,state);
  await p.evaluate(()=>DepartmentStorePresentationBrowser.loadVendor());await p.waitForTimeout(100);
  await p.evaluate(async t=>{await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'department_ops_read',token:t})});},token);
  cached=await p.evaluate(async name=>{const c=await caches.open(name);return(await c.keys()).map(r=>new URL(r.url).pathname);},cacheName);
  result('presentation source and vendor cached by controlled SW',cached.includes('/department-store-presentation-core.js')&&cached.includes('/department-store-presentation-browser.js')&&cached.includes('/assets/vendor/store-presentation/pptxgenjs-4.0.1.bundle.js'),{cachedPresentation:cached.filter(x=>/presentation/.test(x))});
  await c.setOffline(true);const offline=await p.evaluate(async()=>{const r={};for(const x of ['department-store-presentation-core.js?v=20261002-store-export-2','department-store-presentation-browser.js?v=20261002-store-export-2','assets/vendor/store-presentation/pptxgenjs-4.0.1.bundle.js']){try{const response=await fetch(x);r[x]=response.ok}catch(e){r[x]=false}}return r;});
  result('SW controlled offline module reload',Object.values(offline).every(Boolean),offline);await c.close();
  }
  if(process.env.REVIEW_AUTH_ONLY!=='1')result('no private API cached in actual controlled SW',cached.every(x=>x!=='/api'),{privateApiCached:cached.includes('/api')});
  result('no external or production network',external.length===0,{external});
  if(findings.length)throw Error(findings.length+' integrated checks failed');
 }finally{await browser.close();server.close();fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({root,results,findings,pageerrors:errors,external,apiActions:apiCalls,vendorReads},null,2));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
