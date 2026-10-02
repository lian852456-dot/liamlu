// Headless isolated browser only. Never connects to a production page or API.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),JSZip=require('jszip');
const root=path.resolve(__dirname,'..'),out=process.env.STORE_PRESENTATION_TEST_OUTPUT;
if(!out||!path.isAbsolute(out)||out.startsWith(root+path.sep))throw new Error('Set STORE_PRESENTATION_TEST_OUTPUT to private absolute directory outside repo');
fs.mkdirSync(out,{recursive:true});
const months=['2026-02','2026-03','2026-04','2026-05','2026-06','2026-07'];
const fixture={contract:'north12-scores-brief-v1',period:months,filters:{},records:months.flatMap((monthKey,i)=>[
 {monthKey,region:'北一二A',store:'合成甲店',score:100,defects:0,deduction:0,metrics:[]},
 {monthKey,region:'北一二B',store:'合成乙店',score:99-i*.1,defects:1,deduction:1+i*.1,metrics:[{kind:'defect',status:'number',value:1,unit:'原表單位',group:'文件回送',label:'疏失數',cell:'Z11'}]}
])};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.STORE_TEST_CHROMIUM || chromium.executablePath()}),results=[];
 const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'block'});
 let vendorReads=0,unexpectedRequests=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin!=='http://store-presentation.test'){unexpectedRequests.push(u.origin);return route.abort();}
  if(u.pathname==='/'){return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script src="/department-store-presentation-core.js"></script><script src="/department-store-presentation-browser.js"></script><button id="ppt">產生PPT</button>'});}
  const f=path.resolve(root,'.'+u.pathname);if(!f.startsWith(root+path.sep))return route.abort();
  if(u.pathname.endsWith('.bundle.js'))vendorReads++;
  return route.fulfill({path:f,contentType:'text/javascript'});
 });
 const page=await context.newPage();await page.goto('http://store-presentation.test');
 await page.evaluate(f=>{window.testBrief=f;window.authorized=true;window.options={};window.statuses=[];window.exporter=DepartmentStorePresentationBrowser.createExporter({getBrief:()=>testBrief,isAuthorized:()=>authorized,getOptions:()=>options,onStatus:v=>statuses.push(v)});document.querySelector('#ppt').onclick=()=>exporter.downloadPptx().catch(e=>window.lastError=e.message);},fixture);
 assert.equal(vendorReads,0);results.push('vendor lazy loading before click');
 let waiting=page.waitForEvent('download');await page.click('#ppt');let download=await Promise.race([waiting,page.waitForFunction(()=>!!window.lastError).then(async()=>{throw new Error(await page.evaluate(()=>lastError))})]);const first=path.join(out,'synthetic-browser.pptx');await download.saveAs(first);
 assert.equal(await download.failure(),null);assert.equal(vendorReads,1);const zip=await JSZip.loadAsync(fs.readFileSync(first));
 const slides=Object.keys(zip.files).filter(k=>/^ppt\/slides\/slide\d+\.xml$/.test(k));assert.equal(slides.length,2);let count=0;for(const s of slides){const xml=await zip.file(s).async('string');count+=(xml.match(/<a:tbl>/g)||[]).length;assert.doesNotMatch(xml,/<p:pic>/);assert.doesNotMatch(xml,/anchor="mid"/);for(const m of xml.matchAll(/<a:tcPr[^>]*marL="(\d+)"/g))assert.ok(Number(m[1])<200000,'native cell margins fit content width')}assert.equal(count,7);results.push('one-click valid 2-slide native editable PPTX download');
 await context.setOffline(true);waiting=page.waitForEvent('download');await page.click('#ppt');download=await waiting;await download.saveAs(path.join(out,'synthetic-offline.pptx'));assert.equal(vendorReads,1);results.push('offline export after same-origin vendor loaded');await context.setOffline(false);
 await page.evaluate(()=>{options={region:'北一二B',store:'合成乙店',startMonth:'2026-05'};});waiting=page.waitForEvent('download');await page.click('#ppt');download=await waiting;const filtered=path.join(out,'synthetic-filtered.pptx');await download.saveAs(filtered);const z=await JSZip.loadAsync(fs.readFileSync(filtered));const note=await z.file('ppt/notesSlides/notesSlide1.xml').async('string');assert.match(note,/合成乙店/);assert.doesNotMatch(note,/合成甲店/);assert.match(note,/未評估|sixPerfect/);results.push('month / region / store filters preserved in export');
 await page.evaluate(()=>{authorized=false;});await page.click('#ppt');await page.waitForFunction(()=>!!window.lastError);assert.match(await page.evaluate(()=>lastError),/驗證已結束/);results.push('anonymous / expired export blocked');
 await page.evaluate(()=>{authorized=true;options={};lastError='';});
 const outcome=await page.evaluate(async()=>{const Original=window.PptxGenJS||window.pptxgen;window.pptxgen=class extends Original {async write(o){await new Promise(r=>setTimeout(r,60));return super.write(o)}};const action=exporter.downloadPptx();setTimeout(()=>{authorized=false;exporter.invalidate()},10);try{await action;return 'unexpected'}catch(e){return e.message}finally{delete window.pptxgen}});assert.match(outcome,/驗證已結束/);results.push('logout during generation cancels download');
 const print=await page.evaluate(()=>{authorized=true;let written='';const old=window.open;window.open=()=>({document:{open(){},write(v){written=v},close(){}},close(){}});exporter.printPdf();window.open=old;return written;});assert.match(print,/window.print/);assert.equal((print.match(/<main class="page">/g)||[]).length,2);results.push('separate print / save-PDF label and two-page print content');
 assert.deepEqual(unexpectedRequests,[]);results.push('zero external / production requests');
 const large=require('./fixtures/department-store-presentation-overflow.cjs')();
 await page.evaluate(f=>{testBrief=f;options={};authorized=true;lastError='';},large);waiting=page.waitForEvent('download');await page.click('#ppt');download=await waiting;const overflowFile=path.join(out,'synthetic-overflow.pptx');await download.saveAs(overflowFile);
 const model=require('../department-store-presentation-core.js').buildModel(large),verified=await require('./store-presentation-native-check.cjs')(fs.readFileSync(overflowFile),model);
 assert.equal(verified.slides,6);assert.equal(verified.trendRows,44);assert.equal(verified.deficitRows,30);assert.equal(verified.reasonRows,15);assert.equal(verified.perfectQualifierShapes,14);results.push('all overflow rows / reasons / qualifier shapes survive six-page native PPTX');
 fs.writeFileSync(path.join(out,'browser-receipt.json'),JSON.stringify({status:'PASS',tests:results.length,results,vendorReads,unexpectedRequests},null,2));
 console.log(JSON.stringify({status:'PASS',tests:results.length,results}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
