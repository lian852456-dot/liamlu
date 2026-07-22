# VALIDATION_REPORT — GAS savedAt 日期顯示修正

- 分支：`claude/gas-savedat-date-fix-qakgt8`
- 基準 commit：`6a97202`（＝ `origin/main`）
- 日期：2026-07-22
- 作者：Claude（claude-fable-5 session）
- 狀態：**已在分支完成程式修正與本機測試；尚未部署至正式 Apps Script Web App，正式驗收尚未進行。**

> ⚠️ 重要：本報告不代表正式網站已修復。GAS 程式碼的變更**必須在 Apps Script 編輯器建立「新版本」部署後才會生效**（見 CLAUDE.md 踩過的坑 #3）。在正式部署＋驗收完成前，不得對外宣稱正式站已修好。

---

## 1. 目前進度

- 本次工作區為**重新 clone 的乾淨環境**：先前 session 描述「本機已改好 savedAt」的變更並不存在於此（未 commit/push 而遺失）。工作樹在開工前為 clean，分支 HEAD＝main。
- 依此重新、以最小改動重做 savedAt 日期修正，僅動 `gas/Code.gs` 的 `readData()` 一處。
- 新增可重跑的 GAS 日期回歸測試（node，載入真實 `Code.gs`）。
- 完整 Playwright 已跑，結果與改動前基準一致（無回歸）。

## 2. 已完成項目

| 項目 | 檔案 | 說明 |
|---|---|---|
| A. savedAt 日期修正 | `gas/Code.gs` | `readData()` 對 `savedAt` 欄改用 `getDataRange().getDisplayValues()` 的原始顯示字串（如 `16:00:00`），不再讓 1899-12-30 基準的純時間 Date 走 `toDateStr()` 被格式化成 `1899-12-30`。其餘欄位邏輯不變。 |
| 回歸測試 | `tests/gas-date-regression.js` | vm 沙箱載入真實 `Code.gs`，注入 `SpreadsheetApp`/`Utilities` stub，直呼 `readData('2026-07-20', 16)`，斷言 `savedAt === '16:00:00'` 且不含 `1899`，`date` 仍為 `2026-07-20`。 |
| 交接文件 | `VALIDATION_REPORT.md`、`docs/COLLAB-LOG.md` | 本報告＋協作日誌一則。 |

### 本次修正的 diff 摘要（`gas/Code.gs` `readData()`）
- 新增 `const displayData = range.getDisplayValues();`
- 新增 `const savedAtIdx = headers.indexOf('savedAt');`
- 欄位組裝時：`if (idx === savedAtIdx) obj[h] = displayData[i][idx];`，其餘維持 `(v instanceof Date) ? toDateStr(v) : v`。

## 3. 測試結果

- **GAS 日期回歸測試**：`node tests/gas-date-regression.js` → **3/3 passed**
  - readData 對 2026-07-20 seg=16 讀得回門市
  - savedAt 回傳原始顯示時間 `16:00:00`，不含 `1899-12-30`
  - date 欄仍正常轉為 `2026-07-20`
- **完整 Playwright**：`npm test` → **40 passed / 2 failed**
  - 2 個失敗皆為**既有失敗**（改動前的乾淨 main 上就失敗），與 savedAt/日期無關：
    - `patrol.spec.js:311` 加密頁籤：每月班表可切換日週月檢視
    - `patrol.spec.js:336` 加密頁籤：半月督導檢查可回填缺失與改善說明（匯出 Excel 檔名）
  - 本次修正未觸及 `patrol.html`／`index.html`，前後失敗數與項目完全相同 → **零回歸**。
- **全碼搜尋**（savedAt 解析為 Date／套時區／產生 1899）：
  - 每日回報顯示路徑只有 `readData()` 一處會踩到，已修。
  - `readPersonal()` 不回傳 savedAt（只取 date/seg/store/name/record），無此問題。
  - 其餘 savedAt 引用（`Code.gs` 361/405/571 行）都在**巡店**路徑（不同工作表、寫入端去重），非本次每日回報顯示範圍，未動。
  - 前端 `index.html` 的 savedAt 只有寫入（`toLocaleTimeString`，2832/4085 行）與直接顯示（`d.savedAt||''`，2875 行），**不解析日期／時區**，符合「前端不再自行解析」。

## 4. 已知問題

- Playwright 2 個 patrol 既有失敗**未修**（超出本次範圍，屬他人功能區；不擴大重構）。
- 本環境 proxy **封鎖 `script.google.com`（403）**，無法從此容器 curl/fetch 或直接部署／驗證 GAS。
- 正式站是否已受影響、以及部署後是否真的解決，**必須由有 Apps Script 編輯權限者實際部署＋在瀏覽器驗收**後才能確認。

## 5. 部署前條件（尚缺）

repo 內**沒有** `.clasp.json`、`appsscript.json`、Apps Script 專案 Script ID／部署 ID，也沒有自動部署 GAS 的腳本（`.claude/scripts/auto-push.sh` 只推 git，不推 GAS）。因此無法自動化部署，仍缺：

1. **Apps Script 專案編輯權限**：擁有該綁定專案編輯權的 Google 帳號（憑證不在 repo）。
2. **專案識別資訊**：Script ID／部署 ID 未存在 repo；若要改用 clasp，需擁有者提供 Script ID 並完成 `clasp login` OAuth 授權。
3. **可連外環境**：本容器 proxy 擋 `script.google.com`，需在能連的環境（或直接用 Apps Script 網頁編輯器）操作。
4. **手動建立新版本部署**：貼上新 `Code.gs` 後，須「部署 → 管理部署作業 → ✏️ 編輯 → 版本選『新版本』→ 部署」，否則線上仍跑舊版。
5. **瀏覽器驗收**：部署後由人在瀏覽器開 `{GAS_URL}?action=...` 驗證（proxy 擋 curl）。

> 已部署的 Web App `/exec` 網址（`index.html:2085` `DEFAULT_GAS_URL`）是部署的**結果**，不是部署所需的憑證；`Code.gs` 的 `SPREADSHEET_ID` 是資料試算表 ID，也不是 Apps Script 專案 ID。

## 6. 正式驗收步驟（部署後由人執行）

前置：使用 **2026-07-20 16:00** 的歷史資料（正式站唯讀，共 **9 筆**）。

1. 確認新版已生效：瀏覽器開 `{GAS_URL}?action=debug`，若回 `unknown action` 代表舊版還在跑（未成功建立新版本部署）。
2. 開 `{GAS_URL}?action=read&date=2026-07-20&seg=16`，確認回傳 **9 筆**門市資料。
3. 逐筆檢查每筆的 `savedAt`：應為當時的**時間字串（如 `16:00:00`）**，**不得出現 `1899-12-30`**。
4. 開正式 App（index.html），回放 2026-07-20 16:00：9 筆資料皆可載入，彙整表格數字正確，回放／歷史功能正常。
5. 確認 `date`、彙整、回放功能均未受影響。

**驗收通過條件（全部須成立）：**
- [ ] 使用 2026-07-20 16:00 歷史資料
- [ ] 9 筆資料皆可回放
- [ ] savedAt 不顯示 1899-12-30（顯示正確時間）
- [ ] 日期、彙整與回放功能不受影響

## 7. 回復方案（Rollback）

- **Git**：本次修正單一 commit、只動 `readData()`。回復程式：`git revert <commit>` 或直接還原 `gas/Code.gs` 的 `readData()`。
- **GAS 線上**：Apps Script 編輯器「部署 → 管理部署作業 → 版本」可切回**前一個部署版本**，即時回退，不需改碼。
- 風險極低：改動僅影響 `readData()` 回傳的 `savedAt` 欄呈現，不改寫入邏輯、不動 Sheet 結構、不改欄位。

## 8. 變更紀錄（Changelog）

- 2026-07-22｜Claude｜`gas/Code.gs` `readData()`：savedAt 改用 `getDisplayValues()` 原始顯示字串，修正 savedAt 顯示 `1899-12-30`。
- 2026-07-22｜Claude｜新增 `tests/gas-date-regression.js`（node 回歸測試，3/3 passed）。
- 2026-07-22｜Claude｜新增本 `VALIDATION_REPORT.md` 與 `docs/COLLAB-LOG.md` 交接紀錄。

---

### 本次提交檔案清單
- `gas/Code.gs`（M）— savedAt 修正
- `tests/gas-date-regression.js`（新增）— 回歸測試
- `VALIDATION_REPORT.md`（新增）— 本報告
- `docs/COLLAB-LOG.md`（M）— 協作日誌一則

### 排除／未動的變更
- 無他人未完成變更（開工前工作樹為 clean，故無須排除）。
- Playwright 2 個 patrol 既有失敗：非本次範圍，未修。
- `index.html` / `patrol.html` / `kpi.html` / Sheet 結構：未動。
