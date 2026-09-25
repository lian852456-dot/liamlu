const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync(require.resolve('../gas/Code.gs'), 'utf8');
const start = code.indexOf('const PHONE_STOCK_FILE =');
const end = code.indexOf('function privateDashboardAdminRequests(', start);
assert.ok(start >= 0 && end > start);

function service() {
  const stored = new Map();
  const props = {getProperty:key=>stored.get(key),setProperty:(key,value)=>stored.set(key,value)};
  const files = new Map(); let fileId = 0;
  const folder = {createFile:(_name,content) => {const id = String(++fileId); const file = {getId:()=>id,getBlob:()=>({getDataAsString:()=>content}),setTrashed:()=>{}};files.set(id,file);return file;}};
  const context = {privateDashboardCleanEmployeeId:value=>value,privateDashboardCleanDeviceId:value=>value,
    privateDashboardUserByEmployeeId:()=>({user:{status:'active',device_id:'approved-device'}}),
    privateDashboardIsTrustedEmployee:value=>value==='LIAM',privateDashboardProperties:()=>props,privateDashboardFolder:()=>folder,
    DriveApp:{getFileById:id=>files.get(id)},LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},MimeType:{PLAIN_TEXT:'text/plain'},console};
  vm.createContext(context);vm.runInContext(code.slice(start,end),context);
  return context;
}

test('APP 讀取及網站發布都要求已核准的督導裝置', () => {
  const backend = service();
  assert.throws(()=>backend.phoneStockRead({employeeId:'LIAM',deviceId:'wrong-device'}),/尚未核准/);
  assert.throws(()=>backend.phoneStockPublish({employeeId:'OTHER',deviceId:'approved-device',date:'2026-09-25',rows:[{store:'台北三創',model:'i18',quantity:1}]}),/尚未核准/);
});

test('同步後僅回傳庫存快照，且拒絕負數及未辨識店點', () => {
  const backend = service();const credentials = {employeeId:'LIAM',deviceId:'approved-device'};
  assert.throws(()=>backend.phoneStockPublish({...credentials,date:'2026-09-25',rows:[{store:'台北三創',model:'i18',quantity:-1}]}),/不正確/);
  backend.phoneStockPublish({...credentials,date:'2026-09-25',rows:[{store:'台北三創',model:'APPLE iPhone 18 Pro_512G-(銀)(5G)',quantity:3}]});
  const snapshot = backend.phoneStockRead(credentials).snapshot;
  assert.equal(snapshot.rows[0].quantity,3);
  assert.equal(snapshot.rows[0].sales,undefined);
  assert.equal(snapshot.date,'2026-09-25');
});
