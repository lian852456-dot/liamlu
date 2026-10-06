'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const helpers=html.slice(html.indexOf('function parseManagementFocus('),html.indexOf('function getFormData('));
const save=html.slice(html.indexOf('async function saveToStorage('),html.indexOf('function pct('));
const date='2099-10-02',store='酒泉',seg=21;
const data={aq999:1,aq1399:1,haosu:1,rt999:1,rt1399:1,insurance_num:0,insurance_den:0,insurance_pct:null,management_focus_json:JSON.stringify({op_online:0,op_accum:0,op_target:0,mycharge_clicked:0,mycharge_tagged:0,mycharge_pct:null})};
const row={...data,date,store,seg};
const receipt={status:'ok',rowWritten:true,readbackMatches:true,spreadsheetId:'10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA',sheetName:'回報資料',date,store,seg,readback:row};
function setup(response=receipt,readError=null){
 const calls=[],shadow=[];
 const c={GAS_URL:'synthetic-only',dailyReportReadContext:0,_cache:{},_cacheReadGeneration:{},DOMException,cacheKey:()=> 'day',writeLocalShadow(...x){shadow.push(x);},async privateDashboardPost(payload,options){calls.push({payload,options});if(payload.action==='write')return response;if(readError)throw readError;return {status:'ok',data:{[store]:row}};}};
 vm.runInNewContext(helpers+save,c);return {c,calls,shadow};
}
test('core server readback confirms closing data with one write and no extra full-day read',async()=>{
 const {c,calls,shadow}=setup();assert.equal(await c.saveToStorage(date,store,seg,data),true);
 assert.deepEqual(calls.map(x=>x.payload.action),['write']);assert.equal(shadow.length,1);assert.equal(c._cache.day[store].insurance_pct,null);
});
for(const patch of [{date:'2099-10-01'},{store:'永吉'},{seg:16},{aq999:2},{management_focus_json:'{}'}])test('mismatching receipt fails closed '+JSON.stringify(patch),async()=>{
 const {c,calls,shadow}=setup({...receipt,readback:{...row,...patch}});
 await assert.rejects(c.saveToStorage(date,store,seg,data),e=>e.name==='SaveUnconfirmedError'&&/尚未確認/.test(e.message));
 assert.equal(calls.length,1);assert.equal(shadow.length,0);
});
for(const patch of [{readback:undefined},{readback:{date,store,seg}},{sheetName:'ReportAwardModels'},{spreadsheetId:'different-source'}])test('insufficient receipt takes independent read '+JSON.stringify(patch),async()=>{
 const {c,calls,shadow}=setup({...receipt,...patch});assert.equal(await c.saveToStorage(date,store,seg,data),true);
 assert.deepEqual(calls.map(x=>x.payload.action),['write','read']);assert.equal(calls[1].options.isolated,true);assert.equal(shadow.length,1);
});
test('post-write read timeout preserves unknown status and never retries write or creates shadow',async()=>{
 const timeout=Object.assign(new Error('讀取超過 30 秒'),{name:'TimeoutError'});
 const {c,calls,shadow}=setup({...receipt,readback:undefined},timeout);
 await assert.rejects(c.saveToStorage(date,store,seg,data),e=>e.name==='SaveUnconfirmedError'&&/已收到寫入回應/.test(e.message)&&/勿直接重送/.test(e.message));
 assert.deepEqual(calls.map(x=>x.payload.action),['write','read']);assert.equal(shadow.length,0);assert.equal(Object.keys(c._cache).length,0);
});
test('lost write response is unknown, not failed persistence or permission to retry',async()=>{
 const {c,calls,shadow}=setup();c.privateDashboardPost=async p=>{calls.push({payload:p});throw new Error('HTTP 502');};
 await assert.rejects(c.saveToStorage(date,store,seg,data),e=>e.name==='SaveUnconfirmedError'&&/儲存結果尚未確認/.test(e.message)&&/HTTP 502/.test(e.message));
 assert.equal(calls.length,1);assert.equal(shadow.length,0);
});
test('auth change during a successful write cannot confirm or cache the previous session',async()=>{
 const {c,shadow}=setup();c.privateDashboardPost=async()=>{c.dailyReportReadContext++;return receipt;};
 await assert.rejects(c.saveToStorage(date,store,seg,data),e=>e.name==='AbortError');assert.equal(shadow.length,0);
});

test('cache and shadow keep optional values retained by the authoritative server row',async()=>{
 const {c,shadow}=setup({...receipt,readback:{...row,acc:23}});
 assert.equal(await c.saveToStorage(date,store,seg,{...data,acc:null}),true);
 assert.equal(c._cache.day[store].acc,23);assert.equal(shadow[0][3].acc,23);
});
test('endpoint change during a write cannot cache or confirm an old source',async()=>{
 const {c,shadow}=setup();c.privateDashboardPost=async()=>{c.GAS_URL='different-endpoint';return receipt;};
 await assert.rejects(c.saveToStorage(date,store,seg,data),e=>e.name==='AbortError');assert.equal(shadow.length,0);
});
