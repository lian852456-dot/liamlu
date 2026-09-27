// 戰報快速更新：GAS 端契約測試（不連線，直接對 Code.gs 做結構與行為驗證）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');
const page = fs.readFileSync(path.join(root, 'report-upload.html'), 'utf8');
const htmlPage = fs.readFileSync(path.join(root, 'gas/ReportUpload.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated ${name}`);
}

// ── 原則 5：不得複製出第二套解析邏輯 ────────────────────────
test('KPI 上傳共用既有解析器，未新增第二套 xlsx 解析', () => {
  assert.equal((code.match(/function kpiCalcParseReport\(/g) || []).length, 1);
  const preview = functionBody(code, 'reportUploadPreview');
  assert.match(preview, /kpiCalcParseReport\(rawFile\)/);
  // 上傳流程本身不得出現任何自寫的工作表／欄位解析
  assert.doesNotMatch(preview, /getSheetByName|上線數KPI_|kpiCalcBands/);
});

test('既有自動化流程的解析與匯入判斷維持原樣', () => {
  const auto = functionBody(code, 'kpiCalcAutoUpdate');
  assert.match(auto, /KPICALC_LAST_IMPORT/);
  assert.match(auto, /kpiCalcParseReport\(latest\.file\)/);
  assert.doesNotMatch(functionBody(code, 'kpiCalcWatchdog'), /reportUpload|reportVersion/,
    '巡檢只負責通知，不應介入寫入判斷');
});

// ── 防衝突：11:00 排程不得覆蓋 10:55 的手動上傳 ─────────────
test('排程寫入前必須先過版本判斷，且判斷在寫入之前', () => {
  const auto = functionBody(code, 'kpiCalcAutoUpdate');
  const decideAt = auto.indexOf('reportVersionDecide_');
  const writeAt = auto.indexOf('setContent(text)');
  assert.notEqual(decideAt, -1, '排程未接上版本判斷');
  assert.ok(decideAt < writeAt, '必須先判斷再寫入');
  assert.match(auto, /if \(!decision\.accept\)/);
  assert.match(auto, /source: 'scheduled'/);
});

test('既有發佈入口與 KPI component 發布只登記版本、不硬擋（避免打斷外部管線）', () => {
  for (const name of ['kpiCalcPublish', 'privateDashboardPublish', 'privateDashboardPublishKpiComponent']) {
    const body = functionBody(code, name);
    assert.match(body, /reportVersionRecord_/, `${name} 應登記版本`);
    assert.doesNotMatch(body, /reportVersionDecide_/, `${name} 不應硬擋`);
    assert.match(body, /record-only/);
  }
});

test('版本狀態涵蓋指定的九個欄位', () => {
  const body = functionBody(code, 'reportVersionRecord_');
  for (const field of ['reportType', 'dataDate', 'source', 'uploadedAt', 'fileName',
                       'fileHash', 'operator', 'versionId', 'updateStatus']) {
    assert.match(body, new RegExp(field + ':'), `版本狀態缺少 ${field}`);
  }
});

test('只有成功寫入才登記為正式版本', () => {
  assert.match(functionBody(code, 'reportVersionRecord_'),
    /if \(updateStatus === 'success'\) reportVersionSet_/);
});

test('source 四種來源都有定義', () => {
  for (const src of ['scheduled', 'onedrive', 'manual-upload', 'rollback']) {
    assert.ok(code.includes(`'${src}'`), `缺少 source: ${src}`);
  }
});

test('回復後登記為 rollback 來源，排程不會用同日期舊檔蓋回去', () => {
  const body = functionBody(code, 'reportUploadRollback');
  assert.match(body, /source: 'rollback'/);
  assert.match(body, /reportVersionRecord_/);
});

test('手動上傳被版本判斷擋下時不進入任何寫入階段', () => {
  const commit = functionBody(code, 'reportUploadCommit');
  const decideAt = commit.indexOf('reportVersionDecide_');
  const rawAt = commit.indexOf("'raw_backup'");
  assert.ok(decideAt !== -1 && decideAt < rawAt, '版本判斷必須在所有階段之前');
  assert.match(commit, /result: 'blocked'/);
  assert.match(commit, /needsForce: true/);
});

// ── 原則 6/7：KPI 與台獎分開、互不影響 ──────────────────────
test('KPI 與台獎為各自獨立的檔案與備份目標', () => {
  assert.match(code, /REPORT_UPLOAD_KINDS = \{/);
  assert.match(code, /liveFile: PRIVATE_KPICALC_FILE/);
  assert.match(code, /liveFile: PRIVATE_DASHBOARD_FILE/);
  const commit = functionBody(code, 'reportUploadCommit');
  // 一次 commit 只處理一種 kind，天然做到失敗隔離
  assert.match(commit, /const kind = reportUploadKind_\(staged\.kind\)/);
  assert.match(commit, /kind === 'award'/);
});

// ── 原則 8：驗證失敗不得覆蓋正式資料 ────────────────────────
test('preview 在驗證失敗時清掉暫存且不觸碰正式檔', () => {
  const preview = functionBody(code, 'reportUploadPreview');
  assert.match(preview, /reportUploadBlocked_\(checks\)\.length/);
  assert.match(preview, /reportUploadTrash_\(rawFile\)/);
  // preview 不得寫入任何正式檔
  assert.doesNotMatch(preview, /liveFile|setContent/);
});

test('commit 先備份正式資料才改寫，讀回失敗會自動還原', () => {
  const commit = functionBody(code, 'reportUploadCommit');
  const backupAt = commit.indexOf("'backup_current'");
  const writeAt = commit.indexOf('liveFile.setContent(newText)');
  assert.ok(backupAt !== -1 && writeAt !== -1);
  assert.ok(backupAt < writeAt, '必須先備份再改寫正式資料');
  assert.match(commit, /liveFile\.setContent\(previousText\)/);
  assert.match(commit, /已自動還原上一版/);
});

test('備份檔名不得符合 kpiCalcLatestDataFile 的搜尋樣式', () => {
  // kpiCalcLatestDataFile() 取「最後更新最新」的 north12b-kpicalc-*.json。
  // 若備份檔也符合，當「備份成功但寫入正式檔失敗」時，備份會被當成正式資料。
  const pattern = /^north12b-kpicalc-.*\.json$/i;
  const prefix = code.match(/backupPrefix: '(backup-north12b-kpicalc-)'/);
  assert.ok(prefix, 'KPI 備份前綴應為 backup-north12b-kpicalc-');
  assert.ok(!pattern.test(prefix[1] + '20260731-120000.json'),
    '備份檔名不可落入 kpiCalcLatestDataFile 的搜尋範圍');
  // 反向確認：舊命名確實會踩到這個坑，這條測試才有意義
  assert.ok(pattern.test('north12b-kpicalc-backup-20260731-120000.json'));
});

// ── 原則 9 / 五：保留上一版、記錄操作 ───────────────────────
test('每次操作記錄帳號、時間、檔名、資料日期與結果', () => {
  for (const field of ['employee_id', 'acted_at', 'file_name', 'data_date', 'result']) {
    assert.ok(code.includes(`'${field}'`), `log headers missing ${field}`);
  }
  assert.match(functionBody(code, 'reportUploadCommit'), /REPORT_UPLOAD_LOG_SHEET/);
  assert.match(functionBody(code, 'reportUploadRollback'), /REPORT_UPLOAD_LOG_SHEET/);
});

test('稽核紀錄寫在私有名冊試算表的新分頁，未改既有 Sheet 結構', () => {
  assert.match(code, /REPORT_UPLOAD_LOG_SHEET = 'ReportUploadLog'/);
  const commit = functionBody(code, 'reportUploadCommit');
  // 不得碰觸每日回報／巡店明細等既有工作表
  assert.doesNotMatch(commit, /回報資料|巡店明細|getSheet\(\)/);
});

// ── 五：權限（前端與後端都檢查）─────────────────────────────
test('所有上傳與雙檔預覽端點在做任何事之前都先授權', () => {
  for (const name of ['reportUploadPreview', 'reportUploadCommit', 'reportUploadLog', 'reportUploadRollback', 'reportAwardPairPreview']) {
    const body = functionBody(code, name);
    const authAt = body.indexOf('reportUploadAuthorize_');
    assert.notEqual(authAt, -1, `${name} 未授權`);
    for (const sink of ['privateDashboardFolder(', 'setContent(', 'createFile(']) {
      const sinkAt = body.indexOf(sink);
      if (sinkAt !== -1) assert.ok(authAt < sinkAt, `${name} 必須先授權再存取資料`);
    }
  }
});

test('後端授權同時檢查管理者密碼與員編白名單', () => {
  const body = functionBody(code, 'reportUploadAuthorize_');
  assert.match(body, /privateDashboardAdminAuthorized\(payload\)/);
  assert.match(body, /REPORT_UPLOAD_ALLOWED_EMPLOYEES/);
  assert.match(body, /allowed\.indexOf\(employeeId\) === -1/);
  assert.match(body, /此員編未被授權/);
});

test('commit 會確認預覽與確認是同一位操作者', () => {
  assert.match(functionBody(code, 'reportUploadCommit'), /staged\.employeeId !== employeeId/);
});

test('doPost 已掛上上傳與 preview-only 台獎 action', () => {
  const doPost = functionBody(code, 'doPost');
  for (const action of ['report_upload_preview', 'report_upload_commit', 'report_upload_log', 'report_upload_rollback', 'report_award_pair_preview']) {
    assert.match(doPost, new RegExp(`action === '${action}'`));
  }
});

// ── 前端 ────────────────────────────────────────────────────
test('開發模板只允許測試覆寫端點，且自帶權限欄位', () => {
  assert.match(page, /const UPLOAD_GAS_URL = ''/);
  assert.match(page, /fetch\(uploadGasUrl\(\)/);
  assert.match(page, /method: 'POST'/);
  assert.match(page, /result\.status !== 'ok'/);
  const authFn = functionBody(page, 'auth');
  assert.match(authFn, /payload\.employeeId = AUTH\.employeeId/);
  assert.match(authFn, /payload\.adminSecret = AUTH\.adminSecret/);
});

test('前端不把員編或密碼寫進 localStorage／sessionStorage', () => {
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});

test('前端輸出一律 escape，避免檔名或訊息注入 HTML', () => {
  assert.match(page, /function esc\(s\)/);
  for (const fn of ['renderChecks', 'renderPreview', 'renderResult', 'renderLog']) {
    const body = functionBody(page, fn);
    assert.doesNotMatch(body, /\$\{(?!\s*\})/, `${fn} 不應使用未轉義樣板字串`);
    assert.match(body, /esc\(/, `${fn} 必須 escape`);
  }
});

test('狀態顯示涵蓋成功／失敗／未執行／維持上一版四種', () => {
  assert.match(page, /ok: '成功', fail: '失敗', skip: '未執行', kept: '維持上一版'/);
});

test('智慧營運中心入口直接開啟獨立 Apps Script，且本身仍不含資料或密碼', () => {
  assert.match(home, /href="https:\/\/script\.google\.com\/macros\/s\/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq\/exec"/);
  assert.doesNotMatch(home, /adminSecret|employeeId|REPORT_UPLOAD_ALLOWED_EMPLOYEES|DASHBOARD_ADMIN_SECRET/);
});

// ── 純函式行為測試（把驗證函式抽出來實際跑）────────────────
function loadValidators() {
  const names = [
    'reportUploadCheck_', 'reportUploadValidateFile_', 'reportUploadDateChecks_', 'reportUploadKpiDateChecks_',
    'reportUploadValidateKpi_', 'reportUploadValidateAward_', 'reportUploadBlocked_',
    'reportUploadKpiDate_', 'reportUploadKind_', 'reportUploadStoreMatch_', 'reportUploadStoreBuckets_'
  ];
  let src = `
    const STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
    const KPICALC_ITEMS = new Array(25).fill(['x','x',1]);
    const REPORT_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
    const REPORT_UPLOAD_KINDS = { kpi: { ext: '.xlsx', label: 'KPI' }, award: { ext: '.json', label: '台獎' } };
  `;
  for (const n of names) src += `function ${n}(${''}` + rawArgs(n) + `) {${functionBody(code, n)}}\n`;
  src += 'module.exports = { ' + names.join(', ') + ' };';
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}

function rawArgs(name) {
  const start = code.indexOf(`function ${name}(`);
  const open = code.indexOf('(', start);
  const close = code.indexOf(')', open);
  return code.slice(open + 1, close);
}

const V = loadValidators();

test('副檔名錯誤會被擋下（情境 5：上傳錯誤檔案）', () => {
  const checks = V.reportUploadValidateFile_('kpi', '台獎.json', 1024);
  assert.equal(checks.find(c => c.key === 'ext').level, 'block');
  assert.equal(V.reportUploadBlocked_(checks).length, 1);
});

test('空檔與超大檔會被擋下', () => {
  assert.equal(V.reportUploadValidateFile_('kpi', 'a.xlsx', 0).find(c => c.key === 'size').level, 'block');
  assert.equal(V.reportUploadValidateFile_('kpi', 'a.xlsx', 99 * 1024 * 1024).find(c => c.key === 'size').level, 'block');
  assert.equal(V.reportUploadValidateFile_('kpi', 'a.xlsx', 4096).find(c => c.key === 'size').level, 'ok');
});

test('舊日期會被擋下、同日期只提醒（情境 7：上傳舊日期）', () => {
  const live = { dataDate: '2026-07-30' };
  assert.equal(V.reportUploadDateChecks_('2026-07-28', live).find(c => c.key === 'newer').level, 'block');
  assert.equal(V.reportUploadDateChecks_('2026-07-30', live).find(c => c.key === 'newer').level, 'warn');
  assert.equal(V.reportUploadDateChecks_('2026-07-31', live).find(c => c.key === 'newer').level, 'ok');
  assert.equal(V.reportUploadDateChecks_('', live).find(c => c.key === 'date').level, 'block');
});

test('KPI 同日期或舊日期一律拒絕，不能走 force 覆寫', () => {
  const live = { dataDate: '2026-07-30' };
  assert.equal(V.reportUploadKpiDateChecks_('2026-07-30', live).find(c => c.key === 'newer').level, 'block');
  assert.equal(V.reportUploadKpiDateChecks_('2026-07-29', live).find(c => c.key === 'newer').level, 'block');
  assert.equal(V.reportUploadKpiDateChecks_('2026-07-31', live).find(c => c.key === 'newer').level, 'ok');
  assert.match(functionBody(code, 'reportUploadCommit'), /if \(kind === 'kpi'\) incoming\.force = false/);
});

test('首次發佈（無正式資料）視為可放行的提醒', () => {
  assert.equal(V.reportUploadDateChecks_('2026-07-31', null).find(c => c.key === 'newer').level, 'warn');
});

// 2026-07-31 以真實 0730.xlsx 實測到的店名寫法（僅店名，不含任何業績數字）
const REAL_STORE_NAMES = ['台北酒泉', '台北永吉', '台北復興南', '台北杭州南', '台北萬大',
  '台北通化', '台北大稻埕', '台灣大哥大數位生活台北三創', '台北六張犁'];

test('真實日報的店名寫法必須全部對得到 STORES（回歸：曾誤判為其他區）', () => {
  // 報表是「台北酒泉」，STORES 是「酒泉」；三創是「台灣大哥大數位生活台北三創」對「台北三創」。
  // 舊版用精確比對 → 9 家全部落空 → 真實日報被 block。
  for (const name of REAL_STORE_NAMES) {
    const r = V.reportUploadStoreMatch_(name);
    assert.equal(r.status, 'matched', `真實店名對不到：${name} → ${JSON.stringify(r)}`);
  }
});

test('真實 0730 店名組合可通過區域檢查', () => {
  const stores = REAL_STORE_NAMES.map((n, i) => ({ code: 'DNB1000' + i, name: n }));
  const checks = V.reportUploadValidateKpi_(kpiData({ stores }), { dataDate: '2026-07-28' });
  assert.equal(checks.find(c => c.key === 'region').level, 'ok');
  assert.equal(V.reportUploadBlocked_(checks).length, 0);
});

test('其他區店名仍然要被擋下（放寬比對不能放行外區）', () => {
  for (const name of ['台北板橋', '桃園中壢', '新竹光復']) {
    assert.equal(V.reportUploadStoreMatch_(name).status, 'none', `不該對到：${name}`);
  }
  const stores = ['台北板橋', '桃園中壢', '新竹光復', '台中一中', '高雄左營']
    .map((n, i) => ({ code: 'DNB200' + i, name: n }));
  assert.equal(V.reportUploadValidateKpi_(kpiData({ stores }), null).find(c => c.key === 'region').level, 'block');
});

test('台獎快照也適用同一套店名比對', () => {
  const snapshot = { kpiBattle: { report_date: '2026-07-31' },
                     awardsBattle: { stores: REAL_STORE_NAMES.map(n => ({ store: n })) } };
  assert.equal(V.reportUploadValidateAward_(snapshot, null).find(c => c.key === 'region').level, 'ok');
});

function kpiData(overrides) {
  const base = {
    meta: { period: '2026/07/01 ~ 07/31', month: '2026-07', snapshotDay: 31 },
    stores: ['通化', '酒泉', '台北三創', '萬大', '六張犁'].map((n, i) => ({ code: 'DNB0' + i, name: n })),
    persons: new Array(12).fill({})
  };
  return Object.assign(base, overrides || {});
}

test('正確 KPI 檔案通過全部驗證（情境 1）', () => {
  const checks = V.reportUploadValidateKpi_(kpiData(), { dataDate: '2026-07-30' });
  assert.equal(V.reportUploadBlocked_(checks).length, 0);
  assert.equal(checks.find(c => c.key === 'region').level, 'ok');
  assert.equal(checks.find(c => c.key === 'count').level, 'ok');
});

test('錯區域資料會被擋下（情境 8）', () => {
  const wrongCode = kpiData({ stores: [{ code: 'DNA01', name: '通化' }] });
  assert.equal(V.reportUploadValidateKpi_(wrongCode, null).find(c => c.key === 'region').level, 'block');
  const wrongNames = kpiData({ stores: ['板橋', '中和', '永和', '新莊', '三重'].map((n, i) => ({ code: 'DNB0' + i, name: n })) });
  assert.equal(V.reportUploadValidateKpi_(wrongNames, null).find(c => c.key === 'region').level, 'block');
});

test('筆數不足會被擋下（情境 9：解析結果不合理）', () => {
  const thin = kpiData({ stores: [{ code: 'DNB01', name: '通化' }], persons: [{}] });
  assert.equal(V.reportUploadValidateKpi_(thin, null).find(c => c.key === 'count').level, 'block');
});

test('缺少期間會被擋下（情境 6：缺少必要欄位）', () => {
  const noPeriod = kpiData({ meta: { month: '', snapshotDay: 0 } });
  const checks = V.reportUploadValidateKpi_(noPeriod, null);
  assert.equal(checks.find(c => c.key === 'period').level, 'block');
  assert.equal(checks.find(c => c.key === 'date').level, 'block');
});

test('台獎快照格式不完整會被擋下（情境 6）', () => {
  const checks = V.reportUploadValidateAward_({ kpiBattle: {} }, null);
  assert.equal(checks.find(c => c.key === 'fields').level, 'block');
  assert.equal(V.reportUploadBlocked_(checks).length, 1);
});

test('正確台獎快照通過驗證（情境 2）', () => {
  const snapshot = {
    kpiBattle: { report_date: '2026-07-31' },
    awardsBattle: { stores: [{ store: '通化' }, { store: '酒泉' }] }
  };
  assert.equal(V.reportUploadBlocked_(V.reportUploadValidateAward_(snapshot, { dataDate: '2026-07-30' })).length, 0);
});

test('台獎錯區域資料會被擋下（情境 8）', () => {
  const snapshot = { kpiBattle: { report_date: '2026-07-31' }, awardsBattle: { stores: [{ store: '板橋' }] } };
  assert.equal(V.reportUploadValidateAward_(snapshot, null).find(c => c.key === 'region').level, 'block');
});

test('未知報表類型直接拒絕', () => {
  assert.throws(() => V.reportUploadKind_('patrol'), /僅支援/);
  assert.equal(V.reportUploadKind_('kpi'), 'kpi');
  assert.equal(V.reportUploadKind_('award'), 'award');
});

test('KPI 資料日期由解析後期間末日與 snapshotDay 組出可比較字串', () => {
  assert.equal(V.reportUploadKpiDate_({ month: '2026-07', snapshotDay: 9 }), '2026-07-09');
  assert.equal(V.reportUploadKpiDate_({ month: '2026-07', snapshotDay: 31 }), '2026-07-31');
  assert.equal(V.reportUploadKpiDate_({
    sourceFile: '0824.xlsx', month: '2026-08', snapshotDay: 23, period: '2026/08/01 ~ 08/23'
  }), '2026-08-23');
  assert.equal(V.reportUploadKpiDate_({
    sourceFile: '0824.xlsx', month: '2026-08', snapshotDay: 24, period: '2026/08/01 ~ 08/23'
  }), '');
  assert.equal(V.reportUploadKpiDate_({
    sourceFile: '0824.xlsx', month: '2026-08', snapshotDay: 23, period: '2026/08/23 ~ 08/22'
  }), '');
  assert.equal(V.reportUploadKpiDate_({ month: '', snapshotDay: 5 }), '');
  assert.equal(V.reportUploadKpiDate_({ month: '2026-07', snapshotDay: 0 }), '');
});

// ── 防衝突判斷：實際執行 reportVersionDecide_ 驗證每條規則 ──
function loadDecider() {
  const src = `
    const REPORT_VERSION_MANUAL_SOURCES = ['manual-upload', 'rollback'];
    const REPORT_VERSION_AUTO_SOURCES = ['scheduled', 'onedrive'];
    let __current = null;
    function reportVersionGet_(kind) { return __current; }
    function setCurrent(v) { __current = v; }
    function reportVersionDecide_(${rawArgs('reportVersionDecide_')}) {${functionBody(code, 'reportVersionDecide_')}}
    module.exports = { reportVersionDecide_, setCurrent };
  `;
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}

const D = loadDecider();

const MANUAL_1055 = {
  dataDate: '2026-07-31', source: 'manual-upload',
  uploadedAt: '2026-07-31T10:55:00+08:00', fileHash: 'aaa'
};

test('11:00 排程不得覆蓋 10:55 的同日期手動上傳', () => {
  D.setCurrent(MANUAL_1055);
  const r = D.reportVersionDecide_('kpi', { dataDate: '2026-07-31', source: 'scheduled', fileHash: 'bbb' });
  assert.equal(r.accept, false);
  assert.equal(r.rule, 'manual-wins');
  assert.match(r.reason, /10:55/);
});

test('隔天的新資料排程照樣可以更新', () => {
  D.setCurrent(MANUAL_1055);
  const r = D.reportVersionDecide_('kpi', { dataDate: '2026-08-01', source: 'scheduled', fileHash: 'bbb' });
  assert.equal(r.accept, true);
  assert.equal(r.rule, 'newer-date');
});

test('8/23 manual upload 不得誤擋 8/24 的 0824.xlsx cutoff 8/23', () => {
  D.setCurrent({
    dataDate: '2026-08-22', source: 'manual-upload',
    uploadedAt: '2026-08-23T11:00:00+08:00', fileHash: 'manual-0823'
  });
  const incomingDate = V.reportUploadKpiDate_({
    sourceFile: '0824.xlsx', month: '2026-08', snapshotDay: 23, period: '2026/08/01 ~ 08/23'
  });
  const r = D.reportVersionDecide_('kpi', {
    dataDate: incomingDate, source: 'scheduled', fileHash: 'scheduled-0824'
  });
  assert.equal(incomingDate, '2026-08-23');
  assert.equal(r.accept, true);
  assert.equal(r.rule, 'newer-date');
});

test('較舊日期一律拒絕，不分來源', () => {
  D.setCurrent(MANUAL_1055);
  for (const source of ['scheduled', 'onedrive', 'manual-upload', 'rollback']) {
    const r = D.reportVersionDecide_('kpi', { dataDate: '2026-07-30', source, fileHash: 'bbb' });
    assert.equal(r.accept, false, `${source} 不該接受舊日期`);
    assert.equal(r.rule, 'older-date');
  }
});

test('只有手動來源可以強制覆寫較舊日期', () => {
  D.setCurrent(MANUAL_1055);
  const manual = D.reportVersionDecide_('kpi', { dataDate: '2026-07-30', source: 'manual-upload', fileHash: 'b', force: true });
  assert.equal(manual.accept, true);
  assert.equal(manual.rule, 'forced-older');
  // 排程即使誤帶 force 也不能靠 force 寫入舊日期
  const scheduled = D.reportVersionDecide_('kpi', { dataDate: '2026-07-30', source: 'scheduled', fileHash: 'b', force: true });
  assert.equal(scheduled.accept, false);
});

test('同一份檔案（雜湊相同）不重複寫入', () => {
  D.setCurrent(MANUAL_1055);
  const r = D.reportVersionDecide_('kpi', { dataDate: '2026-07-31', source: 'scheduled', fileHash: 'aaa' });
  assert.equal(r.accept, false);
  assert.equal(r.rule, 'same-hash');
});

test('rollback 之後排程不得用同日期的舊檔蓋回去', () => {
  D.setCurrent({ dataDate: '2026-07-31', source: 'rollback', uploadedAt: '2026-07-31T13:00:00+08:00', fileHash: 'ccc' });
  const r = D.reportVersionDecide_('kpi', { dataDate: '2026-07-31', source: 'scheduled', fileHash: 'ddd' });
  assert.equal(r.accept, false);
  assert.equal(r.rule, 'manual-wins');
});

test('手動上傳可以覆蓋同日期的排程版本（更正版）', () => {
  D.setCurrent({ dataDate: '2026-07-31', source: 'scheduled', uploadedAt: '2026-07-31T11:51:00+08:00', fileHash: 'aaa' });
  const r = D.reportVersionDecide_('kpi', { dataDate: '2026-07-31', source: 'manual-upload', fileHash: 'bbb' });
  assert.equal(r.accept, true);
  assert.equal(r.rule, 'same-date-replace');
});

test('沒有版本紀錄時視為首次寫入', () => {
  D.setCurrent(null);
  const r = D.reportVersionDecide_('kpi', { dataDate: '2026-07-31', source: 'scheduled', fileHash: 'a' });
  assert.equal(r.accept, true);
  assert.equal(r.rule, 'first-version');
});

test('排程連續兩天正常運作不受防衝突影響', () => {
  D.setCurrent({ dataDate: '2026-07-30', source: 'scheduled', uploadedAt: '2026-07-30T11:51:00+08:00', fileHash: 'a' });
  const day1 = D.reportVersionDecide_('kpi', { dataDate: '2026-07-31', source: 'scheduled', fileHash: 'b' });
  assert.equal(day1.accept, true);
  D.setCurrent({ dataDate: '2026-07-31', source: 'scheduled', uploadedAt: '2026-07-31T11:51:00+08:00', fileHash: 'b' });
  const day2 = D.reportVersionDecide_('kpi', { dataDate: '2026-08-01', source: 'scheduled', fileHash: 'c' });
  assert.equal(day2.accept, true);
});

// ── 五：店名比對逐項驗收（Liam 指定的六條）──────────────────
test('指定店名逐一命中正確的 STORES 項目', () => {
  const expect = {
    '台北酒泉': '酒泉', '台北通化': '通化', '台灣大哥大數位生活台北三創': '台北三創',
    '台北永吉': '永吉', '台北復興南': '復興南', '台北杭州南': '杭州南',
    '台北萬大': '萬大', '台北大稻埕': '大稻埕', '台北六張犁': '六張犁',
  };
  for (const [raw, want] of Object.entries(expect)) {
    const r = V.reportUploadStoreMatch_(raw);
    assert.equal(r.status, 'matched', `${raw} 未命中`);
    assert.equal(r.store, want, `${raw} 應命中 ${want}，實得 ${r.store}`);
  }
  assert.equal(Object.keys(expect).length, 9, '應涵蓋 9 家門市');
});

test('同時命中兩家時回傳 ambiguous-store-match，且不自行選擇', () => {
  // 用一個同時包含兩個門市關鍵字的名稱模擬歧義
  const r = V.reportUploadStoreMatch_('台北通化萬大門市');
  assert.equal(r.status, 'ambiguous-store-match');
  assert.equal(r.store, '', '歧義時不得自行選一家');
  // vm sandbox 的陣列跨 realm，deepStrictEqual 會因原型不同而失敗，改比字串
  assert.equal(Array.from(r.candidates).sort().join('/'), ['通化', '萬大'].sort().join('/'));
});

test('完全相等可消解包含比對造成的歧義', () => {
  const r = V.reportUploadStoreMatch_('通化');
  assert.equal(r.status, 'matched');
  assert.equal(r.store, '通化');
});

test('歧義店名會讓區域檢查 block，訊息含 ambiguous-store-match', () => {
  const stores = [{ code: 'DNB1', name: '台北通化萬大門市' }].concat(
    REAL_STORE_NAMES.slice(0, 5).map((n, i) => ({ code: 'DNB9' + i, name: n })));
  const region = V.reportUploadValidateKpi_(kpiData({ stores }), null).find(c => c.key === 'region');
  assert.equal(region.level, 'block');
  assert.match(region.detail, /ambiguous-store-match/);
});

test('buckets 會把命中／未命中／歧義分開', () => {
  const b = V.reportUploadStoreBuckets_(['台北酒泉', '桃園中壢', '台北通化萬大門市']);
  assert.equal(Array.from(b.matched).join(','), '台北酒泉');
  assert.equal(Array.from(b.none).join(','), '桃園中壢');
  assert.equal(b.ambiguous.length, 1);
  assert.match(b.ambiguous[0], /通化/);
});

// ── 四：Drive 暫存檔加固 ────────────────────────────────────
test('暫存檔使用固定前綴', () => {
  assert.match(code, /REPORT_UPLOAD_TEMP_PREFIX = 'report-upload-temp-'/);
  assert.match(code, /REPORT_UPLOAD_STAGING_PREFIX = 'report-upload-staging-'/);
  const preview = functionBody(code, 'reportUploadPreview');
  assert.doesNotMatch(preview, /'upload-tmp-'|'upload-staging-'/, '不應殘留舊前綴');
  assert.match(preview, /REPORT_UPLOAD_TEMP_PREFIX \+ token/);
});

test('暫存檔建在私有戰情資料夾，不進 KPI 來源資料夾', () => {
  const preview = functionBody(code, 'reportUploadPreview');
  assert.match(preview, /const folder = privateDashboardFolder\(\)/);
  assert.doesNotMatch(preview, /KPICALC_SOURCE_FOLDER_ID/, '暫存檔不得寫入排程來源資料夾');
  assert.doesNotMatch(functionBody(code, 'reportUploadCleanupTemp'), /KPICALC_SOURCE_FOLDER_ID/);
});

test('preview 以 try/finally 保證清理，只有成功暫存才保留原始檔', () => {
  const preview = functionBody(code, 'reportUploadPreview');
  assert.match(preview, /let keepRaw = false;/);
  assert.match(preview, /keepRaw = true;/);
  assert.match(preview, /\} finally \{\s*if \(!keepRaw\) reportUploadTrash_\(rawFile\);\s*\}/);
});

test('解析失敗也會走到 finally 清理（catch 內不再自行 trash）', () => {
  const preview = functionBody(code, 'reportUploadPreview');
  const catchAt = preview.indexOf('} catch (err) {');
  const finallyAt = preview.indexOf('} finally {');
  assert.ok(catchAt !== -1 && finallyAt > catchAt);
  const catchBody = preview.slice(catchAt, finallyAt);
  assert.doesNotMatch(catchBody, /reportUploadTrash_/, 'catch 不該自行清理，交給 finally');
  assert.match(catchBody, /檔案解析/);
});

test('排程的檔名樣式掃不到暫存檔', () => {
  const pattern = /^(\d{4})\.xlsx$/;   // kpiCalcAutoUpdate 使用的樣式
  assert.match(functionBody(code, 'kpiCalcAutoUpdate'), /\^\(\\d\{4\}\)\\\.xlsx\$/);
  for (const n of ['report-upload-temp-abc123-0730.xlsx',
                   'report-upload-staging-kpi-abc123.json',
                   'backup-north12b-kpicalc-20260731-120000.json']) {
    assert.ok(!pattern.test(n), `排程不該掃到 ${n}`);
  }
  assert.ok(pattern.test('0730.xlsx'), '正常日報仍要被掃到');
});

test('可清理異常中斷留下的舊暫存檔，且只清固定前綴', () => {
  const body = functionBody(code, 'reportUploadCleanupTemp');
  assert.match(body, /REPORT_UPLOAD_TEMP_PREFIX/);
  assert.match(body, /REPORT_UPLOAD_STAGING_PREFIX/);
  assert.match(body, /getLastUpdated\(\)\.getTime\(\) > cutoff/);
  assert.match(body, /setTrashed\(true\)/);
  assert.match(functionBody(code, 'reportUploadPreview'), /reportUploadCleanupTemp\(\)/);
});

test('暫存檔錯誤紀錄只寫 fileId，不寫檔名或業績內容', () => {
  const trash = functionBody(code, 'reportUploadTrash_');
  assert.match(trash, /fileId=/);
  assert.doesNotMatch(trash, /getName\(\)/, '錯誤紀錄不得帶檔名');
  const cleanup = functionBody(code, 'reportUploadCleanupTemp');
  assert.match(cleanup, /fileIds: removed/);
  assert.doesNotMatch(cleanup, /console\.log\([^)]*getName/);
});

// ── 二：預覽日期四項 ────────────────────────────────────────
test('preview 回傳檔名、上傳時間與是否晚於正式版本', () => {
  const body = functionBody(code, 'reportUploadPreview');
  assert.match(body, /const uploadedAt = privateDashboardNow\(\)/);
  assert.match(body, /fileName: fileName, uploadedAt: uploadedAt/);
  assert.match(body, /newerThanLive:/);
});

test('前端日期面板同時顯示四項並說明檔名與資料日期的差異', () => {
  const fn = functionBody(page, 'renderDates');
  for (const label of ['原始檔名', '報表資料日期', '上傳時間', '是否晚於正式版本']) {
    assert.ok(fn.includes(label), `日期面板缺少：${label}`);
  }
  assert.match(fn, /報表產出日/);
  assert.match(fn, /統計截止日/);
  assert.match(fn, /不用檔名推算/);
});

function loadAwardPairPreviewBuilder() {
  const names = ['reportAwardPairBuildPreview_'];
  const src = `
    const STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
    const REPORT_AWARD_PAIR_EXPECTED_STORES = 9;
    const REPORT_AWARD_PAIR_EXPECTED_PERSONS = 41;
    function reportUploadCheck_(${rawArgs('reportUploadCheck_')}) {${functionBody(code, 'reportUploadCheck_')}}
    function reportAwardPairBuildPreview_(${rawArgs('reportAwardPairBuildPreview_')}) {${functionBody(code, 'reportAwardPairBuildPreview_')}}
    module.exports = { reportAwardPairBuildPreview_ };
  `;
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}

const AwardPreview = loadAwardPairPreviewBuilder();
function loadAwardDateParser() {
  const src = `module.exports = function reportAwardPairRangeDate_(${rawArgs('reportAwardPairRangeDate_')}) {${functionBody(code, 'reportAwardPairRangeDate_')}};`;
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}
const awardRangeDate = loadAwardDateParser();
function awardSource(role, overrides = {}) {
  const stores = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
  return Object.assign({
    role, dataDate: '2026-08-06', sheetNames: [role === 'store' ? '上線數KPI_店點達成率_明細' : '手機競賽_個人達成率'],
    selectedSheet: role === 'store' ? '上線數KPI_店點達成率_明細' : '手機競賽_個人達成率',
    recordCount: role === 'store' ? 9 : 41, canonicalStores: stores, missingStores: [], unmatchedCount: 0,
    duplicateCount: 0, incompleteCount: 0, rankFieldFound: true, awardFieldFound: true, headers: ['排名', '實際獎金']
  }, overrides);
}

test('雙檔 preview 以固定 reportDate.store／person 輸出，並檢查 9 店與 41 人', () => {
  const preview = AwardPreview.reportAwardPairBuildPreview_(awardSource('store'), awardSource('person'), []);
  assert.deepEqual(JSON.parse(JSON.stringify(preview.reportDate)), { store: '2026-08-06', person: '2026-08-06' });
  assert.equal(preview.summary.storeCount, 9);
  assert.equal(preview.summary.personCount, 41);
  assert.equal(preview.publishable, false);
  assert.equal(preview.formalDataChanged, false);
  assert.equal(preview.checks.every(check => check.level === 'ok'), true);
});

test('雙檔資料日期從 Excel 期間右端擷取，避免 store／person 日期為空', () => {
  const rows = [{ row: 2, cells: { A: '統計期間 2026/08/01 ~ 08/06' } }];
  assert.equal(awardRangeDate(rows), '2026-08-06');
  assert.match(functionBody(code, 'reportAwardPairAnalyze_'), /dataDate: reportAwardPairRangeDate_\(rows\)/);
});

test('雙檔日期不一致、重複或缺少排名／獎金欄位均停在 preview block', () => {
  const person = awardSource('person', { dataDate: '2026-08-05', duplicateCount: 1, rankFieldFound: false, awardFieldFound: false });
  const preview = AwardPreview.reportAwardPairBuildPreview_(awardSource('store'), person, []);
  for (const key of ['date', 'duplicates', 'ranking', 'award']) {
    assert.equal(preview.checks.find(check => check.key === key).level, 'block', key);
  }
  assert.equal(preview.reportDate.store, '2026-08-06');
  assert.equal(preview.reportDate.person, '2026-08-05');
});

test('雙檔 preview 不建立 staging、不寫正式 JSON、Mail、網站或排程', () => {
  const body = functionBody(code, 'reportAwardPairPreview');
  for (const forbidden of ['DriveApp', 'privateDashboardFolder', 'createFile', 'setContent', 'reportUploadCommit', 'MailApp', 'privateDashboardPublish', 'ScriptApp.newTrigger']) {
    assert.equal(body.includes(forbidden), false, forbidden);
  }
  assert.match(body, /publishable: false/);
  assert.match(body, /formalDataChanged: false/);
  assert.match(htmlPage, /<details class="notice">/);
  assert.match(functionBody(htmlPage, 'renderAwardPreview'), /awardDiff/);
  assert.match(functionBody(htmlPage, 'renderAwardPreview'), /awardDebug/);
});

// ── 三：預覽不得更新任何正式資料 ────────────────────────────
test('preview 不寫正式 JSON、不寫版本屬性、不發佈', () => {
  const body = functionBody(code, 'reportUploadPreview');
  for (const sink of ['reportVersionRecord_', 'reportVersionSet_', 'setProperty',
                      'kpiCalcPublish', 'privateDashboardPublish', 'MailApp']) {
    assert.ok(!body.includes(sink), `preview 不得呼叫 ${sink}`);
  }
  // 只允許讀版本狀態來做預告，不允許寫
  assert.match(body, /reportVersionDecide_/);
  assert.match(body, /reportVersionGet_/);
});

test('正式資料的寫入只發生在 commit 與 rollback', () => {
  const writers = ['reportUploadCommit', 'reportUploadRollback'];
  for (const name of writers) {
    assert.match(functionBody(code, name), /setContent\(/, `${name} 應該是寫入者`);
  }
  assert.doesNotMatch(functionBody(code, 'reportUploadPreview'), /setContent\(/);
  assert.doesNotMatch(functionBody(code, 'reportUploadLog'), /setContent\(/);
});

// ── 部署隔離：上傳走獨立 Deployment，每日回報固定第 15 版 ──
test('doPost 在上傳部署模式只放行固定上傳／preview 路由，且判斷在所有路由之前', () => {
  const doPost = functionBody(code, 'doPost');
  const gateAt = doPost.indexOf('reportUploadIsUploadDeployment_()');
  const firstRouteAt = doPost.indexOf("action === 'ptauth'");
  assert.ok(gateAt !== -1, 'doPost 未接上部署隔離閘');
  assert.ok(gateAt < firstRouteAt, '隔離判斷必須在任何路由之前');
  assert.match(doPost, /route-not-available-on-upload-deployment/);
  const list = code.match(/REPORT_UPLOAD_ALLOWED_ACTIONS = \[([^\]]+)\]/);
  assert.ok(list, '缺少 REPORT_UPLOAD_ALLOWED_ACTIONS');
  const actions = list[1].match(/'[^']+'/g).map(x => x.slice(1, -1));
  assert.deepEqual(actions.sort(), ['report_upload_commit', 'report_upload_log',
    'report_upload_preview', 'report_upload_rollback', 'report_award_pair_preview'].sort(), '白名單必須只包含固定上傳與 preview 路由');
});

test('doGet 在上傳部署模式回 ping／同源頁面，其餘 JSON GET 一律拒絕', () => {
  const doGet = functionBody(code, 'doGet');
  const gateAt = doGet.indexOf('reportUploadIsUploadDeployment_()');
  const pingAt = doGet.indexOf("action === 'ping'");
  assert.ok(gateAt !== -1 && gateAt < pingAt, '隔離判斷必須在一般 ping 之前');
  assert.match(doGet, /app: 'report-upload'/);
  assert.match(doGet, /reportUploadHtmlService_\(\)/);
  assert.match(doGet, /route-not-available-on-upload-deployment/);
});

test('隔離判斷行為：未設定屬性不啟用、URL 相符才啟用、觸發器情境安全', () => {
  const body = functionBody(code, 'reportUploadIsUploadDeployment_');
  function run(propValue, getUrlImpl) {
    const sandbox = {
      module: { exports: {} }, console,
      PropertiesService: { getScriptProperties: () => ({ getProperty: () => propValue }) },
      ScriptApp: { getService: () => ({ getUrl: getUrlImpl }) },
    };
    vm.createContext(sandbox);
    vm.runInContext(`module.exports = function(){${body}};`, sandbox);
    return sandbox.module.exports();
  }
  const URL = 'https://script.google.com/macros/s/UPLOAD/exec';
  assert.equal(run(null, () => URL), false, '屬性未設定必須不啟用（主部署行為不變）');
  assert.equal(run('', () => URL), false);
  assert.equal(run(URL, () => URL), true, 'URL 相符必須啟用隔離');
  assert.equal(run(URL, () => 'https://script.google.com/macros/s/DAILY/exec'), false, 'URL 不符不得啟用');
  assert.equal(run(URL, () => { throw new Error('no web app'); }), false, '觸發器情境必須安全回 false');
  assert.equal(run(URL, () => ''), false, 'getUrl 為空必須回 false');
});

test('GitHub Pages 模板不含正式端點，正式頁改走同源 HtmlService', () => {
  assert.match(page, /const UPLOAD_GAS_URL = ''/);
  assert.doesNotMatch(page, /https:\/\/script\.google\.com/);
  assert.doesNotMatch(page, /DEFAULT_GAS_URL/, '上傳頁不得再引用每日回報端點');
  assert.doesNotMatch(page, /localStorage|sessionStorage/, '端點與登入資訊都不得進瀏覽器儲存');
  // 佔位字守門：未設定時登入直接被擋
  const login = functionBody(page, 'doLogin');
  assert.match(login, /CHANGE_ME/);
  assert.match(login, /僅供開發模板/);
  // 測試注入鉤只在 uploadGasUrl 讀取，不寫入
  assert.equal((page.match(/__UPLOAD_GAS_URL_OVERRIDE__/g) || []).length, 2,
    '__UPLOAD_GAS_URL_OVERRIDE__ 只應出現在註解與 uploadGasUrl 讀取處');
});

test('同源 HtmlService 僅使用 google.script.run，且所有上傳／preview 呼叫都有包裝函式', () => {
  assert.match(functionBody(code, 'reportUploadHtmlService_'), /createHtmlOutputFromFile\('ReportUpload'\)/);
  for (const name of ['report_upload_preview', 'report_upload_commit', 'report_upload_log', 'report_upload_rollback', 'report_award_pair_preview']) {
    assert.match(code, new RegExp(`function ${name}\\(payload\\)`));
    assert.match(htmlPage, new RegExp(`call\\('${name}'`));
  }
  assert.match(htmlPage, /google\.script\.run/);
  assert.doesNotMatch(htmlPage, /fetch\(|https:\/\/script\.google\.com|REPORT_UPLOAD_ALLOWED_EMPLOYEES|DASHBOARD_ADMIN_SECRET/);
  assert.doesNotMatch(htmlPage, /localStorage|sessionStorage/);
});

test('所有前端頁面不含實際白名單員編、管理密碼值或 Script Property', () => {
  const frontends = [page, htmlPage, home];
  for (const source of frontends) {
    assert.doesNotMatch(source, /5510755/, '前端不得包含實際白名單員編');
    assert.doesNotMatch(source, /REPORT_UPLOAD_ALLOWED_EMPLOYEES|DASHBOARD_ADMIN_SECRET/,
      '前端不得包含 Script Property 名稱或值');
  }
  const passwordInputs = htmlPage.match(/<input[^>]*type="password"[^>]*>/g) || [];
  assert.ok(passwordInputs.length > 0, '同源頁應保留使用者輸入的密碼欄位');
  for (const input of passwordInputs) {
    assert.doesNotMatch(input, /\svalue\s*=/i, '密碼欄位不得提供硬編碼預設值');
  }
});
