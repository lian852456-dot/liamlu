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
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4JcAAAAASUVORK5CYII=','base64');

test('public entry and mobile form expose the exact isolated audit contract', () => {
  assert.match(home, /href="audit-report\.html"[\s\S]*?門市填報・稽核前確認[\s\S]*?稽核回報專區[\s\S]*?上傳環境清潔照片，查看補件狀態/);
  assert.match(html, /type="file" accept="image\/\*" multiple/);
  assert.match(js, /const MAX_PHOTOS=10/);
  assert.match(js, /const MAX_DIMENSION=2048/);
  assert.match(js, /const JPEG_QUALITY=\.9/);
  assert.match(js, /indexedDB\.open\(DB_NAME,1\)/);
  assert.match(css, /@media\(max-width:400px\)/);
  assert.doesNotMatch(html + js + css, /PT_KEY\s*=|CHANGE_ME|employee[_ -]?name|photo_file_id\s*:/i);
  assert.match(html, /id="storeEmployeeId"[^>]*autocomplete="username"/);
  assert.match(html, /id="storeSelect"[^>]*disabled/);
  assert.match(html, /id="inspectorName"[^>]*placeholder="請輸入實際檢查人員姓名"[^>]*required/);
  assert.doesNotMatch(html, /id="inspectorName"[^>]*readonly/);
  assert.match(js, /localStorage\.setItem\(EMPLOYEE_ID_KEY,employeeId\)/);
  assert.match(js, /sessionStorage\.setItem\(STORE_SESSION_KEY/);
  assert.doesNotMatch(js, /localStorage\.setItem\(STORE_SESSION_KEY/);
  assert.doesNotMatch(js, /state\.draft\.inspector_name\s*=\s*profile\.masked_name/);
  assert.doesNotMatch(html + js, /storeSubmitCode|批次回報碼|驗證回報碼/);
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

test('setup keeps the formal audit batch inactive until a separate UAT gate enables it', () => {
  assert.match(gas, /AUDIT_INITIAL_BATCH\s*=\s*\{[\s\S]*?active:\s*false/);
  assert.match(gas, /active:\s*AUDIT_INITIAL_BATCH\.active\s*\?\s*'TRUE'\s*:\s*'FALSE'/);
});

test('store routes require a short audit token and supervisor routes require existing PT session', () => {
  assert.doesNotMatch(gas, /AUDIT_REPORT_SUBMIT_CODE/);
  assert.match(gas, /AUDIT_STORE_SESSION_TTL_SECONDS\s*=\s*1800/);
  assert.match(gas, /scope:\s*'audit-submit'/);
  assert.match(gas, /auth_source:\s*'approved-device'/);
  assert.match(gas, /function auditApprovedDeviceProfile_[\s\S]*privateDashboardUserByEmployeeId/);
  assert.doesNotMatch(gas, /privateDashboardAccess\(|privateDashboardSnapshot\(/);
  assert.match(gas, /function auditOwnSubmission_[\s\S]*edit_token[\s\S]*edit_token_hash/);
  for (const fn of ['auditStart','auditUploadPhotoUnlocked_','auditDeletePhoto','auditSubmit','auditOwnStatus']) {
    const body = gas.match(new RegExp(`function ${fn}\\(payload\\) \\{([\\s\\S]*?)\\n\\}`));
    assert.ok(body, `${fn} missing`);
    assert.match(body[1], /auditStoreSession_\(/, `${fn} bypasses store token`);
  }
  for (const fn of ['auditOverview','auditDetail','auditReview','auditCancel']) {
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
  const cache = new Map();
  const properties = new Map([['AUDIT_REPORT_FOLDER_ID','audit-root']]);
  const users = new Map([
    ['EMP001',{_row:2,employee_id:'EMP001',masked_name:'測＊員',store:'酒泉',role:'業代',status:'active',device_id:'approved-device-0001'}],
    ['EMP002',{_row:3,employee_id:'EMP002',masked_name:'永＊員',store:'台北永吉',role:'店長',status:'active',device_id:'approved-device-0002'}],
    ['EMP003',{_row:4,employee_id:'EMP003',masked_name:'另＊員',store:'台灣大哥大數位生活台北酒泉',role:'業代',status:'active',device_id:'approved-device-0003'}],
    ['EMP004',{_row:5,employee_id:'EMP004',masked_name:'停＊員',store:'酒泉',role:'業代',status:'inactive',device_id:'approved-device-0004'}]
  ]);
  const files = new Map();
  class MockFile {
    constructor(id,blob){this.id=id;this.blob=blob;this.trashed=false;}
    getId(){return this.id;} getName(){return this.blob.getName();} getBlob(){return this.blob;} setTrashed(value){this.trashed=value;}
  }
  class MockFolder {
    constructor(id){this.id=id;this.children=new Map();}
    getId(){return this.id;}
    getFoldersByName(name){const folder=this.children.get(name);return {hasNext:()=>Boolean(folder),next:()=>folder};}
    createFolder(name){const folder=new MockFolder(`${this.id}/${name}`);this.children.set(name,folder);return folder;}
    createFile(blob){const file=new MockFile(`drive-file-${files.size+1}`,blob);files.set(file.id,file);return file;}
  }
  const rootFolder=new MockFolder('audit-root');
  let uuidCounter=0;
  const context = {
    console,
    SPREADSHEET_ID:'sheet',
    PT_STORES:[
      ['DNB10059','台北通化'],['DNB10062','台北酒泉'],['DNB10307','台北三創'],['DNB10xxx_wanda','台北萬大'],['DNB10440','台北六張犁'],['DNB10094','台北復興南'],['DNB10082','台北永吉'],['DNB10284','台北大稻埕'],['DNB10146','台北杭州南']
    ].map(([code,name])=>({code,name})),
    SpreadsheetApp:{openById:()=>spreadsheet,flush(){}},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value),remove:key=>cache.delete(key)})},
    Utilities:{
      formatDate:()=> '2026-08-20T14:30:00+08:00',
      getUuid:()=>`00000000-0000-4000-8000-${String(++uuidCounter).padStart(12,'0')}`,
      computeDigest:(_algorithm,value)=>Array.from(crypto.createHash('sha256').update(String(value)).digest()).map(v=>v>127?v-256:v),
      DigestAlgorithm:{SHA_256:'sha256'},
      base64Decode:value=>Array.from(Buffer.from(String(value),'base64')),
      base64Encode:value=>Buffer.from(value).toString('base64'),
      newBlob:(bytes,mimeType,name)=>({getBytes:()=>Array.from(bytes),getContentType:()=>mimeType,getName:()=>name})
    },
    privateDashboardHash(value){return crypto.createHash('sha256').update(String(value)).digest('hex');},
    privateDashboardCleanEmployeeId(value){const id=String(value||'').trim().toUpperCase();if(!/^[A-Z0-9]{5,12}$/.test(id))throw new Error('員編格式不正確');return id;},
    privateDashboardCleanDeviceId(value){const id=String(value||'').trim();if(!/^[A-Za-z0-9_-]{16,128}$/.test(id))throw new Error('裝置識別不正確');return id;},
    privateDashboardUserByEmployeeId(employeeId){return {sheet:{},user:users.get(employeeId)||null};},
    ptSessionAuthorized_(token){return token==='pt-valid-token-1234567890';},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)||'',setProperty:(key,value)=>properties.set(key,value)})},
    DriveApp:{getFolderById:id=>{if(id!=='audit-root')throw new Error('unknown folder');return rootFolder;},getFileById:id=>{const file=files.get(id);if(!file)throw new Error('unknown file');return file;}},
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
  return { context, spreadsheet, cache, files };
}

function authorize(context,base,employeeId='EMP001',deviceId='approved-device-0001') {
  return context.auditSubmitAuth({batch_id:base.batch_id,submission_id:base.submission_id,employeeId,deviceId}).token;
}

function withStoreToken(base,storeToken) { return {...base,store_token:storeToken}; }

function seedThreePhotos(context) {
  vm.runInContext(`(function(){const s=auditRows_(auditSpreadsheet_().getSheetByName(AUDIT_SUBMISSION_SHEET),AUDIT_SUBMISSION_FIELDS)[0];AUDIT_ITEMS.forEach(function(item,index){auditAppend_(auditSpreadsheet_().getSheetByName(AUDIT_PHOTO_SHEET),AUDIT_PHOTO_FIELDS,{batch_id:s.batch_id,batch_name:s.batch_name,submission_id:s.submission_id,store_id:s.store_id,store_name:s.store_name,inspector_name:s.inspector_name,item_id:item.item_id,item_name:item.item_name,photo_file_id:'seed-file-'+index,private_url:'',photo_name:'photo-'+index,client_photo_id:'client_photo_1234567890'+index,note:'',status:'draft',reviewer_comment:'',submitted_at:'',reviewed_at:'',updated_at:auditNow_(),revision:1,created_at:auditNow_()});});})();`,context);
}

test('audit config exposes the nine canonical store ids without patrol legacy placeholders', () => {
  const { context } = harness();
  const stores = Array.from(context.auditPublicConfig().stores, store => [store.store_id, store.store_name]);
  assert.deepEqual(stores, [
    ['DNB10062','台北酒泉'],['DNB10082','台北永吉'],['DNB10094','台北復興南'],
    ['DNB10146','台北杭州南'],['DNB10168','台北萬大'],['DNB10174','台北通化'],
    ['DNB10284','台北大稻埕'],['DNB10307','台北三創'],['DNB10440','台北六張犁']
  ]);
  assert.doesNotMatch(JSON.stringify(stores), /xxx|DNB10059/);
});

test('Approved Device exchange returns only a roster-bound audit token and ignores forged profile fields', () => {
  const {context,cache}=harness();
  const base={batch_id:'audit-cleaning-202608',submission_id:'submission_profile_1234567890123',edit_token:'edit_profile_123456789012345678901'};
  const auth=context.auditSubmitAuth({
    batch_id:base.batch_id,submission_id:base.submission_id,
    employeeId:'emp001',deviceId:'approved-device-0001',
    store_id:'DNB10082',inspector_name:'偽造姓名',code:'0935'
  });
  assert.deepEqual(Object.keys(auth).sort(),['expiresIn','profile','token']);
  assert.deepEqual({...auth.profile},{store_id:'DNB10062',store_name:'台北酒泉',masked_name:'測＊員'});
  assert.equal(auth.expiresIn,1800);
  assert.doesNotMatch(JSON.stringify(auth),/snapshot|kpi|awards|employee_id|device_id|role/i);
  assert.doesNotMatch([...cache.values()].join('\n'),/測＊員|masked_name|inspector_name/);
  const started=context.auditStart({...base,inspector_name:'王小明',store_token:auth.token});
  assert.equal(started.store_id,'DNB10062');
  assert.equal(started.inspector_name,'王小明');
});

test('audit token remains bound to the Approved Device employee even within the same store', () => {
  const {context}=harness();
  const base={batch_id:'audit-cleaning-202608',submission_id:'submission_employee_12345678901',edit_token:'edit_employee_1234567890123456789',inspector_name:'王小明'};
  const first=authorize(context,base);
  context.auditStart(withStoreToken(base,first));
  const other=authorize(context,base,'EMP003','approved-device-0003');
  assert.throws(()=>context.auditOwnStatus({...base,store_token:other}),/unauthorized/);
});

test('masked roster name never becomes formal inspector and actual name is cleaned into submission, photos and timeline', () => {
  const {context,spreadsheet}=harness();
  const base={batch_id:'audit-cleaning-202608',submission_id:'submission_actual_name_123456789',edit_token:'edit_actual_name_123456789012345678'};
  const storeToken=authorize(context,base);
  assert.throws(()=>context.auditStart(withStoreToken(base,storeToken)),/請填寫檢查人員姓名/);
  assert.throws(()=>context.auditStart(withStoreToken({...base,inspector_name:'測＊員'},storeToken)),/不可使用遮罩姓名/);
  const actual={...base,inspector_name:'  王小明  '};
  const started=context.auditStart(withStoreToken(actual,storeToken));
  assert.equal(started.inspector_name,'王小明');
  context.auditUploadPhoto({...withStoreToken(actual,storeToken),item_id:'island_display',client_photo_id:'client_actual_name_123456',note:'',file:{name:'actual.png',type:'image/png',base64:PNG.toString('base64')}});
  const rows=(sheet)=>{const [headers,...values]=sheet.data;return values.map(row=>Object.fromEntries(headers.map((header,index)=>[header,row[index]??''])));};
  const submission=rows(spreadsheet.getSheetByName('稽核回報提交'))[0];
  const photo=rows(spreadsheet.getSheetByName('稽核回報'))[0];
  const event=rows(spreadsheet.getSheetByName('稽核回報紀錄'))[0];
  assert.equal(submission.inspector_name,'王小明');
  assert.equal(photo.inspector_name,'王小明');
  assert.equal(event.inspector_name,'王小明');
  assert.doesNotMatch(JSON.stringify({submission,photo,event}),/測＊員/);
});

test('same submission id and repeated submit stay idempotent without duplicate rows or events', () => {
  const { context, spreadsheet } = harness();
  const base={batch_id:'audit-cleaning-202608',submission_id:'submission_12345678901234567890',edit_token:'edit_12345678901234567890123456789012',store_id:'DNB10062',inspector_name:'王小明'};
  const storeToken=authorize(context,base);context.auditStart(withStoreToken(base,storeToken));context.auditStart(withStoreToken(base,storeToken));
  assert.equal(spreadsheet.getSheetByName('稽核回報提交').getLastRow()-1,1);
  assert.equal(spreadsheet.getSheetByName('稽核回報紀錄').getLastRow()-1,1);
  seedThreePhotos(context);
  const payload={submission_id:base.submission_id,edit_token:base.edit_token,store_token:storeToken,notes:{island_display:'A',op_zone:'B',counter_seating:'C'}};
  const first=context.auditSubmit(payload);const second=context.auditSubmit(payload);
  assert.equal(first.readback_verified,true);assert.equal(second.submission_status,'submitted');
  assert.equal(spreadsheet.getSheetByName('稽核回報').getLastRow()-1,3);
  const events=spreadsheet.getSheetByName('稽核回報紀錄').data.slice(1);
  assert.equal(events.filter(row=>row.includes('submitted')).length,3);
});

test('returning one item unlocks only that item and preserves original rows plus reason timeline', () => {
  const { context, spreadsheet }=harness();
  const base={batch_id:'audit-cleaning-202608',submission_id:'submission_12345678901234567890',edit_token:'edit_12345678901234567890123456789012',store_id:'DNB10062',inspector_name:'王小明'};
  const storeToken=authorize(context,base);context.auditStart(withStoreToken(base,storeToken));seedThreePhotos(context);
  context.auditSubmit({submission_id:base.submission_id,edit_token:base.edit_token,store_token:storeToken,notes:{}});
  context.auditReview({token:'pt-valid-token-1234567890',submission_id:base.submission_id,item_id:'op_zone',decision:'return',comment:'請補拍死角'});
  const own=context.auditOwnStatus({submission_id:base.submission_id,edit_token:base.edit_token,store_token:storeToken});
  assert.equal(own.submission_status,'rework');
  assert.deepEqual(Array.from(own.items.filter(item=>item.status==='rework').map(item=>item.item_id)),['op_zone']);
  assert.equal(own.items.find(item=>item.item_id==='op_zone').reviewer_comment,'請補拍死角');
  assert.equal(spreadsheet.getSheetByName('稽核回報').getLastRow()-1,3,'original photo rows remain');
});

test('anonymous, unapproved device, inactive employee and expired audit token cannot mutate or read a submission', () => {
  const {context,cache}=harness();
  const base={batch_id:'audit-cleaning-202608',submission_id:'submission_anon_1234567890123456',edit_token:'edit_anon_123456789012345678901234',store_id:'DNB10062',inspector_name:'王小明'};
  assert.doesNotMatch(JSON.stringify(context.auditPublicConfig()),/submit_code|store_token|edit_token|folder_id|drive_id/i);
  assert.throws(()=>context.auditSubmitAuth({...base,employeeId:'EMP001',deviceId:'unapproved-device-01'}),/尚未核准/);
  assert.throws(()=>context.auditSubmitAuth({...base,employeeId:'EMP004',deviceId:'approved-device-0004'}),/尚未核准/);
  assert.throws(()=>context.auditStart(base),/unauthorized/);
  const storeToken=authorize(context,base);context.auditStart(withStoreToken(base,storeToken));
  for(const action of [
    ()=>context.auditUploadPhoto({...base,item_id:'island_display',client_photo_id:'client_anon_1234567890',file:{name:'a.png',type:'image/png',base64:PNG.toString('base64')}}),
    ()=>context.auditDeletePhoto({...base,client_photo_id:'client_anon_1234567890'}),
    ()=>context.auditSubmit({...base,notes:{}}),
    ()=>context.auditOwnStatus(base),
    ()=>context.auditPhotoRead({...base,client_photo_id:'client_anon_1234567890'})
  ]) assert.throws(action,/unauthorized/);
  cache.clear();
  assert.throws(()=>context.auditOwnStatus(withStoreToken(base,storeToken)),/unauthorized/);
});

test('store token and edit token cannot cross stores, submissions or private photos', () => {
  const {context}=harness();
  const a={batch_id:'audit-cleaning-202608',submission_id:'submission_store_a_12345678901234',edit_token:'edit_store_a_1234567890123456789012',store_id:'DNB10062',inspector_name:'王小明'};
  const b={batch_id:'audit-cleaning-202608',submission_id:'submission_store_b_12345678901234',edit_token:'edit_store_b_1234567890123456789012',store_id:'DNB10082',inspector_name:'李小華'};
  const tokenA=authorize(context,a);const tokenB=authorize(context,b,'EMP002','approved-device-0002');context.auditStart(withStoreToken(a,tokenA));context.auditStart(withStoreToken(b,tokenB));
  const uploaded=context.auditUploadPhoto({...withStoreToken(a,tokenA),item_id:'island_display',client_photo_id:'client_store_a_123456789',note:'',file:{name:'a.png',type:'image/png',base64:PNG.toString('base64')}});
  assert.deepEqual(Object.keys(uploaded.photo).sort(),['client_photo_id','photo_name','revision','status']);
  assert.throws(()=>context.auditOwnStatus({...b,submission_id:a.submission_id,edit_token:a.edit_token,store_token:tokenB}),/unauthorized/);
  assert.throws(()=>context.auditPhotoRead({...b,submission_id:a.submission_id,edit_token:a.edit_token,store_token:tokenB,client_photo_id:'client_store_a_123456789'}),/unauthorized/);
  assert.throws(()=>context.auditPhotoRead({...a,store_token:tokenA,edit_token:b.edit_token,client_photo_id:'client_store_a_123456789'}),/找不到本次回報|失效/);
});

test('supervisor reads a private Drive blob only through protected photo action', () => {
  const {context}=harness();
  const base={batch_id:'audit-cleaning-202608',submission_id:'submission_photo_123456789012345',edit_token:'edit_photo_12345678901234567890123',store_id:'DNB10062',inspector_name:'王小明'};
  const storeToken=authorize(context,base);context.auditStart(withStoreToken(base,storeToken));
  context.auditUploadPhoto({...withStoreToken(base,storeToken),item_id:'island_display',client_photo_id:'client_photo_secure_123456',note:'',file:{name:'private.png',type:'image/png',base64:PNG.toString('base64')}});
  assert.throws(()=>context.auditPhotoRead({submission_id:base.submission_id,client_photo_id:'client_photo_secure_123456'}),/unauthorized/);
  const read=context.auditPhotoRead({token:'pt-valid-token-1234567890',submission_id:base.submission_id,client_photo_id:'client_photo_secure_123456'});
  assert.equal(read.mime_type,'image/png');assert.equal(read.base64,PNG.toString('base64'));
  const detail=context.auditDetail({token:'pt-valid-token-1234567890',submission_id:base.submission_id});
  assert.doesNotMatch(JSON.stringify(detail),/drive\.google\.com|photo_file_id|private_url/);
});

test('supervisor cancellation preserves evidence and allows a fresh submission for the store', () => {
  const {context,spreadsheet}=harness();
  const oldBase={batch_id:'audit-cleaning-202608',submission_id:'submission_cancel_12345678901234',edit_token:'edit_cancel_1234567890123456789012',store_id:'DNB10062',inspector_name:'王小明'};
  const oldToken=authorize(context,oldBase);context.auditStart(withStoreToken(oldBase,oldToken));
  context.auditUploadPhoto({...withStoreToken(oldBase,oldToken),item_id:'island_display',client_photo_id:'client_cancel_1234567890',note:'',file:{name:'kept.png',type:'image/png',base64:PNG.toString('base64')}});
  const cancelled=context.auditCancel({token:'pt-valid-token-1234567890',submission_id:oldBase.submission_id,comment:'裝置草稿遺失'});
  assert.equal(cancelled.submission_status,'cancelled');assert.equal(cancelled.timeline.at(-1).event_type,'cancelled');assert.equal(spreadsheet.getSheetByName('稽核回報').getLastRow()-1,1);
  const overview=context.auditOverview({token:'pt-valid-token-1234567890'});assert.equal(overview.stores.find(store=>store.store_id==='DNB10062').status,'missing');
  const fresh={...oldBase,submission_id:'submission_fresh_123456789012345',edit_token:'edit_fresh_12345678901234567890123'};const freshToken=authorize(context,fresh);const started=context.auditStart(withStoreToken(fresh,freshToken));assert.equal(started.submission_status,'draft');
  assert.equal(spreadsheet.getSheetByName('稽核回報提交').getLastRow()-1,2);
});

test('frontend and client API contract never expose direct Drive view URLs or file IDs', () => {
  assert.doesNotMatch(html+js,/drive\.google\.com\/file\/d\/|photo_file_id|private_url/);
  assert.doesNotMatch(gas.match(/function auditPhotoForClient_\(row\) \{[\s\S]*?\n\}/)[0],/photo_file_id|private_url/);
  assert.match(js,/URL\.createObjectURL\(new Blob/);assert.match(js,/URL\.revokeObjectURL/);assert.match(code,/action === 'audit_photo_read'/);
});
