# 戰報快速更新正式 ingest P0

狀態：Draft PR；程式與本機測試完成，**未部署、未寄正式 Mail、未修改正式資料、未合併**。

## Root dependency map

### 原自動路徑

```text
OneDrive（同日優先）／Google Drive（備援）
  ├─ KPI 公司日報 MMDD.xlsx
  ├─ 01-08-03 店點台獎 Excel
  ├─ 01-08-04 個人台獎 Excel
  └─ Y26／active award config
       ↓
run_daily_north12b_report.mjs
→ update_phone_awards.py
→ prepare_send_payloads.mjs
→ Outlook 每日戰報 + 台獎 Mail
→ Outlook 寄件備份附件驗證
→ build_github_pages_data.py
→ publish_formal_website_with_keychain.sh
→ kpicalc_access + private_access + private_admin_snapshot_status readback
→ Website / Supervisor App 日期對齊
```

GAS KPI 排程是同一正式資料引擎的另一個入口：

```text
KPICALC_SOURCE_FOLDER_ID（Folder ID，不依路徑）
→ findLatestKpiSourceFile_()
→ processKpiSourceFile_(exact file, scheduled context)
→ kpiCalcParseReport()
→ PRIVATE_KPICALC_FILE
```

### 舊 quick upload 根因

舊 quick upload 自己解析、自己建立 staging JSON，再直接改 `PRIVATE_KPICALC_FILE`；沒有 promotion 原始 Excel、沒有呼叫排程相同的 exact-file processor，也沒有執行 Mac 的台獎、正式 Mail、private snapshot 與 readback。因此會出現 KPI 頁更新、index／App／台獎／Mail 不完整同步。這是資料流分叉，不是 App refresh 問題。

## 新 quick upload 路徑

```text
同一 ReportUpload session
  ├─ KPI 日報
  ├─ 01-08-03 店點台獎
  └─ 01-08-04 個人台獎
       ↓
private staging（scheduler 掃不到）
→ Excel 工作表／內容日期／DNB 九店／人數預檢
→ 系統產生 canonical filename
→ ScriptLock promotion gate
→ 既有 KPICALC_SOURCE_FOLDER_ID（File ID + SHA-256 readback）
→ KPI：processKpiSourceFile_(that exact File)
→ 台獎：不在 GAS 計算，只交給既有 update_phone_awards.py
→ report-official-ingest-job-<runId>.json
→ Mac consumer 逐 stage 執行既有正式 pipeline
→ 同一 job 回寫／UI 每 5 秒 polling／重新登入 resume
```

台獎 canonical name 固定以前綴 `01-08-03-`／`01-08-04-` 開頭；KPI 維持 `MMDD.xlsx`。scheduler 只掃 `MMDD.xlsx`，不會把 staging 或台獎檔誤當 KPI。Drive 搬資料夾後仍以 ID 存取；`KPICALC_SOURCE_FOLDER_ID`、`DASHBOARD_PRIVATE_FOLDER_ID`、`DASHBOARD_ROSTER_SHEET_ID`、`SPREADSHEET_ID` 契約都未改。

## Job schema / state machine

Job schema v2 的 queue 狀態與業務狀態分開：

- 缺台獎來源：`status=waiting-input`, `state=waiting-input`；禁止完整 Mail。
- 三檔齊全：`status=waiting-external-pipeline`, `state=ready`；consumer 只消費這個 queue status。
- claim 後依序：`processing → kpi-ok → awards-ok → mail-sent → private-published → readback-ok → completed`。
- 任一 stage 失敗：`failed`，保留 `retryable` 與 error；不得 completed。

每個 stage 都有 `startedAt`、`finishedAt`、`detail`、`error`、`retryable`。必要 stage：

1. source files
2. KPI formal
3. KPI battle
4. awards formal
5. awards battle
6. Supervisor App
7. daily Mail
8. awards Mail
9. Sent Items readback
10. private publish
11. private readback
12. website readback

server-side completion gate 同時要求：KPI 正式 readback 同日、台獎 13 款／9 店、兩封 Outlook message ID、寄件備份附件驗證、private KPI／awards 同日、Supervisor App 對齊、website readback PASS。consumer 不能直接指定 completed。

## 受保護 job API

以下 route 都先走既有 `privateDashboardAdminAuthorized` + 員編白名單：

- `report_upload_job_status`：UI 唯讀 sanitized 狀態，不回 operator、File ID、hash 或 private 內容。
- `report_upload_job_claim`：ScriptLock 原子 claim，只接受 `waiting-external-pipeline/ready`。
- `report_upload_job_source`：依 job 中 exact File ID 分段下載，要求 claimId，consumer 再驗 SHA-256。
- `report_upload_job_update`：只允許 allowlisted stage/evidence；完成狀態由 server gate 推導。

## Mac consumer

consumer 位於非 Git 的既有 automation workspace：

- `report-automation/work/report_official_ingest_consumer.mjs`
- `report-automation/work/consume_report_official_ingest_with_keychain.sh`
- `report-automation/work/report_official_ingest_consumer.test.mjs`

它不重寫 KPI、台獎或 Mail template。三份 exact Drive File ID 下載並驗 hash 後，只編排：

```text
run_daily_north12b_report.mjs
→ update_phone_awards.py（新增 exact 01-08-03/04 env override；公式不變）
→ prepare_send_payloads.mjs
→ REPORT_OUTLOOK_BRIDGE_COMMAND（既有 Outlook connector host）
→ Sent Items receipt
→ build_github_pages_data.py
→ publish_formal_website_with_keychain.sh
→ formal manifest / private / website readback
```

`idempotencyKey = runId + ':' + KPI sourceHash`。Mail receipt 在 bridge 成功後先以 mode 0600 落地，再回寫 job；retry 若 job evidence 或本機 receipt 已證明兩封 Mail 和附件 readback，即跳過 bridge，只從未完成 stage 繼續。preflight 重新產生 manifest 後，consumer 會把已驗證的 message IDs／附件回執補回 manifest，避免 private publish retry 抹掉寄件證據。

### Outlook bridge 邊界

目前正式 Outlook 寄件是 Codex Outlook connector capability，不是 repo 內 Node API。consumer 因此要求 `REPORT_OUTLOOK_BRIDGE_COMMAND` 指向既有 connector host adapter；adapter 輸入既有 `prepare_send_payloads` payload，輸出兩封 message ID、各自附件名單與 `sentItemsAttachmentsVerified=true` 的 receipt。未設定時 consumer fail closed，絕不假裝寄件或另寫 SMTP／Mail template。

## Freeze / source of truth

| 產物 | 唯一正式來源／處理器 |
|---|---|
| KPI 主資料 | KPI Excel → `processKpiSourceFile_` → `kpiCalcParseReport` → `PRIVATE_KPICALC_FILE` |
| KPI battle | 既有 daily output → `build_github_pages_data.py` → private publisher |
| awards | 01-08-03 + 01-08-04 + Y26/active config → `update_phone_awards.py` |
| Mail | `prepare_send_payloads.mjs` 既有 payload → Outlook connector |
| Supervisor App | 既有 `kpicalc_access` + `private_access`，本 P0 不改 App UI |

未修改 KPI 公式、台獎規則、App UI、Native/iOS、巡店、班表、16/21 回報、昨日追蹤或金牌。

## Test evidence

- Git worktree Node contracts：232/232 PASS。
- consumer + formal publisher/private transport/retry：23/23 PASS。
- 台獎 active config／13 款／preflight 回歸：12/12 PASS。
- GAS source syntax、Python compile：PASS。
- 未執行任何 GAS deploy、正式寄件、正式資料 promotion 或 private publish。

## UAT gate

程式邏輯與可測試 interface 已完成，但目前仍是 **UAT environment ready、不是正式 UAT Ready**。正式 UAT 前尚需：

1. 由現有 Codex automation host 提供可執行的 `REPORT_OUTLOOK_BRIDGE_COMMAND`（不可另寫第二套寄件）。
2. 另行授權後部署 upload GAS 新版本。
3. 以隔離測試檔驗證三檔 promotion、claim、完整 readback 與 retry。
4. Liam 正式 UAT 驗證網站、App、兩封寄件備份與 private readback。
