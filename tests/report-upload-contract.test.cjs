// 戰報快速更新：GAS 端契約測試（不連線，直接對 Code.gs 做結構與行為驗證）
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');
const page = fs.readFileSync(path.join(root, 'report-upload.html'), 'utf8');
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

test('既有自動化流程未被改動', () => {
  const auto = functionBody(code, 'kpiCalcAutoUpdate');
  assert.match(auto, /KPICALC_LAST_IMPORT/);
  assert.match(auto, /kpiCalcParseReport\(latest\.file\)/);
  assert.doesNotMatch(auto, /reportUpload/);
  for (const name of ['kpiCalcWatchdog', 'kpiCalcPublish', 'privateDashboardPublish']) {
    assert.doesNotMatch(functionBody(code, name), /reportUpload/, `${name} 不應被上傳流程污染`);
  }
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
test('四個上傳端點在做任何事之前都先授權', () => {
  for (const name of ['reportUploadPreview', 'reportUploadCommit', 'reportUploadLog', 'reportUploadRollback']) {
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

test('doPost 已掛上四個上傳 action', () => {
  const doPost = functionBody(code, 'doPost');
  for (const action of ['report_upload_preview', 'report_upload_commit', 'report_upload_log', 'report_upload_rollback']) {
    assert.match(doPost, new RegExp(`action === '${action}'`));
  }
});

// ── 前端 ────────────────────────────────────────────────────
test('前端固定正式端點、走 POST、且自帶權限欄位', () => {
  assert.match(page, /fetch\(DEFAULT_GAS_URL/);
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

test('智慧營運中心新增戰報快速更新入口，且本身仍不含資料或密碼', () => {
  assert.match(home, /href="report-upload\.html"/);
  assert.doesNotMatch(home, /adminSecret|employeeId|script\.google\.com/);
});

// ── 純函式行為測試（把驗證函式抽出來實際跑）────────────────
function loadValidators() {
  const names = [
    'reportUploadCheck_', 'reportUploadValidateFile_', 'reportUploadDateChecks_',
    'reportUploadValidateKpi_', 'reportUploadValidateAward_', 'reportUploadBlocked_',
    'reportUploadKpiDate_', 'reportUploadKind_'
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

test('首次發佈（無正式資料）視為可放行的提醒', () => {
  assert.equal(V.reportUploadDateChecks_('2026-07-31', null).find(c => c.key === 'newer').level, 'warn');
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

test('KPI 資料日期由 month + snapshotDay 組出可比較字串', () => {
  assert.equal(V.reportUploadKpiDate_({ month: '2026-07', snapshotDay: 9 }), '2026-07-09');
  assert.equal(V.reportUploadKpiDate_({ month: '2026-07', snapshotDay: 31 }), '2026-07-31');
  assert.equal(V.reportUploadKpiDate_({ month: '', snapshotDay: 5 }), '');
  assert.equal(V.reportUploadKpiDate_({ month: '2026-07', snapshotDay: 0 }), '');
});
