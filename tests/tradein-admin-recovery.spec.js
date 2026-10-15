'use strict';
const {test,expect}=require('@playwright/test');
const {createRuntime,csv,parsed,OPERATOR}=require('./helpers/tradein-synthetic-runtime.cjs');
const {spawnSync}=require('node:child_process');
const BASE=process.env.TEST_BASE_URL;

async function start(page,{intercept,seed=false,bytes=csv()}={}){
 const runtime=createRuntime(),source=parsed(bytes),calls=[],responses=[];runtime.configure(source);
 if(seed){
  const preview=runtime.dispatch({action:'tradein_performance_preview',source,employeeId:OPERATOR,adminSecret:runtime.secret});
  const result=runtime.dispatch({action:'tradein_performance_publish',source,...preview,employeeId:OPERATOR,adminSecret:runtime.secret});
  runtime.dispatch({action:'tradein_performance_public_publish',month:source.month,sourceHash:source.source_sha256,expectedActiveHash:result.snapshotHash,employeeId:OPERATOR,adminSecret:runtime.secret});
 }
 await page.clock.install({time:new Date('2026-10-09T14:00:00Z')});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===new URL(BASE).origin)return route.continue();
  if(url.hostname!=='script.google.com')return route.abort();
  const raw=route.request().postData();let payload;
  try{payload=JSON.parse(raw);}catch{payload=JSON.parse(new URLSearchParams(raw).get('payload'));}
  calls.push(payload.action);
  if(await intercept?.({route,payload,runtime}))return;
  const body=runtime.dispatch(payload);
  responses.push({action:payload.action,status:body.status});
  if(url.searchParams.get('transport')==='iframe'){
   const message=JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c');
   return route.fulfill({contentType:'text/html',body:'<!doctype html><script>window.top.postMessage('+message+',"*")</script>'});
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(BASE+'tradein-progress.html');await expect(page.locator('#refreshData')).toBeEnabled();
 await page.locator('#maintenance summary').click();
 async function prepare(fileBytes=bytes){
  await page.locator('#adminEmployeeId').fill(OPERATOR);await page.locator('#adminSecret').fill(runtime.secret);
  await page.locator('#sourceFile').setInputFiles({name:'SYNTHETIC-SAR74.csv',mimeType:'text/csv',buffer:fileBytes});
  await page.locator('#completeScope').check();
 }
 return {runtime,calls,responses,source,prepare};
}

test('pending preview names the server stage, times out once, and can be retried',async({page},info)=>{
 let stalled=true;
 const {calls,runtime,prepare}=await start(page,{intercept:async({payload})=>stalled&&payload.action==='tradein_performance_preview'});
 await prepare();await page.locator('#previewUpload').click();
 await expect.poll(()=>calls.includes('tradein_performance_preview')).toBe(true);
 await expect(page.locator('#uploadMessage')).toContainText('檔案已讀取，正在核對管理者與本月資料');
 await expect(page.locator('#previewUpload')).toBeDisabled();
 await expect(page.locator('#adminSecret')).toHaveValue('');
 await page.clock.fastForward(10001);await expect(page.locator('#uploadMessage')).toContainText('最多 60 秒');
 await page.clock.fastForward(50000);
 await expect(page.locator('#uploadMessage')).toContainText('服務核對逾時（60 秒）');
 for(const id of ['previewUpload','sourceFile','adminEmployeeId','adminSecret','completeScope','periodMonth'])await expect(page.locator('#'+id)).toBeEnabled();
 await expect(page.locator('#publishUpload')).toBeDisabled();await expect(page.locator('#cancelPreview')).toBeHidden();
 expect(runtime.writes).toEqual([]);expect(calls.filter(a=>a==='tradein_performance_preview')).toHaveLength(1);
 await page.screenshot({path:info.outputPath('SYNTHETIC-preview-timeout-recovered.png'),fullPage:true});
 stalled=false;await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#uploadMessage')).toContainText('預覽核對完成');
 await expect(page.locator('#publishUpload')).toBeEnabled();expect(runtime.writes).toEqual([]);
 expect(calls.filter(a=>a==='tradein_performance_preview')).toHaveLength(2);
});

test('cancel releases a pending preview and ignores its late reply during the next preview',async({page})=>{
 let first;
 const {calls,runtime,prepare}=await start(page,{intercept:async({route,payload})=>{
  if(payload.action==='tradein_performance_preview'&&!first){first=route;return true;}return false;
 }});
 await prepare();await page.locator('#previewUpload').click();await expect.poll(()=>Boolean(first)).toBe(true);
 await page.locator('#cancelPreview').click();await expect(page.locator('#uploadMessage')).toContainText('已取消預覽');
 await expect(page.locator('#publishUpload')).toBeDisabled();await expect(page.locator('#sourceFile')).toBeEnabled();
 await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#uploadMessage')).toContainText('預覽核對完成');
 await first.fulfill({contentType:'application/json',body:JSON.stringify({status:'error',message:'SYNTHETIC_LATE_REPLY'})}).catch(()=>{});
 await page.clock.fastForward(65000);await expect(page.locator('#uploadMessage')).toContainText('預覽核對完成');
 await expect(page.locator('#publishUpload')).toBeEnabled();expect(calls.filter(a=>a==='tradein_performance_preview')).toHaveLength(2);expect(runtime.writes).toEqual([]);
});

test('a pending file read stops before any admin API and unlocks the original file input',async({page})=>{
 await page.addInitScript(()=>{File.prototype.arrayBuffer=()=>new Promise(()=>{});});
 const {calls,runtime,prepare}=await start(page);await prepare();await page.locator('#previewUpload').click();
 await expect(page.locator('#uploadMessage')).toHaveText('正在讀取 CSV 檔案…');await page.clock.fastForward(10001);
 await expect(page.locator('#uploadMessage')).toContainText('讀取檔案逾時');await expect(page.locator('#sourceFile')).toBeEnabled();
 expect(calls.filter(a=>a!=='tradein_performance_public_read')).toEqual([]);expect(runtime.writes).toEqual([]);
});

test('a pending digest stops before any admin API and does not produce a fake hash',async({page})=>{
 await page.addInitScript(()=>{crypto.subtle.digest=()=>new Promise(()=>{});});
 const {calls,runtime,prepare}=await start(page);await prepare();await page.locator('#previewUpload').click();
 await expect(page.locator('#uploadMessage')).toContainText('正在解析 CSV');await page.clock.fastForward(10001);
 await expect(page.locator('#uploadMessage')).toContainText('來源完整性核對逾時');await expect(page.locator('#previewUpload')).toBeEnabled();
 expect(calls.filter(a=>a!=='tradein_performance_public_read')).toEqual([]);expect(runtime.writes).toEqual([]);
});

test('an authoritative admin rejection stops without retry or publish',async({page})=>{
 const {calls,runtime,prepare}=await start(page,{intercept:async({route,payload})=>{
  if(payload.action!=='tradein_performance_preview')return false;
  await route.fulfill({contentType:'application/json',body:JSON.stringify({status:'error',message:'SYNTHETIC 管理者驗證失敗'})});return true;
 }});
 await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#uploadMessage')).toContainText('SYNTHETIC 管理者驗證失敗');
 await expect(page.locator('#previewUpload')).toBeEnabled();await expect(page.locator('#publishUpload')).toBeDisabled();
 await page.clock.fastForward(65000);expect(calls.filter(a=>a==='tradein_performance_preview')).toHaveLength(1);expect(runtime.writes).toEqual([]);
});

test('pagehide aborts a pending preview and prevents a late publish plan',async({page})=>{
 let pending;
 const {runtime,prepare}=await start(page,{intercept:async({route,payload})=>{
  if(payload.action==='tradein_performance_preview'){pending=route;return true;}return false;
 }});
 await prepare();await page.locator('#previewUpload').click();await expect.poll(()=>Boolean(pending)).toBe(true);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
 await pending.fulfill({contentType:'application/json',body:JSON.stringify({status:'error',message:'SYNTHETIC_LATE_REPLY'})}).catch(()=>{});
 await page.clock.fastForward(65000);await expect(page.locator('#publishUpload')).toBeDisabled();await expect(page.locator('#previewUpload')).toBeEnabled();
 await expect(page.locator('#uploadPreview')).toBeEmpty();await expect(page.locator('#adminSecret')).toHaveValue('');expect(runtime.writes).toEqual([]);
});

test('a lost publish reply is never replayed and re-preview preserves same-source idempotence',async({page})=>{
 let loseReply=true;
 const {calls,runtime,prepare}=await start(page,{intercept:async({payload,runtime})=>{
  if(payload.action==='tradein_performance_publish'&&loseReply){runtime.dispatch(payload);return true;}return false;
 }});
 await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();
 await page.locator('#publishUpload').click();await expect.poll(()=>calls.includes('tradein_performance_publish')).toBe(true);
 await expect(page.locator('#cancelPreview')).toBeHidden();await page.clock.fastForward(60001);
 await expect(page.locator('#uploadMessage')).toContainText('同步未確認');await expect(page.locator('#uploadMessage')).toContainText('系統未自動重送');
 expect(calls.filter(a=>a==='tradein_performance_publish')).toHaveLength(1);
 expect(calls.filter(a=>a==='tradein_performance_public_publish')).toHaveLength(0);
 await expect(page.locator('#publishUpload')).toBeDisabled();await expect(page.locator('#previewUpload')).toBeEnabled();
 const before=runtime.a.tradeinPerformanceRegistry_().months['2026-10'].active;
 loseReply=false;await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();
 // The original guarded publisher determines same-source no-op; no client replay is used.
 const preview=runtime.dispatch({action:'tradein_performance_preview',source:parsed(),employeeId:OPERATOR,adminSecret:runtime.secret});
 const writes=runtime.writes.length;
 const result=runtime.dispatch({action:'tradein_performance_publish',source:parsed(),...preview,employeeId:OPERATOR,adminSecret:runtime.secret});
 expect(result.status).toBe('unchanged');expect(result.snapshotHash).toBe(before.snapshot_hash);expect(runtime.writes.length).toBe(writes);
});

test('Big5 29-column CSV previews without writes and two confirmed imports keep one active result',async({page},info)=>{
 const encoded=spawnSync('python3',['-c','import sys;sys.stdout.buffer.write(sys.stdin.buffer.read().decode("utf-8").encode("cp950"))'],{input:csv()});
 expect(encoded.status).toBe(0);
 const {runtime,calls,responses,source,prepare}=await start(page,{bytes:encoded.stdout});
 expect(source.header_column_count).toBe(29);expect(source.source_start).toBe('2026-10-01');expect(source.source_end).toBe('2026-10-07');
 await page.setViewportSize({width:390,height:844});await prepare();await page.locator('#previewUpload').click();
 await expect(page.locator('#uploadMessage')).toContainText('預覽核對完成');expect(runtime.writes).toEqual([]);
 await page.screenshot({path:info.outputPath('SYNTHETIC-big5-preview-390.png'),fullPage:true});
 await page.locator('#publishUpload').click();await expect(page.locator('#uploadMessage')).toContainText('同步成功');await expect(page.locator('#refreshData')).toBeEnabled();
 const original=runtime.a.tradeinPerformanceRegistry_().months[source.month].active;
 const publicBefore=runtime.a.tradeinPerformancePublicRead({month:source.month}).snapshot;
 await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();await page.locator('#publishUpload').click();
 await expect(page.locator('#uploadMessage')).toContainText('同步成功');await expect(page.locator('#refreshData')).toBeEnabled();
 expect(runtime.a.tradeinPerformanceRegistry_().months[source.month].active.snapshot_hash).toBe(original.snapshot_hash);
 expect(JSON.stringify(runtime.a.tradeinPerformancePublicRead({month:source.month}).snapshot)).toBe(JSON.stringify(publicBefore));
 expect(responses.filter(r=>r.action==='tradein_performance_publish').map(r=>r.status)).toEqual(['published','unchanged']);
 expect(responses.filter(r=>r.action==='tradein_performance_public_publish').map(r=>r.status)).toEqual(['published','unchanged']);
 expect(calls.filter(action=>action==='tradein_performance_preview')).toHaveLength(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
