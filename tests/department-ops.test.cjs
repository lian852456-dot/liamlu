const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../department-ops-core.js');

test('北一二部 Final 直接讀取 A-D 人員金牌與 SPE，不重算', () => {
  const rows = [
    ['資料日期 : 2026/01/01~01/09', ...Array(15).fill(null)],
    ['Y26/1_北一二 (全員)'],
    ['部', '區域', '區域', '督導區', '營業店點代碼', '服務中心', '店內職稱', '員編', '員工姓名', '職級', '正/派', '9M(含)以上', '凱擘供裝/非供裝', '店型', 'SPE加分總計', '金牌'],
    ['北一區', '北一二', '北一二區', '北一二B', 'TEST001', '台北測試一', '店長', 'EMP001', '測*甲', '20', '正職', 'Y', '供裝區', 'A級', -1.7, -173],
    ['', '', '北一二區', '北一二C', 'TEST002', '台北測試二', '業務代表', 'EMP002', '測*乙', '10', '正職', 'Y', '供裝區', 'B級', 0.1, 88],
    ['', '', '其他區', '北二一A', 'X', '不納入', '業務代表', 'X', 'X', '', '', '', '', '', 0, 99]
  ];
  const month = Core.parseGoldRows(rows, '1月');
  assert.equal(month.dateRange.cutoff, '2026-01-09');
  assert.equal(month.records.length, 2);
  assert.deepEqual(month.records[0], {
    region: '北一二B', storeCode: 'TEST001', store: '測試一', role: '店長', employeeId: 'EMP001', employeeName: '測*甲', level: '20', employment: '正職', eligible9m: 'Y', storeType: 'A級', spe: -1.7, medal: -173
  });
});

test('季度累計依員編整併並標記 80/100/120/180 門檻', () => {
  const months = [
    { monthKey: '2026-07', records: [{ employeeId:'1', employeeName:'A', region:'北一二B', store:'三創', role:'店長', medal:50, spe:0 }] },
    { monthKey: '2026-08', records: [{ employeeId:'1', employeeName:'A', region:'北一二B', store:'三創', role:'店長', medal:75, spe:.1 }] },
    { monthKey: '2026-09', records: [{ employeeId:'1', employeeName:'A', region:'北一二B', store:'三創', role:'店長', medal:10, spe:0 }] }
  ];
  const [person] = Core.aggregatePeople(months, {});
  assert.equal(person.total, 135);
  assert.deepEqual(person.reached, [80, 100, 120]);
  assert.equal(person.nextThreshold, 180);
});

test('依資料月份列出每一季，包含 Q2 與 Q3，並以最新季度優先', () => {
  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
    .map((monthKey) => ({ monthKey }));
  assert.deepEqual(Core.quarterKeys(months), ['2026-Q3', '2026-Q2']);
  assert.equal(Core.quarterKeyForMonth('2026-06'), '2026-Q2');
  assert.equal(Core.quarterKeyForMonth('2026-07'), '2026-Q3');
});

test('同日修正版覆蓋目前顯示但保留版本，跨日產生北一二B個人增減', () => {
  const row = (medal) => [{ employeeId:'1', employeeName:'A', region:'北一二B', store:'三創', role:'店長', medal, spe:0 }];
  let history = Core.upsertSnapshot([], { cutoff:'2026-01-09', sourceName:'0109.xlsx', rows:row(10) });
  history = Core.upsertSnapshot(history, { cutoff:'2026-01-10', sourceName:'0110.xlsx', rows:row(12) });
  history = Core.upsertSnapshot(history, { cutoff:'2026-01-10', sourceName:'0110修正版.xlsx', rows:row(15) });
  assert.equal(history.length, 2);
  assert.equal(history[1].revisions.length, 1);
  assert.deepEqual(Core.dailyChanges(history).map(({ cutoff, delta, previousMedal, medal }) => ({ cutoff, delta, previousMedal, medal })), [
    { cutoff:'2026-01-10', delta:5, previousMedal:10, medal:15 }
  ]);
});

test('入口、權限與密碼保護 Excel 元件均存在，公開頁不內嵌正式資料', () => {
  const root = path.resolve(__dirname, '..');
  const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'department-ops.html'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'department-ops.js'), 'utf8');
  const viewer = fs.readFileSync(path.join(root, 'gold-medal.html'), 'utf8');
  const viewerController = fs.readFileSync(path.join(root, 'gold-medal.js'), 'utf8');
  const gas = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');
  const patrolBundle = fs.readFileSync(path.join(root, 'patrol-gas/PatrolCode.gs'), 'utf8');
  assert.match(home, /href="department-ops\.html"[\s\S]*北一二部｜部區管理/);
  assert.match(home, /href="gold-medal\.html"[\s\S]*北一二B 金牌明細/);
  assert.match(page, /officecrypto\.bundle\.min\.js/);
  assert.match(page, /department-ops-core\.js\?v=20260930-2/);
  assert.match(page, /department-ops\.js\?v=20260930-5/);
  assert.match(page, /需要更新時才上傳新版 Final/);
  assert.match(page, /選檔僅供更新/);
  assert.match(page, /id="excelPassword"[^>]*placeholder="請輸入檔案密碼"/);
  assert.doesNotMatch(page, /id="excelPassword"[^>]*value=/);
  assert.match(controller, /action: 'ptauth'/);
  assert.match(controller, /AUTH_RETRY_STATUSES = new Set\(\[404, 429, 500, 502, 503, 504\]\)/);
  assert.match(controller, /\['ptauth', 'department_ops_read'\]\.includes\(payload\?\.action\)/);
  assert.match(controller, /const maxAttempts = canRetry \? 3 : 1/);
  assert.match(controller, /金牌同步等寫入動作絕不自動重送/);
  assert.match(controller, /GOLD_HISTORY_KEY/);
  assert.match(controller, /季度彙整/);
  assert.doesNotMatch(controller, /<option value="all">全部月份<\/option>/);
  assert.match(controller, /action: 'department_ops_publish'/);
  assert.match(controller, /action: 'department_ops_read'/);
  assert.match(controller, /await loadPublishedGold\(\)/);
  assert.match(viewerController, /action:'department_gold_access'/);
  assert.match(viewerController, /action:'private_request'/);
  assert.match(viewerController, /AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/);
  assert.match(viewer, /員編登入|以員編查看/);
  assert.match(gas, /action === 'department_ops_publish'/);
  assert.match(gas, /action === 'department_ops_read'/);
  assert.match(gas, /ptRequireSession_\(body\.token, 'department_ops_read'\)/);
  assert.match(gas, /action === 'department_gold_access'/);
  assert.match(gas, /ptRequireSession_\(body\.token, 'department_ops_publish'\)/);
  assert.match(gas, /row\.region === '北一二B'/);
  assert.match(gas, /personKey:privateDashboardHash\(row\.employeeId\)/);
  assert.match(gas, /previous\.rows/);
  assert.match(gas, /ledger:north12bGoldDailyLedger_\(\)/);
  assert.match(patrolBundle, /action === 'department_ops_publish'/);
  assert.match(patrolBundle, /action === 'department_ops_read'/);
  assert.doesNotMatch(patrolBundle, /department_gold_access|privateDashboard/);
  assert.doesNotMatch(`${page}\n${controller}`, /551\d{4}/);
});

test('督導驗證遇到 Apps Script 回傳 404 會重試，但同步寫入不會重送', async () => {
  const controller = fs.readFileSync(path.resolve(__dirname, '../department-ops.js'), 'utf8');
  const start = controller.indexOf('const AUTH_RETRY_STATUSES');
  const end = controller.indexOf('async function unlockWithPasscode');
  const runtimeSource = controller.slice(start, end);
  const buildRuntime = new Function('fetch', 'AbortController', 'setTimeout', 'clearTimeout', 'PATROL_URL', `${runtimeSource}\nreturn { authRequest };`);
  const immediateTimers = (callback, milliseconds) => {
    if (milliseconds !== 20000) queueMicrotask(callback);
    return 1;
  };

  const authStatuses = [404, 404, 200];
  let authCalls = 0;
  const authRuntime = buildRuntime(async () => {
    const status = authStatuses[authCalls++];
    return { ok:status === 200, status, json:async () => ({status:'ok', token:'test-token'}) };
  }, AbortController, immediateTimers, () => {}, 'https://example.test/exec');
  const authResult = await authRuntime.authRequest({action:'ptauth', key:'test'});
  assert.equal(authCalls, 3);
  assert.equal(authResult.token, 'test-token');

  let readCalls = 0;
  const readRuntime = buildRuntime(async () => {
    readCalls += 1;
    return readCalls === 1
      ? {ok:false, status:503, json:async () => ({})}
      : {ok:true, status:200, json:async () => ({status:'ok', available:true})};
  }, AbortController, immediateTimers, () => {}, 'https://example.test/exec');
  const readResult = await readRuntime.authRequest({action:'department_ops_read', token:'test-token'});
  assert.equal(readCalls, 2);
  assert.equal(readResult.available, true);

  let publishCalls = 0;
  const publishRuntime = buildRuntime(async () => {
    publishCalls += 1;
    return {ok:false, status:404, json:async () => ({})};
  }, AbortController, immediateTimers, () => {}, 'https://example.test/exec');
  await assert.rejects(() => publishRuntime.authRequest({action:'department_ops_publish'}), /HTTP 404/);
  assert.equal(publishCalls, 1);
});
