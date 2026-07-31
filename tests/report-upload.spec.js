// 戰報快速更新：端到端驗收情境（GAS 以 route 模擬，驗證前端流程與失敗保護）
const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../report-upload.html');
const GAS_PATTERN = 'https://script.google.com/**';

const GOOD_EMP = 'A12345';
const BAD_EMP = 'B99999';
const SECRET = 'correct-admin-secret';

const KPI_LIVE = { fileName: 'north12b-kpicalc-private-latest.json', dataDate: '2026-07-30', label: '2026/07/01 ~ 07/30（第 30 天）', updatedAt: '2026-07-30T11:51:00+08:00' };
const AWARD_LIVE = { fileName: 'north12b-dashboard-private-latest.json', dataDate: '2026-07-30', label: '2026-07-30', updatedAt: '2026-07-30T09:00:00+08:00' };

function ok(level, label, detail) { return { key: label, label, level, detail: detail || '' }; }

function stage(key, label, status, detail) { return { key, label, status, detail: detail || '' }; }

// 依情境設定回應。behaviour[kind] 決定該車道的成敗。
async function installGas(page, behaviour = {}) {
  // 正式頁面的 UPLOAD_GAS_URL 是 CHANGE_ME 佔位字（等 Liam 建立獨立上傳 Deployment 後填入），
  // 測試在頁面載入前注入測試端點，走與正式相同的 uploadGasUrl() 讀取路徑
  await page.addInitScript(() => {
    window.__UPLOAD_GAS_URL_OVERRIDE__ = 'https://script.google.com/macros/s/test-upload-deployment/exec';
  });
  // live 會隨成功的 commit／rollback 改變，模擬後端每次都重新讀取正式資料
  const state = { calls: [], committed: [], live: { kpi: { ...KPI_LIVE }, award: { ...AWARD_LIVE } } };
  return page.route(GAS_PATTERN, async route => {
    const payload = JSON.parse(route.request().postData() || '{}');
    state.calls.push(payload);
    const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });

    // 後端權限（情境 14）
    if (payload.adminSecret !== SECRET || payload.employeeId !== GOOD_EMP) {
      return json({ status: 'error', message: '此員編未被授權使用戰報快速更新', code: 403 });
    }

    const kind = payload.kind;
    const mode = behaviour[kind] || 'success';

    if (payload.action === 'report_upload_log') {
      return json({ status: 'ok', entries: behaviour.entries || [], live: state.live });
    }

    if (payload.action === 'report_upload_preview') {
      if (mode === 'badfile') {
        return json({ status: 'ok', ok: false, kind, live: KPI_LIVE,
          checks: [ok('block', '副檔名', '需要 .xlsx 檔，收到：wrong.txt')] });
      }
      if (mode === 'missingfield') {
        return json({ status: 'ok', ok: false, kind, live: KPI_LIVE,
          checks: [ok('ok', '副檔名', 'a.xlsx'), ok('block', '必要欄位', '店點表缺少欄位：5G銷售數')] });
      }
      if (mode === 'olddate') {
        return json({ status: 'ok', ok: false, kind, live: KPI_LIVE,
          fileName: payload.fileName, uploadedAt: '2026-08-01T09:15:00+08:00', dataDate: '2026-07-28',
          checks: [ok('ok', '副檔名', 'a.xlsx'), ok('block', '是否早於正式版本', '上傳資料 2026-07-28 比正式版本 2026-07-30 舊，拒絕覆蓋')] });
      }
      if (mode === 'wrongregion') {
        return json({ status: 'ok', ok: false, kind, live: KPI_LIVE,
          checks: [ok('ok', '副檔名', 'a.xlsx'), ok('block', '區域或店點', '店名完全對不到北一二B 門市清單')] });
      }
      if (mode === 'parsefail') {
        return json({ status: 'ok', ok: false, kind, live: KPI_LIVE,
          checks: [ok('ok', '副檔名', 'a.xlsx'), ok('block', '檔案解析', '找不到「上線數KPI_店點達成率_明細」工作表')] });
      }
      const preview = kind === 'kpi'
        ? { period: '2026/07/01 ~ 07/31', snapshotDay: 31, storeCount: 9, personCount: 62,
            stores: [{ code: 'DNB01', name: '通化', official: 1.0234 }], persons: [{ store: 'DNB01', pname: '王O明' }] }
        : { reportDate: '2026-07-31', storeCount: 9, stores: [{ name: '通化', bonus: 12000 }] };
      const conflict = mode === 'conflict';
      return json({ status: 'ok', ok: true, kind, token: 'tok-' + kind,
        checks: [ok('ok', '副檔名', 'a'), ok('ok', '資料筆數', '店點 9 家')].concat(
          conflict ? [ok('warn', '版本衝突檢查', '同日期已由 manual-upload 於 10:55 更新（可勾選強制覆寫）')] : []),
        preview, live: kind === 'kpi' ? KPI_LIVE : AWARD_LIVE, dataDate: '2026-07-31',
        fileName: payload.fileName, uploadedAt: '2026-08-01T09:15:00+08:00',
        newerThanLive: true, needsForce: conflict, warnings: conflict ? 1 : 0 });
    }

    if (payload.action === 'report_upload_commit') {
      const which = payload.token === 'tok-kpi' ? 'kpi' : 'award';
      const m = behaviour[which] || 'success';
      if (m === 'conflict' && !payload.force) {
        return json({ status: 'ok', result: 'blocked', kind: which, logId: '', needsForce: true,
          message: '同日期 2026-07-31 已由 manual-upload 於 10:55 更新，排程不覆蓋手動上傳的資料',
          backupFile: '', live: state.live[which],
          stages: [stage('version', '版本衝突檢查', 'fail', '同日期已由 manual-upload 更新'),
                   stage('json', 'JSON／API', 'skip', '未執行，正式資料維持上一版')] });
      }
      if (m === 'sheetfail' || m === 'drivefail' || m === 'jsonfail' || m === 'verifyfail') {
        const map = {
          drivefail: [stage('raw_backup', '原始檔備份', 'fail', 'Drive 寫入失敗'), stage('json', 'JSON／API', 'skip', '前一階段失敗，正式資料維持上一版'), stage('site', '網站', 'kept', '維持上一版')],
          sheetfail: [stage('raw_backup', '原始檔備份', 'ok', ''), stage('sheet', 'Google Sheet', 'fail', '試算表寫入失敗'), stage('json', 'JSON／API', 'skip', '未執行'), stage('site', '網站', 'kept', '維持上一版')],
          jsonfail: [stage('raw_backup', '原始檔備份', 'ok', ''), stage('backup_current', '備份目前正式資料', 'ok', 'backup.json'), stage('json', 'JSON／API', 'fail', '寫入 JSON 失敗'), stage('site', '網站', 'kept', '維持上一版')],
          verifyfail: [stage('raw_backup', '原始檔備份', 'ok', ''), stage('json', 'JSON／API', 'ok', ''), stage('verify', '網站讀取確認', 'fail', '讀回失敗（已自動還原上一版）'), stage('site', '網站', 'kept', '維持上一版')],
        };
        return json({ status: 'ok', result: 'error', kind: which, logId: 'log-fail', stages: map[m], message: '更新失敗', backupFile: 'backup.json', live: state.live[which] });
      }
      state.committed.push(which);
      state.live[which] = { dataDate: '2026-07-31', label: '2026-07-31', updatedAt: '2026-07-31T12:00:00+08:00' };
      return json({ status: 'ok', result: 'ok', kind: which, logId: 'log-' + which, backupFile: 'backup-' + which + '.json',
        stages: [
          stage('raw_backup', '原始檔備份', 'ok', 'raw.xlsx'),
          stage('sheet', 'Google Sheet', 'skip', '未使用既有試算表'),
          stage('backup_current', '備份目前正式資料', 'ok', 'backup.json'),
          stage('json', 'JSON／API', 'ok', 'latest.json'),
          stage('verify', '網站讀取確認', 'ok', '2026-07-31'),
          stage('site', which === 'kpi' ? 'KPI 網站' : '台獎網站', 'ok', '已指向新資料'),
          stage('ops', '智慧營運中心', which === 'kpi' ? 'kept' : 'ok', ''),
          stage('log', '更新紀錄', 'ok', 'log-' + which),
        ],
        live: state.live[which] });
    }

    if (payload.action === 'report_upload_rollback') {
      if (behaviour.rollback === 'fail') return json({ status: 'error', message: '找不到可回復的備份檔' });
      state.live[kind] = { dataDate: '2026-07-30', label: '2026/07/01 ~ 07/30（第 30 天）', updatedAt: '2026-07-30T11:51:00+08:00' };
      return json({ status: 'ok', restored: 'north12b-kpicalc-backup-20260730-115100.json', kind, live: state.live[kind] });
    }
    return json({ status: 'error', message: 'unknown action' });
  }).then(() => state);
}

async function login(page, emp = GOOD_EMP, secret = SECRET) {
  await page.goto(PAGE_URL);
  await page.fill('#authEmp', emp);
  await page.fill('#authSecret', secret);
  await page.click('#authBtn');
}

async function pickFile(page, kind, name = 'test.xlsx') {
  await page.setInputFiles('#file-' + kind, { name, mimeType: 'application/octet-stream', buffer: Buffer.from('dummy-content') });
}

async function previewAndCommit(page, kind) {
  await pickFile(page, kind);
  await page.click('#btn-check-' + kind);
  await expect(page.locator('#confirm-' + kind)).toBeVisible();
  await page.click(`#confirm-${kind} .btn.go`);
}

// ── 情境 14：未授權帳號 ────────────────────────────────────
test('情境14：未授權員編無法進入上傳畫面', async ({ page }) => {
  await installGas(page);
  await login(page, BAD_EMP);
  await expect(page.locator('#authMsg')).toContainText('未被授權');
  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('#authCard')).toBeVisible();
});

test('情境14b：管理者密碼錯誤同樣被拒', async ({ page }) => {
  await installGas(page);
  await login(page, GOOD_EMP, 'wrong-secret');
  await expect(page.locator('#authMsg')).toContainText('未被授權');
  await expect(page.locator('#app')).toBeHidden();
});

test('授權成功後才顯示兩個上傳車道與目前正式版本', async ({ page }) => {
  await installGas(page);
  await login(page);
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#live-kpi')).toContainText('2026/07/01 ~ 07/30');
  await expect(page.locator('#live-award')).toContainText('2026-07-30');
});

// ── 情境 1／2：正確檔案更新成功 ────────────────────────────
test('情境1：正確 KPI 檔案更新成功並顯示分項結果', async ({ page }) => {
  await installGas(page);
  await login(page);
  await pickFile(page, 'kpi');
  await page.click('#btn-check-kpi');
  await expect(page.locator('#msg-kpi')).toContainText('檢查全部通過');
  await expect(page.locator('#preview-kpi')).toContainText('通化');
  await expect(page.locator('#preview-kpi')).toContainText('102.34%');
  await page.click('#confirm-kpi .btn.go');
  await expect(page.locator('#msg-kpi')).toContainText('更新完成');
  await expect(page.locator('#result-kpi')).toContainText('原始檔備份');
  await expect(page.locator('#result-kpi .pill.ok').first()).toContainText('成功');
  await expect(page.locator('#result-kpi')).toContainText('維持上一版');  // KPI 不動戰情快照
  await expect(page.locator('#live-kpi')).toContainText('2026-07-31');
});

test('情境2：正確台獎檔案更新成功', async ({ page }) => {
  await installGas(page);
  await login(page);
  await pickFile(page, 'award', 'awards.json');
  await page.click('#btn-check-award');
  await expect(page.locator('#preview-award')).toContainText('2026-07-31');
  await page.click('#confirm-award .btn.go');
  await expect(page.locator('#msg-award')).toContainText('更新完成');
  await expect(page.locator('#result-award')).toContainText('智慧營運中心');
});

// ── 情境 3／4：一邊成功、一邊失敗，互不影響 ────────────────
test('情境3：KPI 成功、台獎失敗，兩者互不影響', async ({ page }) => {
  await installGas(page, { award: 'jsonfail' });
  await login(page);
  await previewAndCommit(page, 'kpi');
  await expect(page.locator('#msg-kpi')).toContainText('更新完成');
  await pickFile(page, 'award', 'awards.json');
  await page.click('#btn-check-award');
  await expect(page.locator('#confirm-award')).toBeVisible();
  await page.click('#confirm-award .btn.go');
  await expect(page.locator('#msg-award')).toContainText('更新失敗');
  await expect(page.locator('#result-award')).toContainText('維持上一版');
  // KPI 的成功結果沒有被台獎的失敗影響
  await expect(page.locator('#msg-kpi')).toContainText('更新完成');
});

test('情境4：台獎成功、KPI 失敗，兩者互不影響', async ({ page }) => {
  await installGas(page, { kpi: 'jsonfail' });
  await login(page);
  await previewAndCommit(page, 'award');
  await expect(page.locator('#msg-award')).toContainText('更新完成');
  await previewAndCommit(page, 'kpi');
  await expect(page.locator('#msg-kpi')).toContainText('更新失敗');
  await expect(page.locator('#msg-award')).toContainText('更新完成');
});

// ── 情境 5～9：驗證擋下，正式資料不被覆蓋 ──────────────────
const blockCases = [
  ['情境5：上傳錯誤檔案', 'badfile', '副檔名'],
  ['情境6：缺少必要欄位', 'missingfield', '必要欄位'],
  ['情境7：上傳舊日期', 'olddate', '比正式版本'],
  ['情境8：上傳錯區域資料', 'wrongregion', '對不到北一二B'],
  ['情境9：檔案解析失敗', 'parsefail', '找不到'],
];
for (const [title, mode, expected] of blockCases) {
  test(`${title}：擋在預覽階段，不出現確認鍵`, async ({ page }) => {
    await installGas(page, { kpi: mode });
    await login(page);
    await pickFile(page, 'kpi');
    await page.click('#btn-check-kpi');
    await expect(page.locator('#msg-kpi')).toContainText('正式資料未更動');
    await expect(page.locator('#checks-kpi')).toContainText(expected);
    await expect(page.locator('#checks-kpi li.block')).toBeVisible();
    await expect(page.locator('#confirm-kpi')).toBeHidden();   // 不可能誤按更新
    await expect(page.locator('#live-kpi')).toContainText('2026-07-30');  // 正式版本沒變
  });
}

// ── 情境 10～13：各階段失敗時顯示失敗階段且不留半套 ────────
const stageCases = [
  ['情境10：Google Sheet 寫入失敗', 'sheetfail', 'Google Sheet'],
  ['情境11：Drive 備份失敗', 'drivefail', '原始檔備份'],
  ['情境12：JSON 更新失敗', 'jsonfail', 'JSON／API'],
  ['情境13：網站讀取失敗', 'verifyfail', '網站讀取確認'],
];
for (const [title, mode, label] of stageCases) {
  test(`${title}：標出失敗階段，其餘維持上一版`, async ({ page }) => {
    await installGas(page, { kpi: mode });
    await login(page);
    await previewAndCommit(page, 'kpi');
    await expect(page.locator('#msg-kpi')).toContainText('更新失敗');
    const failing = page.locator('#result-kpi li', { hasText: label }).first();
    await expect(failing.locator('.pill')).toContainText('失敗');
    await expect(page.locator('#result-kpi')).toContainText('維持上一版');
    await expect(page.locator('#result-kpi')).toContainText('backup.json');
  });
}

// ── 情境 15：回復上一個成功版本 ────────────────────────────
test('情境15：可回復上一個成功版本', async ({ page }) => {
  await installGas(page);
  await login(page);
  page.on('dialog', d => d.accept());
  await page.click('#lane-kpi .btn.warn');
  await expect(page.locator('#msg-kpi')).toContainText('已回復自備份');
  await expect(page.locator('#live-kpi')).toContainText('第 30 天');
});

test('情境15b：沒有備份時回復失敗且有明確訊息', async ({ page }) => {
  await installGas(page, { rollback: 'fail' });
  await login(page);
  page.on('dialog', d => d.accept());
  await page.click('#lane-kpi .btn.warn');
  await expect(page.locator('#msg-kpi')).toContainText('找不到可回復的備份檔');
});

// ── 其他保護行為 ───────────────────────────────────────────
test('取消預覽後無法再送出更新', async ({ page }) => {
  await installGas(page);
  await login(page);
  await pickFile(page, 'kpi');
  await page.click('#btn-check-kpi');
  await page.click('#confirm-kpi .btn:not(.go)');
  await expect(page.locator('#msg-kpi')).toContainText('正式資料未更動');
  await expect(page.locator('#confirm-kpi')).toBeHidden();
});

test('未選檔案時不會送出請求', async ({ page }) => {
  const state = await installGas(page);
  await login(page);
  const before = state.calls.length;
  await page.click('#btn-check-kpi');
  await expect(page.locator('#msg-kpi')).toContainText('請先選擇檔案');
  expect(state.calls.length).toBe(before);
});

test('最近更新紀錄顯示帳號、檔名、資料日期與結果', async ({ page }) => {
  await installGas(page, { entries: [
    { acted_at: '2026-07-31T12:00:00+08:00', kind: 'kpi', employee_id: GOOD_EMP, file_name: '0731.xlsx', data_date: '2026-07-31', result: 'success' },
  ] });
  await login(page);
  await expect(page.locator('#logBox')).toContainText('0731.xlsx');
  await expect(page.locator('#logBox')).toContainText(GOOD_EMP);
  await expect(page.locator('#logBox')).toContainText('success');
});

test('檔名中的 HTML 會被轉義，不會注入頁面', async ({ page }) => {
  await installGas(page, { entries: [
    { acted_at: 'x', kind: 'kpi', employee_id: GOOD_EMP, file_name: '<img src=x onerror=alert(1)>', data_date: '', result: 'success' },
  ] });
  await login(page);
  await expect(page.locator('#logBox')).toContainText('<img src=x onerror=alert(1)>');
  expect(await page.locator('#logBox img').count()).toBe(0);
});

test('登入資訊不寫入 localStorage／sessionStorage', async ({ page }) => {
  await installGas(page);
  await login(page);
  await expect(page.locator('#app')).toBeVisible();
  const stored = await page.evaluate(() => JSON.stringify({
    local: Object.entries(localStorage), session: Object.entries(sessionStorage),
  }));
  expect(stored).not.toContain(SECRET);
  expect(stored).not.toContain(GOOD_EMP);
});

// ── 防衝突：版本判定與強制覆寫 ─────────────────────────────
test('版本衝突時擋在 commit，正式資料維持上一版', async ({ page }) => {
  await installGas(page, { kpi: 'conflict' });
  await login(page);
  await pickFile(page, 'kpi');
  await page.click('#btn-check-kpi');
  await expect(page.locator('#checks-kpi')).toContainText('版本衝突檢查');
  await expect(page.locator('#force-kpi')).toBeVisible();
  await page.click('#confirm-kpi .btn.go');
  await expect(page.locator('#msg-kpi')).toContainText('版本衝突，正式資料未更動');
  await expect(page.locator('#result-kpi')).toContainText('維持上一版');
  await expect(page.locator('#live-kpi')).toContainText('2026-07-30');
});

test('勾選強制覆寫後可完成更新', async ({ page }) => {
  await installGas(page, { kpi: 'conflict' });
  await login(page);
  await pickFile(page, 'kpi');
  await page.click('#btn-check-kpi');
  await page.click('#confirm-kpi .btn.go');
  await expect(page.locator('#msg-kpi')).toContainText('版本衝突');
  await page.check('#forcechk-kpi');
  await page.click('#confirm-kpi .btn.go');
  await expect(page.locator('#msg-kpi')).toContainText('更新完成');
  await expect(page.locator('#live-kpi')).toContainText('2026-07-31');
});

test('沒有衝突時不顯示強制覆寫選項', async ({ page }) => {
  await installGas(page);
  await login(page);
  await pickFile(page, 'kpi');
  await page.click('#btn-check-kpi');
  await expect(page.locator('#confirm-kpi')).toBeVisible();
  await expect(page.locator('#force-kpi')).toBeHidden();
});

test('強制覆寫勾選狀態不會殘留到下一次預覽', async ({ page }) => {
  await installGas(page, { kpi: 'conflict' });
  await login(page);
  await pickFile(page, 'kpi');
  await page.click('#btn-check-kpi');
  await page.check('#forcechk-kpi');
  await page.click('#btn-check-kpi');
  await expect(page.locator('#forcechk-kpi')).not.toBeChecked();
});

// ── 功能定位標示 ───────────────────────────────────────────
test('頁面明確標示為測試版且未宣稱已完成 Excel 上傳', async ({ page }) => {
  await installGas(page);
  await page.goto(PAGE_URL);
  await expect(page.locator('.badge-test')).toContainText('測試版');
  await expect(page.locator('.banner')).toContainText('Excel 上傳');
  await expect(page.locator('.banner')).toContainText('寫入／發佈端尚未在正式環境驗證過');
  await expect(page.locator('#lane-award')).toContainText('不收 Excel');
});

// ── 預覽日期四項顯示 ───────────────────────────────────────
test('預覽同時顯示檔名、資料日期、上傳時間與是否晚於正式版本', async ({ page }) => {
  await installGas(page);
  await login(page);
  await pickFile(page, 'kpi', '0730.xlsx');
  await page.click('#btn-check-kpi');
  const box = page.locator('#dates-kpi');
  await expect(box).toContainText('原始檔名');
  await expect(box).toContainText('0730.xlsx');
  await expect(box).toContainText('報表資料日期');
  await expect(box).toContainText('2026-07-31');
  await expect(box).toContainText('上傳時間');
  await expect(box).toContainText('2026-08-01T09:15:00+08:00');
  await expect(box).toContainText('晚於目前正式版本');
  // 說明文字避免使用者以為日期讀錯
  await expect(box).toContainText('報表產出日');
  await expect(box).toContainText('統計截止日');
});

test('資料日期較舊時，日期面板明確標示早於正式版本', async ({ page }) => {
  await installGas(page, { kpi: 'olddate' });
  await login(page);
  await pickFile(page, 'kpi', '0728.xlsx');
  await page.click('#btn-check-kpi');
  await expect(page.locator('#dates-kpi')).toContainText('0728.xlsx');
  await expect(page.locator('#dates-kpi')).toContainText('早於目前正式版本');
  await expect(page.locator('#confirm-kpi')).toBeHidden();
});

test('取消預覽會一併清掉日期面板', async ({ page }) => {
  await installGas(page);
  await login(page);
  await pickFile(page, 'kpi', '0730.xlsx');
  await page.click('#btn-check-kpi');
  await expect(page.locator('#dates-kpi')).toContainText('原始檔名');
  await page.click('#confirm-kpi .btn:not(.go)');
  await expect(page.locator('#dates-kpi')).toBeEmpty();
});

// ── 部署隔離：未設定上傳 Deployment 時的守門 ────────────────
test('UPLOAD_GAS_URL 仍是佔位字時，登入被擋下且不發出任何請求', async ({ page }) => {
  // 刻意不裝 installGas（不注入測試端點）——頁面走正式的 CHANGE_ME 佔位字
  let requests = 0;
  await page.route('https://script.google.com/**', route => { requests += 1; return route.abort(); });
  await page.goto(PAGE_URL);
  await page.fill('#authEmp', GOOD_EMP);
  await page.fill('#authSecret', SECRET);
  await page.click('#authBtn');
  await expect(page.locator('#authMsg')).toContainText('尚未設定上傳 Deployment');
  await expect(page.locator('#app')).toBeHidden();
  expect(requests).toBe(0);
});

test('登入卡片明示本頁走獨立上傳 Deployment', async ({ page }) => {
  await page.goto(PAGE_URL);
  await expect(page.locator('#authCard')).toContainText('獨立上傳 Deployment');
  await expect(page.locator('#authCard')).toContainText('第 15 版');
});
