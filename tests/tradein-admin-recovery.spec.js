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
   const message=JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/[<\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
   return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+message+',"*")</script>'});
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

test('paste local preview needs no administrator and sends no source request',async({page},info)=>{
 const {runtime,calls}=await start(page);await page.setViewportSize({width:390,height:844});
 await page.locator('#sourceMode').selectOption('paste');await page.locator('#sourcePaste').fill(csv().toString('utf8').replaceAll(',','\t'));
 await page.locator('#validateSource').click();await expect(page.locator('#uploadMessage')).toContainText('本機檢查完成');
 await expect(page.locator('#uploadLocalPreview')).toContainText('4 列；4 個回收碼');
 await expect(page.locator('#uploadLocalPreview')).toContainText('個人歸屬及正式台數仍須管理者核對');
 await expect(page.locator('#uploadLocalPreview')).toContainText('貼上來源雜湊');
 expect(calls.filter(a=>a!=='tradein_performance_public_read')).toEqual([]);expect(runtime.writes).toEqual([]);
 await expect(page.locator('#publishUpload')).toBeDisabled();
 const summary=await page.locator('#uploadLocalPreview').innerText();
 for(const value of ['12345','SYNTHETIC-REC','SYNTHETIC-ORDER'])expect(summary).not.toContain(value);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('SYNTHETIC-paste-local-preview-390.png'),fullPage:true});
});

test('unchanged file is decoded and hashed once across local and administrator preview',async({page})=>{
 await page.addInitScript(()=>{window.syntheticByteReads=0;const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){window.syntheticByteReads++;return original.call(this);};});
 const {runtime,prepare}=await start(page);await prepare();await page.locator('#validateSource').click();
 await expect(page.locator('#uploadLocalPreview')).toContainText('本機檢查完成');
 await page.locator('#previewUpload').click();await expect(page.locator('#uploadMessage')).toContainText('預覽核對完成');
 expect(await page.evaluate(()=>window.syntheticByteReads)).toBe(1);expect(runtime.writes).toEqual([]);
});

test('TSV source keeps its own hash, four requests retain backup and both verified projections',async({page},info)=>{
 const {runtime,calls,source}=await start(page),text=csv().toString('utf8').replaceAll(',','\t');
 const hash=require('node:crypto').createHash('sha256').update(text).digest('hex');runtime.configure({...source,source_sha256:hash});
 await page.locator('#sourceMode').selectOption('paste');await page.locator('#sourcePaste').fill(text);
 await page.locator('#validateSource').click();await expect(page.locator('#uploadLocalPreview')).toContainText(hash);
 await page.locator('#adminEmployeeId').fill(OPERATOR);await page.locator('#adminSecret').fill(runtime.secret);await page.locator('#completeScope').check();
 await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();
 const readsBefore=calls.filter(a=>a==='tradein_performance_public_read').length;
 await page.locator('#publishUpload').click();await expect(page.locator('#uploadMessage')).toContainText('同步成功');
 expect(calls.filter(a=>a!=='tradein_performance_public_read')).toEqual(['tradein_performance_preview','tradein_performance_checkpoint_capture','tradein_performance_publish','tradein_performance_public_publish']);
 expect(calls.filter(a=>a==='tradein_performance_public_read')).toHaveLength(readsBefore);
 expect([...runtime.files.values()].some(f=>f.getName().startsWith('north12b-tradein-checkpoint-'))).toBe(true);
 expect(runtime.a.tradeinPerformanceRegistry_().months[source.month].active.source_sha256).toBe(hash);
 await expect(page.locator('#publicWorkspace')).toBeVisible();await expect(page.locator('#stats')).toContainText('4 台');
 await expect(page.locator('#rollbackUpload')).toBeEnabled();await expect(page.locator('#sourcePaste')).toHaveValue('');
 await page.screenshot({path:info.outputPath('SYNTHETIC-four-request-verified.png'),fullPage:true});
});

test('older backend responses use the guarded status and public read fallback',async({page})=>{
 const {calls,prepare}=await start(page,{intercept:async({route,payload,runtime})=>{
  if(!['tradein_performance_preview','tradein_performance_public_publish'].includes(payload.action))return false;
  const old={...payload};delete old.includeCheckpointState;delete old.includeReadback;
  await route.fulfill({contentType:'application/json',body:JSON.stringify(runtime.dispatch(old))});return true;
 }});
 await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();
 const before=calls.filter(a=>a==='tradein_performance_public_read').length;
 await page.locator('#publishUpload').click();await expect(page.locator('#uploadMessage')).toContainText('同步成功');await expect(page.locator('#refreshData')).toBeEnabled();
 expect(calls.filter(a=>a==='tradein_performance_checkpoint_status')).toHaveLength(1);
 expect(calls.filter(a=>a==='tradein_performance_public_read')).toHaveLength(before+1);
 await expect(page.locator('#stats')).toContainText('4 台');
});

test('source editing invalidates an approved plan and malformed paste stays local',async({page})=>{
 const {runtime,calls}=await start(page);
 await page.locator('#sourceMode').selectOption('paste');await page.locator('#sourcePaste').fill(csv().toString('utf8'));
 await page.locator('#adminEmployeeId').fill(OPERATOR);await page.locator('#adminSecret').fill(runtime.secret);await page.locator('#completeScope').check();
 await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();
 await page.locator('#sourcePaste').fill(csv().toString('utf8').split('\n').slice(1).join('\n'));
 await expect(page.locator('#publishUpload')).toBeDisabled();await expect(page.locator('#uploadPreview')).toBeEmpty();
 await expect(page.locator('#uploadLocalPreview')).toBeEmpty();await page.locator('#validateSource').click();
 await expect(page.locator('#uploadMessage')).toContainText('本機檢查停止');
 expect(calls.filter(a=>a==='tradein_performance_preview')).toHaveLength(1);expect(runtime.writes).toEqual([]);
});

test('legacy public read rejection never reports success and never repeats either publisher',async({page})=>{
 let published=false;
 const {calls,prepare}=await start(page,{intercept:async({route,payload,runtime})=>{
  if(['tradein_performance_preview','tradein_performance_public_publish'].includes(payload.action)){
   const old={...payload};delete old.includeCheckpointState;delete old.includeReadback;
   const body=runtime.dispatch(old);if(payload.action==='tradein_performance_public_publish')published=true;
   await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});return true;
  }
  if(published&&payload.action==='tradein_performance_public_read'){
   const url=new URL(route.request().url()),body={status:'error',message:'SYNTHETIC_PUBLIC_READ_REJECTED'};
   if(url.searchParams.get('transport')==='iframe'){
    const value=JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body});
    await route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><script>window.top.postMessage('+value+',"*")</script>'});
   }else await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
   return true;
  }
  return false;
 }});
 await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();
 await page.locator('#publishUpload').click();await expect(page.locator('#uploadMessage')).toContainText('公開讀回未完成核對');
 await expect(page.locator('#uploadMessage')).not.toContainText('同步成功');await expect(page.locator('#publishUpload')).toBeDisabled();
 expect(calls.filter(a=>a==='tradein_performance_publish')).toHaveLength(1);expect(calls.filter(a=>a==='tradein_performance_public_publish')).toHaveLength(1);
});

test('stale bundled version is rejected during capture with no write or publish retry',async({page})=>{
 const {runtime,calls,prepare}=await start(page);await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();
 runtime.configure(parsed(),{counting_review_status:'pending'});
 await page.locator('#publishUpload').click();await expect(page.locator('#uploadMessage')).toContainText('同步未確認');
 expect(calls.filter(a=>a==='tradein_performance_checkpoint_capture')).toHaveLength(1);
 expect(calls.filter(a=>a==='tradein_performance_publish')).toHaveLength(0);expect(runtime.writes).toEqual([]);
 await expect(page.locator('#publishUpload')).toBeDisabled();
});

test('a wrong returned source hash does not claim verified publication or replay writes',async({page})=>{
 const {calls,prepare}=await start(page,{intercept:async({route,payload,runtime})=>{
  if(payload.action!=='tradein_performance_public_publish')return false;
  const body=runtime.dispatch(payload);body.sourceHash='f'.repeat(64);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});return true;
 }});
 await prepare();await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();
 await page.locator('#publishUpload').click();await expect(page.locator('#uploadMessage')).toContainText('公開讀回的來源、版本或台數不符');
 await expect(page.locator('#publishUpload')).toBeDisabled();
 expect(calls.filter(a=>a==='tradein_performance_publish')).toHaveLength(1);expect(calls.filter(a=>a==='tradein_performance_public_publish')).toHaveLength(1);
});

test('same-month cancellation reaches the guarded preview and requires a reviewed exact-source policy',async({page})=>{
 const {runtime,calls}=await start(page),lines=csv().toString('utf8').split('\n'),row=lines[2].split(',');row[26]='1151003';lines[2]=row.join(',');
 await page.locator('#sourceMode').selectOption('paste');await page.locator('#sourcePaste').fill(lines.join('\n'));
 await page.locator('#validateSource').click();await expect(page.locator('#uploadLocalPreview')).toContainText('取消 1 筆');
 await expect(page.locator('#uploadLocalPreview')).toContainText('淨額 0');
 await page.locator('#adminEmployeeId').fill(OPERATOR);await page.locator('#adminSecret').fill(runtime.secret);await page.locator('#completeScope').check();
 const source=parsed(Buffer.from(lines.join('\n')));runtime.configure(source,{counting_policy:'monthly-reset-same-month-net/v2'});
 await page.locator('#previewUpload').click();await expect(page.locator('#publishUpload')).toBeEnabled();
 await expect(page.locator('#uploadPreview')).toContainText('有效回收 3 台');expect(runtime.writes).toEqual([]);
 await page.locator('#publishUpload').click();await expect(page.locator('#uploadMessage')).toContainText('同步成功');
 expect(calls.filter(a=>a==='tradein_performance_publish')).toHaveLength(1);
 const registry=runtime.a.tradeinPerformanceRegistry_(),snapshot=runtime.a.tradeinPerformanceSnapshot_(registry.months[source.month].active);
 expect(snapshot.cancellation_evidence.pairs).toHaveLength(1);
 expect(snapshot.cancellation_evidence.pairs[0].sale.quantity).toBe(1);expect(snapshot.cancellation_evidence.pairs[0].cancellation.quantity).toBe(-1);
 await page.screenshot({path:test.info().outputPath('same-month-cancellation.png'),fullPage:true});
});

test('cross-month cancellation is visible locally and sends no administrative request',async({page})=>{
 const {runtime,calls}=await start(page),lines=csv().toString('utf8').replace('26年10月08日','26年11月03日').split('\n'),row=lines[2].split(',');row[26]='1151102';lines[2]=row.join(',');
 await page.locator('#sourceMode').selectOption('paste');await page.locator('#sourcePaste').fill(lines.join('\n'));await page.locator('#validateSource').click();
 await expect(page.locator('#uploadLocalPreview')).toContainText('跨月取消');await expect(page.locator('#uploadLocalPreview')).toContainText('不能同步');
 await page.locator('#adminEmployeeId').fill(OPERATOR);await page.locator('#adminSecret').fill(runtime.secret);await page.locator('#completeScope').check();
 await page.locator('#previewUpload').click();await expect(page.locator('#uploadMessage')).toContainText('整批停止同步');
 expect(calls.filter(a=>a!=='tradein_performance_public_read')).toEqual([]);expect(runtime.writes).toEqual([]);
});
