# 戰報快速更新正式 ingest P0

狀態：Draft PR 候選；本機實作與測試完成，**未部署、未做正式資料寫入、未達完整 UAT**。

## Root dependency map

### 原自動路徑

```text
OneDrive（同日優先）／Google Drive（備援）
  ├─ KPI 公司日報 MMDD.xlsx
  │    ├─ Mac daily automation：產生主力 KPI／加掛／個績附件與 Mail payload
  │    └─ GAS KPICALC_SOURCE_FOLDER_ID
  │         └─ kpiCalcAutoUpdate()
  │              ├─ findLatestKpiSourceFile_()
  │              └─ processKpiSourceFile_(exact file, scheduled context)
  │                   ├─ 唯一 parser：kpiCalcParseReport()
  │                   ├─ PRIVATE_KPICALC_FILE
  │                   ├─ kpicalc_access（kpi.html／KPI standalone／index KPI）
  │                   └─ KPI import 通知
  ├─ 01-08-03 店點台獎 Excel
  ├─ 01-08-04 個人台獎 Excel
  └─ Y26重點台獎手機.xlsx／active award config
       └─ update_phone_awards.py
            └─ 台獎 Excel、圖片、phone_awards_update_summary.json

run_daily_north12b_report.mjs
  → update_phone_awards.py
  → prepare_send_payloads.mjs
  → Outlook 每日戰報 Mail + 台獎 Mail
  → 寄件備份 direct-attachment 驗證
  → build_github_pages_data.py
  → publish_private_dashboard_with_keychain.sh
  → privateDashboard KPI supplement + awardsBattle snapshot
  → private readback（日期、來源、筆數、權限）
  → Supervisor App（既有 private_access + kpicalc_access）
```

### 舊 quick upload 根因

舊 `report_upload_preview → report_upload_commit` 雖共用 `kpiCalcParseReport()`，commit 卻把 staging JSON 直接寫入 `PRIVATE_KPICALC_FILE`，沒有先 promotion 原始 Excel 到 `KPICALC_SOURCE_FOLDER_ID`，也沒有走 scheduler 的正式 import 編排。它只更新 `kpicalc_access` 主資料，不會執行 Mac automation 的附件、台獎、privateDashboard supplement／awards snapshot、Outlook 正式 Mail 與 readback，因此會出現 `kpi.html` 已更新，但 index／Supervisor App／台獎／Mail 不完整同步。

不能在舊 commit 後硬補 App refresh；根因是兩條寫入路徑，不是前端快取。

## P0 新 quick upload 路徑

```text
ReportUpload.html
  → report_upload_preview
  → Private staging（scheduler 掃不到）
  → 唯一 parser 預檢（內容日期、九店、人數、25 KPI、區域）
  → 由內容推導 report date 與 MMDD.xlsx
  → ScriptLock promotion gate
       ├─ older date：拒絕
       ├─ same hash：冪等，不重複發布／寄信
       └─ same date correction：明確確認、archive previous source
  → 既有 KPICALC_SOURCE_FOLDER_ID（hash readback）
  → processKpiSourceFile_(剛 promotion 的 exact file, quick context)
       ├─ 同一 kpiCalcParseReport()
       ├─ 同一 PRIVATE_KPICALC_FILE
       ├─ 即時 readback
       └─ KPI import 通知（與完整戰報 Mail 明確區分）
  → report-official-ingest-job-<runId>.json
       └─ 交給既有 Mac formal pipeline consumer
  → KPI／台獎 snapshot、Supervisor App、正式 Mail、寄件備份、private readback
```

若 promotion 後 import 失敗，新檔會改成 `failed-kpi-source-*`，避開 scheduler 的 `MMDD.xlsx` 掃描；若是同日更正版，上一份 canonical source 會恢復。每次 run 記錄 operator、hash、時間、canonical file、previous file、processing status 與各階段狀態。

## 真正資料來源與單一處理邊界

| 產物 | 真正來源 | 正式處理器／publisher |
|---|---|---|
| KPI 主資料 | 公司 KPI 日報 `MMDD.xlsx` | GAS `processKpiSourceFile_()` → `kpiCalcParseReport()` → `PRIVATE_KPICALC_FILE` |
| KPI battle supplement | 公司 KPI 日報加上外部 daily automation 產物 | `build_github_pages_data.py` + 既有 private publisher |
| awards battle | `01-08-03` 店點、`01-08-04` 個人、Y26／active award config | `update_phone_awards.py` + `build_github_pages_data.py` + 既有 private publisher |
| Supervisor App KPI／台獎 | `kpicalc_access` + 同日 `private_access` snapshot | 既有 App adapter／controller；本 P0 不改 App UI |
| KPI import 通知 | KPI processor 結果 | GAS `kpiCalcNotify()` |
| 每日正式戰報 Mail | daily report attachments + 台獎 attachments | `prepare_send_payloads.mjs` + Outlook；`寄件備份` readback 是必要 gate |

公司 KPI Excel **不足以單獨產生正式台獎 snapshot**。P0 不猜台獎、不在 GAS 複製 `update_phone_awards.py`，而是讓同一 report-update session 的 handoff 宣告 `awardStore`、`awardPerson` 為必要輸入。

## External processor interface

GAS 在 private dashboard folder 寫入 `report-official-ingest-job-<runId>.json`：

```json
{
  "schemaVersion": 1,
  "runId": "quick-...",
  "status": "waiting-external-pipeline",
  "operator": "masked-authorized-employee",
  "reportDate": "2026-08-19",
  "sourceDataDate": "2026-08-18",
  "canonicalFile": "0819.xlsx",
  "sourceFileId": "drive-file-id",
  "sourceHash": "md5",
  "requiredInputs": { "kpi": true, "awardStore": true, "awardPerson": true },
  "processor": "existing-report-automation",
  "stages": []
}
```

待補的 consumer 必須以 `runId + sourceHash` 作 idempotency key，取得／等待該 session 的 01-08-03、01-08-04，呼叫既有 `run_daily_north12b_report.mjs` 鏈，並把 Outlook `寄件備份`、private publish 與 App readback 結果回寫同一 job。它不得另做 KPI／台獎公式或 Mail template。

## 完成語意與恢復策略

- GAS 完成 source promotion、KPI import、PRIVATE_KPICALC_FILE readback 後，只能顯示 `⚠️ 尚未完成`。
- `KPI 戰情`、`台獎戰情`、`Supervisor App`、`每日正式戰報 Mail`、`全鏈 Readback` 全部由正式結果證明後，才可顯示 `✅ 戰報正式更新完成`。
- duplicate hash 不重寫正式 JSON、不重寄 KPI import mail，也不可重新啟動同一外部 job。
- older date 永遠拒絕；same-date correction 必須人工勾選並先 archive。
- scheduler 與 quick upload 共用 ScriptLock 和 `processKpiSourceFile_()`，避免雙跑。
- failure after promotion 會移出 canonical pattern，保留 retry／人工恢復證據。

## Test matrix

| 情境 | 本機證據 |
|---|---|
| scheduler 舊路徑 | discovery → exact-file shared processor 契約 |
| quick upload | staging → preview → promotion → exact import → readback 契約 |
| duplicate | same hash idempotent、mail skipped |
| same-date correction | explicit confirm + previous archive metadata |
| older date | manual／scheduler 即使 force 也拒絕 |
| invalid Excel | preview finally 清理，永不 promotion |
| concurrency | scheduler／quick 共用 ScriptLock |
| post-promotion failure | failed prefix + previous canonical restore |
| KPI website／App regression | Node 全套與 focused Playwright |
| scheduler regression | trigger／watchdog 函式唯一性與舊 upload UI Playwright |

## UAT gate

目前可做 code review 與隔離環境 KPI ingest UAT 準備，但**尚不可做完整正式 UAT／上線**。必須先完成：

1. 外部 Mac job consumer，且以同一 run id 回寫各階段；
2. quick update session 內安全上傳／解析 01-08-03 與 01-08-04（沿用既有 source folder／processor）；
3. upload deployment 新版本（另行授權）；
4. 用非正式測試檔驗證 source archive／rollback／concurrency；
5. 正式 UAT 時完成 Outlook `寄件備份`、private Drive、網站與 Supervisor App 同日 readback。
