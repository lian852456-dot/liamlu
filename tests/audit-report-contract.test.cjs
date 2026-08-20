const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'audit-report.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'audit-report.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'audit-report.css'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'gas/AuditReport.gs'), 'utf8');
const code = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');
const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');

test('public entry and mobile form expose the exact isolated audit contract', () => {
  assert.match(home, /href="audit-report\.html"[\s\S]*?門市填報・稽核前確認[\s\S]*?稽核回報專區[\s\S]*?上傳環境清潔照片，查看補件狀態/);
  assert.match(html, /type="file" accept="image\/\*" multiple/);
  assert.match(js, /const MAX_PHOTOS=10/);
  assert.match(js, /const MAX_DIMENSION=2048/);
  assert.match(js, /const JPEG_QUALITY=\.9/);
  assert.match(js, /indexedDB\.open\(DB_NAME,1\)/);
  assert.match(css, /@media\(max-width:400px\)/);
  assert.doesNotMatch(html + js + css, /PT_KEY\s*=|CHANGE_ME|employee[_ -]?name|photo_file_id\s*:/i);
});

test('quality reminder uses a local PNG asset inside store view before the basic form', () => {
  const assetPath=path.join(root,'assets/audit/quality-management-reminder.png');
  const asset=fs.readFileSync(assetPath);
  assert.equal(asset.subarray(1,4).toString(),'PNG');
  assert.equal(asset.readUInt32BE(16),932);
  assert.equal(asset.readUInt32BE(20),526);
  assert.match(html, /id="storeView"[\s\S]*id="qualityReminderCard"[\s\S]*id="storeViewTitle"[\s\S]*id="basicTitle"/);
  assert.match(html, /src="assets\/audit\/quality-management-reminder\.png"/);
  assert.match(html, /alt="品質管理重點提醒：SGS行前清潔及稽核檢查事項"/);
  assert.doesNotMatch(html, /src="data:image[^\"]*quality-management-reminder/i);
  assert.match(css, /\.quality-reminder-button img\{[^}]*width:100%;height:auto;object-fit:contain/);
  assert.match(js, /photos\.length===1[\s\S]*previous\.hidden=single;next\.hidden=single/);
});

test('backend keeps batch, submission, photo and timeline sheets separate from patrol and half-month rows', () => {
  for (const name of ['稽核批次', '稽核回報提交', '稽核回報', '稽核回報紀錄']) assert.match(gas, new RegExp(name));
  for (const field of ['batch_id','submission_id','store_id','store_name','inspector_name','item_id','item_name','photo_file_id','private_url','note','status','reviewer_comment','submitted_at','reviewed_at','updated_at','revision']) assert.match(gas, new RegExp(`['"]${field}['"]`));
  assert.match(gas, /auditStores_\(\)[\s\S]*PT_STORES\.filter/);
  assert.match(gas, /04_稽核回報_照片/);
  const executable = gas.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(executable, /half_media_upload|writeHalfCheck|writePatrol|巡店明細|半月督導檢查/);
});

test('public own-submission routes are token-scoped and supervisor routes require existing PT session', () => {
  assert.match(gas, /function auditOwnSubmission_[\s\S]*edit_token[\s\S]*edit_token_hash/);
  assert.match(gas, /function auditOwnStatus_[\s\S]*auditOwnSubmission_/);
  for (const fn of ['auditOverview','auditDetail','auditReview']) {
    const body = gas.match(new RegExp(`function ${fn}\\(payload\\) \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(body, `${fn} missing`);
    assert.match(body[1], /auditSupervisorAuthorized_\(payload\)/, `${fn} bypasses PT_TOKEN`);
  }
  assert.match(gas, /function auditSupervisorAuthorized_[\s\S]*ptSessionAuthorized_/);
  assert.match(code, /action === 'audit_overview'[\s\S]*auditOverview\(payload\)/);
  assert.match(js, /sessionStorage\.getItem\(PT_TOKEN_KEY\)/);
  assert.match(js, /waitForReauth\(\)/);
});

class Range {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  getDisplayValues() { return Array.from({ length:this.rows }, (_, r) => Array.from({ length:this.cols }, (_, c) => String(this.sheet.data[this.row - 1 + r]?.[this.col - 1 + c] ?? ''))); }
  setValues(values) { values.forEach((line, r) => line.forEach((value, c) => { const rr=this.row-1+r; this.sheet.data[rr] ||= []; this.sheet.data[rr][this.col-1+c]=value; })); return this; }
  setValue(value) { return this.setValues([[value]]); }
}
class Sheet {
  constructor(name) { this.name=name; this.data=[]; }
  getLastColumn() { return this.data.reduce((max, row) => Math.max(max, row.length), 0); }
  getLastRow() { let last=0; this.data.forEach((row, i) => { if (row.some(value => String(value ?? '') !== '')) last=i+1; }); return last; }
  getRange(row, col, rows=1, cols=1) { return new Range(this,row,col,rows,cols); }
  appendRow(row) { this.data.push(row.slice()); }
  setFrozenRows() {}
}
class Spreadsheet {
  constructor() { this.sheets=new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet=new Sheet(name); this.sheets.set(name,sheet); return sheet; }
}

function harness() {
  const spreadsheet = new Spreadsheet();
  const context = {
    console,
    SPREADSHEET_ID:'sheet',
    PT_STORES:[
      ['DNB10059','台北通化'],['DNB10062','台北酒泉'],['DNB10307','台北三創'],['DNB10xxx_wanda','台北萬大'],['DNB10440','台北六張犁'],['DNB10094','台北復興南'],['DNB10082','台北永吉'],['DNB10284','台北大稻埕'],['DNB10146','台北杭州南']
    ].map(([code,name])=>({code,name})),
    SpreadsheetApp:{openById:()=>spreadsheet,flush(){}},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    Utilities:{
      formatDate:()=> '2026-08-20T14:30:00+08:00',
      getUuid:(()=>{let i=0;return()=>`uuid-${++i}`;})(),
      computeDigest:(_algorithm,value)=>Array.from(crypto.createHash('sha256').update(String(value)).digest()).map(v=>v>127?v-256:v),
      DigestAlgorithm:{SHA_256:'sha256'}
    },
    privateDashboardHash(value){return crypto.createHash('sha256').update(String(value)).digest('hex');},
    ptSessionAuthorized_(){return true;},
    PropertiesService:{getScriptProperties:()=>({getProperty:()=>'',setProperty(){}})},
    DriveApp:{},
    halfMediaSubfolder(){throw new Error('not used');},
    halfMediaSafeName(value){return String(value);}
  };
  vm.createContext(context);vm.runInContext(gas,context);
  vm.runInContext(`
    auditEnsureSheet_(AUDIT_BATCH_SHEET,AUDIT_BATCH_FIELDS);
    auditEnsureSheet_(AUDIT_SUBMISSION_SHEET,AUDIT_SUBMISSION_FIELDS);
    auditEnsureSheet_(AUDIT_PHOTO_SHEET,AUDIT_PHOTO_FIELDS);
    auditEnsureSheet_(AUDIT_EVENT_SHEET,AUDIT_EVENT_FIELDS);
    auditAppend_(auditSpreadsheet_().getSheetByName(AUDIT_BATCH_SHEET),AUDIT_BATCH_FIELDS,{batch_id:AUDIT_INITIAL_BATCH.batch_id,batch_name:AUDIT_INITIAL_BATCH.batch_name,starts_on:AUDIT_INITIAL_BATCH.starts_on,due_on:AUDIT_INITIAL_BATCH.due_on,active:'TRUE',created_at:auditNow_(),updated_at:auditNow_()});
  `,context);
  return { context, spreadsheet };
}

test('same submission id and repeated submit stay idempotent without duplicate rows or events', () => {
  const { context, spreadsheet } = harness();
  const base={batch_id:'audit-cleaning-202608',submission_id:'submission_12345678901234567890',edit_token:'edit_12345678901234567890123456789012',store_id:'DNB10062',inspector_name:' 測試人員 '};
  context.auditStart(base);context.auditStart(base);
  assert.equal(spreadsheet.getSheetByName('稽核回報提交').getLastRow()-1,1);
  assert.equal(spreadsheet.getSheetByName('稽核回報紀錄').getLastRow()-1,1);
  vm.runInContext(`
    (function(){
      const submission=auditRows_(auditSpreadsheet_().getSheetByName(AUDIT_SUBMISSION_SHEET),AUDIT_SUBMISSION_FIELDS)[0];
      AUDIT_ITEMS.forEach(function(item,index){auditAppend_(auditSpreadsheet_().getSheetByName(AUDIT_PHOTO_SHEET),AUDIT_PHOTO_FIELDS,{batch_id:submission.batch_id,batch_name:submission.batch_name,submission_id:submission.submission_id,store_id:submission.store_id,store_name:submission.store_name,inspector_name:submission.inspector_name,item_id:item.item_id,item_name:item.item_name,photo_file_id:'file-'+index,private_url:'private-'+index,photo_name:'photo-'+index,client_photo_id:'client_photo_1234567890'+index,note:'',status:'draft',reviewer_comment:'',submitted_at:'',reviewed_at:'',updated_at:auditNow_(),revision:1,created_at:auditNow_()});});
    })();
  `,context);
  const payload={submission_id:base.submission_id,edit_token:base.edit_token,notes:{island_display:'A',op_zone:'B',counter_seating:'C'}};
  const first=context.auditSubmit(payload);const second=context.auditSubmit(payload);
  assert.equal(first.readback_verified,true);assert.equal(second.submission_status,'submitted');
  assert.equal(spreadsheet.getSheetByName('稽核回報').getLastRow()-1,3);
  const events=spreadsheet.getSheetByName('稽核回報紀錄').data.slice(1);
  assert.equal(events.filter(row=>row.includes('submitted')).length,3);
});

test('returning one item unlocks only that item and preserves original rows plus reason timeline', () => {
  const { context, spreadsheet }=harness();
  const base={batch_id:'audit-cleaning-202608',submission_id:'submission_12345678901234567890',edit_token:'edit_12345678901234567890123456789012',store_id:'DNB10062',inspector_name:'測試人員'};
  context.auditStart(base);
  vm.runInContext(`(function(){const s=auditRows_(auditSpreadsheet_().getSheetByName(AUDIT_SUBMISSION_SHEET),AUDIT_SUBMISSION_FIELDS)[0];AUDIT_ITEMS.forEach(function(item,index){auditAppend_(auditSpreadsheet_().getSheetByName(AUDIT_PHOTO_SHEET),AUDIT_PHOTO_FIELDS,{batch_id:s.batch_id,batch_name:s.batch_name,submission_id:s.submission_id,store_id:s.store_id,store_name:s.store_name,inspector_name:s.inspector_name,item_id:item.item_id,item_name:item.item_name,photo_file_id:'file-'+index,private_url:'private-'+index,photo_name:'photo-'+index,client_photo_id:'client_photo_1234567890'+index,note:'',status:'draft',reviewer_comment:'',submitted_at:'',reviewed_at:'',updated_at:auditNow_(),revision:1,created_at:auditNow_()});});})();`,context);
  context.auditSubmit({submission_id:base.submission_id,edit_token:base.edit_token,notes:{}});
  context.auditReview({token:'valid',submission_id:base.submission_id,item_id:'op_zone',decision:'return',comment:'請補拍死角'});
  const own=context.auditOwnStatus({submission_id:base.submission_id,edit_token:base.edit_token});
  assert.equal(own.submission_status,'rework');
  assert.deepEqual(Array.from(own.items.filter(item=>item.status==='rework').map(item=>item.item_id)),['op_zone']);
  assert.equal(own.items.find(item=>item.item_id==='op_zone').reviewer_comment,'請補拍死角');
  assert.equal(spreadsheet.getSheetByName('稽核回報').getLastRow()-1,3,'original photo rows remain');
});
