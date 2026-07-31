# 戰報快速更新：檔案地圖與資料流

**建立日期**：2026-07-31　**作者**：Claude
（本檔同為補寫，原因見 `UPLOAD-QUICK-UPDATE-SPEC.md` §開頭）

---

## 1. 修改檔案清單

| 檔案 | 改動 | 風險 |
|---|---|---|
| `gas/Code.gs` | **只做兩件事**：①`doPost` 新增 4 個 `else if` 分支；②檔案**尾端追加**「戰報快速更新」整節。既有函式**一行都沒改**。 | 低。整檔函式完整性檢查已通過（見 §6）。 |
| `home.html` | 「督導專區」新增一張連結卡片。**未加入任何資料、登入或端點**。 | 極低。 |

## 2. 新增檔案清單

| 檔案 | 用途 |
|---|---|
| `report-upload.html` | 戰報快速更新頁面（單檔前端，與既有站點同風格） |
| `tests/report-upload-contract.test.cjs` | GAS 端契約＋驗證函式行為測試（29 項） |
| `tests/report-upload.spec.js` | 端到端驗收情境（Playwright，route 模擬 GAS，23 項） |
| `docs/UPLOAD-QUICK-UPDATE-SPEC.md` | 規格 |
| `docs/UPLOAD-QUICK-UPDATE-FILE-MAP.md` | 本檔 |

## 3. 資料流

### KPI

```
督導瀏覽器
  │ POST report_upload_preview {kind:'kpi', fileBase64}
  ▼
GAS reportUploadPreview()
  │ ① 私有 Drive 建 upload-tmp-<token>-<檔名>.xlsx
  │ ② kpiCalcParseReport(rawFile)   ◀── 與 11:00 自動化同一支，唯一一套解析器
  │ ③ reportUploadValidateKpi_()    ◀── 9 項驗證
  │ ④ 通過 → 私有 Drive 建 upload-staging-kpi-<token>.json
  ▼ 回傳 checks + preview + token（正式資料尚未更動）
督導確認
  │ POST report_upload_commit {token}
  ▼
GAS reportUploadCommit()
  │ 1 upload-tmp-… 改名為 kpi-raw-<時間>-<檔名>.xlsx      （原始檔備份）
  │ 2 Google Sheet → skip（KPI 正式資料不在既有試算表）
  │ 3 north12b-kpicalc-private-latest.json 複製為
  │     north12b-kpicalc-backup-<時間>.json               （備份上一版）
  │ 4 寫入 north12b-kpicalc-private-latest.json          （正式資料唯一被改寫處）
  │ 5 kpiCalcLatestDataFile() 讀回比對日期，不符 → 還原
  │ 6 智慧營運中心 → kept（KPI 不動戰情快照）
  │ 7 ReportUploadLog 分頁寫稽核列
  ▼
kpi.html（同仁登入 kpicalc_access 時讀到新資料）
```

### 台獎

同上，差別只在：解析改為 `JSON.parse` ＋ `awardsBattle` 結構檢查，
正式檔為 `north12b-dashboard-private-latest.json`，
消費端是 `index.html` 的 🏅台獎戰情／🏆KPI戰情頁籤（`private_access`）。

### 兩者的分界（為什麼狀態列會出現「維持上一版」）

| 正式檔 | 誰讀它 | KPI 上傳 | 台獎上傳 |
|---|---|---|---|
| `north12b-kpicalc-*.json` | kpi.html | ✅ 更新 | 維持上一版 |
| `north12b-dashboard-private-latest.json` | index.html 戰情頁籤 | 維持上一版 | ✅ 更新 |

**兩份快照互不覆蓋**，所以 KPI 上傳後「智慧營運中心」一定顯示「維持上一版」——這是正確行為，不是失敗。

## 4. 私有 Drive 檔名規則

| 檔名 | 生命週期 |
|---|---|
| `upload-tmp-<token>-<檔名>` | 預覽期間；驗證失敗即刪，commit 時改名保留 |
| `upload-staging-<kind>-<token>.json` | 預覽→commit 之間；commit 後刪除 |
| `kpi-raw-<時間>-<檔名>.xlsx`／`award-raw-…` | 永久（原始檔備份） |
| `backup-north12b-kpicalc-<時間>.json` | 永久（可回復） |
| `backup-north12b-dashboard-<時間>.json` | 永久（可回復） |
| `north12b-kpicalc-private-latest.json` | 正式資料 |
| `north12b-dashboard-private-latest.json` | 正式資料 |

⚠️ **備份檔名為什麼是 `backup-` 開頭而不是 `north12b-kpicalc-backup-`**：
`kpiCalcLatestDataFile()` 會取私有資料夾中**最後更新最新**的 `north12b-kpicalc-*.json`。
若備份檔也符合這個樣式，那麼當「備份成功、但寫入正式檔失敗」時，
備份檔會成為資料夾中最新的一份，**被 kpi.html 當成正式資料讀取**。
因此備份一律以 `backup-` 開頭，落在該搜尋範圍之外。
`tests/report-upload-contract.test.cjs` 有一條測試專門守住這件事，改名前請先看它。

## 5. GAS 端點

| action | 函式 | 說明 |
|---|---|---|
| `report_upload_preview` | `reportUploadPreview` | 檢查＋預覽，不動正式資料 |
| `report_upload_commit` | `reportUploadCommit` | 分階段更新，回傳分項狀態 |
| `report_upload_log` | `reportUploadLog` | 最近紀錄＋兩邊目前正式版本 |
| `report_upload_rollback` | `reportUploadRollback` | 回復上一個成功版本 |

四者皆為 **POST**，皆先過 `reportUploadAuthorize_()`。

## 6. 部署前檢查（CLAUDE.md 鐵則）

貼 `gas/Code.gs` 進 GAS 前必跑，全部要是 1：

```bash
git fetch origin && git checkout main && git pull
for f in kpiCalcAutoUpdate testKpiCalcAutoUpdate setupKpiCalcAutoUpdate \
         kpiCalcWatchdog setupKpiCalcWatchdog kpiCalcSetupSelf \
         kpiCalcAccess kpiCalcPublish kpiCalcLatestDataFile \
         checkSegAndNotify checkAwareAndNotify sendWeeklyPatrolReport \
         kpiCalcParseReport reportUploadPreview reportUploadCommit \
         reportUploadLog reportUploadRollback reportUploadAuthorize_; do
  printf "%-26s %s\n" "$f" "$(grep -c "function $f" gas/Code.gs)"
done
grep -c "action === 'ptread'\|action === 'hread'\|half_media_upload" gas/Code.gs  # 要 3
```

**本次改了 `doPost`，所以必須「部署 → 管理部署作業 → ✏️ → 新版本 → 部署」**，
只存檔不部署，網站會拿到 `unknown private dashboard action`。

## 7. 首次啟用步驟（只有 Liam 能做）

1. `git pull` 取最新 `gas/Code.gs`，跑上面的檢查清單。
2. 貼進 GAS 編輯器存檔。
3. 確認左側「服務」已有 **Drive API**（`kpiCalcParseReport` 需要；缺了會報 `Drive is not defined`）。
4. 專案設定 → 指令碼屬性新增 `REPORT_UPLOAD_ALLOWED_EMPLOYEES = <你的員編>`
   （逗號分隔可多人；不設就只有 `DASHBOARD_TRUSTED_EMPLOYEE_ID` 能用）。
5. 部署 → 管理部署作業 → ✏️ → **新版本** → 部署。
6. 開 `report-upload.html`，用員編＋管理者密碼登入，先只做「① 檔案檢查與預覽」確認驗證正常，
   **確認預覽數字正確後**再按「② 確認更新」。
7. 第一次成功後，確認私有資料夾出現 `north12b-kpicalc-backup-<時間>.json`（回復用）。

## 8. 回復方式

- **畫面上**：對應車道按「↩ 回復上一個成功版本」（會取該類型最新的 `*-backup-*.json`）。
- **手動**：私有 Drive 把要的 `north12b-kpicalc-backup-<時間>.json` 內容複製回
  `north12b-kpicalc-private-latest.json`。
- **回復也會寫進 `ReportUploadLog`**（`result = rollback`）。
