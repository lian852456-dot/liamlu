# 戰報快速更新：檔案地圖、同步盤點與備份說明

**修訂** 2026-07-31 第二輪（需求校正）　**分支** `claude/quick-report-upload-feature-elyajz`

> 本檔所有「已串接」都附程式碼證據。**沒有證據的一律標記「未確認」**，不寫成已同步。

---

## 1. 修改／新增檔案

| 檔案 | 狀態 | 改動 |
|---|---|---|
| `gas/Code.gs` | 修改 | `doPost` 加 4 個分支；尾端追加「戰報快速更新」與「資料版本狀態與防衝突」兩節；`kpiCalcAutoUpdate` 加防衝突把關；`kpiCalcPublish`／`privateDashboardPublish` 加版本登記（不擋） |
| `home.html` | 修改 | 督導專區卡片，**已標示 🧪 測試版** |
| `report-upload.html` | 新增 | 上傳頁（**已標示測試版＋能力聲明橫幅**） |
| `tests/report-upload-contract.test.cjs` | 新增 | 46 項契約＋行為測試 |
| `tests/report-upload.spec.js` | 新增 | 28 項端到端情境 |
| `docs/UPLOAD-QUICK-UPDATE-SPEC.md` | 新增 | 規格 |
| `docs/UPLOAD-QUICK-UPDATE-FILE-MAP.md` | 新增 | 本檔 |
| `docs/UPLOAD-QUICK-UPDATE-HANDOVER.md` | 新增 | 小榮交接 |

**未改動**：`index.html`、`kpi.html`、`kpitry.html`、`patrol.html`、`patrol-guide.html`。

## 2. 同步對象盤點（Liam 要求五）

> 「更新方式」欄的「快速更新」＝本次新增的 `report_upload_commit` 流程。

### 2.1 KPI Google Sheet

| 項目 | 內容 |
|---|---|
| 現有資料來源 | **不存在**。KPI 正式資料是私有 Drive 的 `north12b-kpicalc-private-latest.json`，不是試算表 |
| 更新方式 | 不適用 |
| 使用函式 | — |
| 相關檔案 | — |
| 是否已串接 | **否（不適用）**。快速更新的「Google Sheet」階段固定回報 `未執行` |
| 需重新部署 | 否 |
| 多久看到 | — |
| 失敗保留上一版 | — |

### 2.2 台獎 Google Sheet

| 項目 | 內容 |
|---|---|
| 現有資料來源 | **未確認**。repo 內唯一與台獎相關的試算表是「北一二B每日回報」的 `tw_*` 欄位（`gas/Code.gs:17-19`），但那是**門市同仁手key的每日回報**，與台獎戰情獎金資料是兩份不同的東西 |
| 更新方式 | 每日回報：index.html 表單 → `write` API。台獎戰情：不經試算表 |
| 使用函式 | `writeData()`（每日回報用） |
| 相關檔案 | `index.html`、`gas/Code.gs` |
| 是否已串接 | **否**。快速更新完全沒有碰這張試算表 |
| 需重新部署 | 否 |
| 多久看到 | — |
| 失敗保留上一版 | — |

### 2.3 KPI 網站（kpi.html）

| 項目 | 內容 |
|---|---|
| 現有資料來源 | `north12b-kpicalc-*.json`（私有 Drive） |
| 更新方式 | 快速更新 KPI 車道 ✅ |
| 使用函式 | `kpiCalcAccess()` → `kpiCalcLatestDataFile()` |
| 相關檔案 | `kpi.html:251`、`gas/Code.gs:1564,1584` |
| 是否已串接 | **是**（程式碼證據明確；**但端到端未用真實檔驗證**） |
| 需重新部署 | GAS 要（改了 `doPost`）；kpi.html 不用 |
| 多久看到 | 同仁**重新登入**後即時 |
| 失敗保留上一版 | 是 |

### 2.4 台獎網站（index.html 🏅台獎戰情頁籤）

| 項目 | 內容 |
|---|---|
| 現有資料來源 | `north12b-dashboard-private-latest.json` 的 `awardsBattle` |
| 更新方式 | 快速更新台獎車道 ✅ |
| 使用函式 | `privateDashboardAccess()` → `privateDashboardSnapshot()` |
| 相關檔案 | `index.html:2494`、`gas/Code.gs:1450,1466` |
| 是否已串接 | **是** |
| 需重新部署 | GAS 要；index.html 不用 |
| 多久看到 | 重新登入後即時 |
| 失敗保留上一版 | 是 |

### 2.5 北一二B智慧營運中心（home.html）

| 項目 | 內容 |
|---|---|
| 現有資料來源 | **無**。純靜態導覽頁，`grep -c 'script.google.com' home.html` = **0** |
| 更新方式 | 不適用 |
| 是否已串接 | **否（不適用）**。CLAUDE.md 明文禁止在此頁放資料或登入 |
| 需重新部署 | GitHub Pages（僅因新增卡片連結） |
| 多久看到 | Pages 部署後 |
| 失敗保留上一版 | — |

> ⚠️ 快速更新畫面上顯示的「智慧營運中心」狀態，指的是 **index.html 的戰情頁籤**（2.4），
> 不是 home.html。KPI 車道該欄一定顯示「維持上一版」，因為 KPI 與台獎是兩份不同快照。

### 2.6 Liam AI 指揮室

| 項目 | 內容 |
|---|---|
| 現有資料來源 | **未確認 —— 此頁在 repo 中不存在** |
| 說明 | 全 repo 找不到「指揮室」字樣。最接近的是 `home.html`「北一二B 智慧營運中心」。**需 Liam 澄清是指 home.html、還是另一個尚未建立的頁面。** |
| 是否已串接 | **未確認** |

### 2.7 其他讀取 KPI 或台獎資料的頁面

實測 `grep` 全部 html（證據見下表）：

| 頁面 | `kpicalc_access` | `private_access` | 結論 |
|---|---|---|---|
| `index.html` | 0 | 1 | 讀台獎／KPI戰情快照 ✅ |
| `kpi.html` | 1 | 0 | 讀 KPI 試算資料 ✅ |
| `kpitry.html` | 0 | 0 | 公開試算，**無資料來源**，不受影響 |
| `home.html` | 0 | 0 | 純導覽，不受影響 |
| `patrol.html` | 0 | 0 | 巡店資料，與 KPI／台獎無關 |
| `patrol-guide.html` | 0 | 0 | 已過時的手冊 |

⚠️ **一個未確認項**：`index.html:2650,2774` 有
`window.__KPI_BATTLE_DATA__` / `window.__AWARDS_BATTLE_DATA__` 本機回退路徑，
來源疑似 `private-config.js`（已 `.gitignore`）。
**無法從 repo 確認正式環境是否啟用此回退**。若啟用，快速更新可能不會反映在該路徑上。
→ **請 Liam 或小榮在正式環境確認。**

### 2.8 JSON 檔

| 檔案 | 消費者 | KPI 車道 | 台獎車道 |
|---|---|---|---|
| `north12b-kpicalc-private-latest.json` | kpi.html | ✅ 更新 | 維持上一版 |
| `north12b-dashboard-private-latest.json` | index.html 戰情 | 維持上一版 | ✅ 更新 |

### 2.9 Apps Script Properties

| 屬性 | 用途 | 本次是否寫入 |
|---|---|---|
| `REPORT_UPDATE_STATE` | **本次新增**：版本狀態與防衝突 | ✅ 每次成功寫入後更新 |
| `KPICALC_LAST_IMPORT` | 排程去重 | ✅ 排程略過時也會更新 |
| `REPORT_UPLOAD_ALLOWED_EMPLOYEES` | **本次新增**：上傳白名單 | 讀取（需 Liam 手動設定） |
| `DASHBOARD_ADMIN_SECRET`／`DASHBOARD_PRIVATE_FOLDER_ID`／`DASHBOARD_ROSTER_SHEET_ID`／`DASHBOARD_TRUSTED_EMPLOYEE_ID`／`KPICALC_SOURCE_FOLDER_ID`／`NOTIFY_EMAIL`／`DASHBOARD_NOTIFY_EMAIL`／`PT_KEY` | 既有 | 唯讀，未改 |

### 2.10 GitHub Pages / 其他部署

| 項目 | 內容 |
|---|---|
| 現有資料來源 | repo 靜態檔（html） |
| 更新方式 | push 後由 Pages 自動建置 |
| 相關檔案 | **`.github/workflows` 不存在**——使用 GitHub 預設 `pages-build-deployment` |
| 是否已串接 | **未確認**：repo 內無設定檔可證明 Pages 的來源分支。協作日誌 2026-07-31 提到 run `30564346083` 成功，但那是 `main` |
| 需重新部署 | 是（本分支尚未合併，**依指示不合併**） |
| 多久看到 | Pages 建置後數分鐘 |
| 失敗保留上一版 | 是（Pages 保留上一次成功建置） |

> **重點**：**Pages 只影響網頁本身，不影響資料。** 資料全部走 GAS + 私有 Drive，
> 所以「同步網站」實際上等於「更新私有 Drive 的 JSON」，不需要重新部署 Pages。

## 3. 備份內容確認（Liam 要求六）

**三者都有保留，且是三個不同的東西，沒有混為一談：**

| # | 保留什麼 | 實作 | 檔名／位置 | 觸發時機 |
|---|---|---|---|---|
| 1 | **使用者上傳的原始檔** | preview 時就把原始 bytes 落地私有 Drive，commit 時改名保留 | `kpi-raw-<時間>-<原檔名>.xlsx`／`award-raw-<時間>-<原檔名>.json` | commit 成功；驗證失敗則刪除暫存 |
| 2 | **更新前的正式資料版本** | commit 第 3 階段複製現行正式 JSON | `backup-north12b-kpicalc-<時間>.json`／`backup-north12b-dashboard-<時間>.json` | 寫入正式檔**之前** |
| 3 | **更新操作紀錄** | 私有名冊試算表新分頁＋指令碼屬性 | `ReportUploadLog` 分頁；`REPORT_UPDATE_STATE` 屬性 | 每次 commit／rollback |

**差異說明**：
- #1 是**來源檔**（Excel 原貌），用途是日後重跑解析、追查格式變動。
- #2 是**產出檔**（正式 JSON 狀態），用途是一鍵回復。
- #3 是**過程紀錄**（誰、何時、哪個檔、什麼結果、哪個版本），用途是稽核與防衝突判斷。
- 「回復上一個成功版本」用的是 **#2**，不是 #1——不會重新解析 Excel，避免解析器改版造成回復結果不一致。

## 4. 私有 Drive 檔名規則

| 檔名 | 生命週期 |
|---|---|
| `upload-tmp-<token>-<檔名>` | 預覽期間；驗證失敗即刪，commit 時改名保留 |
| `upload-staging-<kind>-<token>.json` | 預覽→commit 之間；commit 後刪除 |
| `kpi-raw-<時間>-<檔名>`／`award-raw-<時間>-<檔名>` | 永久（原始檔備份） |
| `backup-north12b-kpicalc-<時間>.json`／`backup-north12b-dashboard-<時間>.json` | 永久（可回復） |
| `north12b-kpicalc-private-latest.json`／`north12b-dashboard-private-latest.json` | 正式資料 |

⚠️ **備份為什麼是 `backup-` 開頭**：`kpiCalcLatestDataFile()` 取私有資料夾中**最後更新最新**的
`north12b-kpicalc-*.json`。若備份也符合這個樣式，當「備份成功但寫入正式檔失敗」時，
備份會成為最新的一份而**被 kpi.html 當成正式資料**。
`tests/report-upload-contract.test.cjs` 有一條測試專門守住，改名前先看它。

## 5. GAS 端點

| action | 函式 | 說明 |
|---|---|---|
| `report_upload_preview` | `reportUploadPreview` | 檢查＋預覽＋版本預判，不動正式資料 |
| `report_upload_commit` | `reportUploadCommit` | 版本把關 → 分階段更新 |
| `report_upload_log` | `reportUploadLog` | 最近紀錄＋兩邊目前正式版本 |
| `report_upload_rollback` | `reportUploadRollback` | 回復上一個成功版本 |

四者皆 POST，皆先過 `reportUploadAuthorize_()`。
另有 `reportVersionStatus()` 供 GAS 編輯器手動查版本狀態（非網頁端點）。

## 6. 部署前檢查（CLAUDE.md 鐵則）

```bash
git fetch origin && git checkout main && git pull
for f in kpiCalcAutoUpdate testKpiCalcAutoUpdate setupKpiCalcAutoUpdate \
         kpiCalcWatchdog setupKpiCalcWatchdog kpiCalcSetupSelf \
         kpiCalcAccess kpiCalcPublish kpiCalcLatestDataFile \
         checkSegAndNotify checkAwareAndNotify sendWeeklyPatrolReport \
         kpiCalcParseReport reportUploadPreview reportUploadCommit \
         reportUploadLog reportUploadRollback reportUploadAuthorize_ \
         reportVersionDecide_ reportVersionRecord_ reportVersionStatus; do
  printf "%-26s %s\n" "$f" "$(grep -c "function $f" gas/Code.gs)"
done   # 全部要是 1
grep -c "action === 'ptread'\|action === 'hread'\|half_media_upload" gas/Code.gs  # 要 3
```

**本次改了 `doPost`，必須「部署 → 管理部署作業 → ✏️ → 新版本 → 部署」。**
