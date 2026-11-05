import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CONTRACT,normalizePolicy,renderPolicyHTML,policyFilename} from '../management-policy-core.mjs';
const draft=()=>({contract:CONTRACT,title:'合成測試辦法',month:'2026-10',version:'測試版本',start:'2026-10-01',end:'2026-10-31',audience:'合成對象',source:'合成資料，非正式來源',reviewed:false,sections:[{title:'測試條件',body:'低於 40%：−20\n40%～未滿50%：−10'}]});
test('only document allowlist survives; session, roster, workbook and unrecognized keys never serialize',()=>{
 const p=normalizePolicy({...draft(),token:'CANARY_SESSION',passcode:'CANARY_SECRET',employeeId:'CANARY_EMPLOYEE',weeklyExcel:'CANARY_WORKBOOK',sections:[{title:'條文',body:'合成文字',employee:'CANARY_PERSON'}]});
 assert.deepEqual(Object.keys(p),['contract','title','month','version','start','end','audience','source','reviewed','sections']);
 assert.doesNotMatch(renderPolicyHTML(p),/CANARY/);assert.equal(p.sections[0].employee,undefined);
});
test('portable reader has no scripts, links, editable forms, external requests, credentials or Excel content',()=>{
 const html=renderPolicyHTML(draft());assert.match(html,/Content-Security-Policy/);assert.match(html,/default-src 'none'/);assert.match(html,/待核草稿/);assert.match(html,/2026-10-01/);
 assert.doesNotMatch(html,/<script|<form|<input|<textarea|<iframe|<img|\shref=|\ssrc=|contenteditable|sessionStorage|localStorage|script\.google\.com/i);
});
test('untrusted HTML is rendered as text in all document fields',()=>{
 const p=draft();p.title='<script>alert(1)</script>';p.sections=[{title:'<b>合成</b>',body:'<img src=x onerror=alert(1)> & "文字"'}];const html=renderPolicyHTML(p);
 assert.match(html,/&lt;script&gt;/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<script|<img/);
});
test('date and month mismatches, impossible dates, missing sources and oversized content fail closed',()=>{
 for(const patch of [{month:'2026-11'},{start:'2026-10-32'},{end:'2026-10-00'},{start:'2026-10-20',end:'2026-10-10'},{source:''},{sections:[]},{sections:[{title:'x',body:'x'.repeat(6001)}]},{contract:'unknown'}])assert.throws(()=>normalizePolicy({...draft(),...patch}));
});
test('accidental credentials, common identifiers and contact pastes are blocked',()=>{
 for(const value of ['PT_KEY=FAKE_TEST','token:FAKE_TEST','密碼：FAKE_TEST','員編：SYNTHETIC','姓名：合成測試','test@example.invalid','0912-345-678','A123456789']){
  const p=draft();p.sections[0].body=value;assert.throws(()=>renderPolicyHTML(p),/疑似/);
 }
});
test('review state cannot be truthy strings and filenames never use user supplied paths',()=>{
 const p=draft();p.reviewed='true';p.title='../../合成測試';assert.match(renderPolicyHTML(p),/待核草稿/);assert.equal(policyFilename(p),'北一二B_管理辦法_2026-10_待核草稿.html');p.reviewed=true;assert.match(renderPolicyHTML(p),/內容已核對/);assert.doesNotMatch(renderPolicyHTML(p),/class="draft"/);
});
