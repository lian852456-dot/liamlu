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

consumer 與 Outlook host adapter 已納入 Git：

- `tools/report-automation/report_official_ingest_consumer.mjs`
- `tools/report-automation/consume_report_official_ingest_with_keychain.sh`
- `tools/report-automation/outlook_bridge_host_adapter.mjs`
- `tools/report-automation/outlook_bridge_host_adapter.sh`
- `tools/report-automation/*.test.mjs`

正式 KPI／台獎／網站 processor 仍留在既有 Mac `report-automation/work`；consumer 透過 runtime `REPORT_AUTOMATION_DIR` 呼叫，不複製公式、Y26 config、Mail template 或正式 publisher。Git 內沒有硬編碼本機絕對路徑。

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

正式 adapter 已實作為 `outlook_bridge_host_adapter.sh`。它直接讀取既有 `prepare_send_payloads.mjs` payload，以 ephemeral、read-only Codex host session 呼叫已安裝的 Microsoft Outlook connector；禁止 SMTP、本地 Graph token、browser automation、假 message ID 或改寫 Mail template。每封信寄送前先找同一 `requestedAt`／idempotency request 的 exact Sent Items match，寄送後再讀真實 message ID 與附件 metadata。兩封信或任一附件 readback 不完整即 non-zero／fail closed。

dry-run 只驗 payload/body/hash/附件 contract，不啟動 Codex 或 Outlook。正式模式另要求 `REPORT_OUTLOOK_BRIDGE_ALLOW_SEND=YES`，避免誤觸。Keychain／connector authorization、mode 0600 receipts、runtime state 與 local paths 均不進 Git；`tools/report-automation/.gitignore` 明確排除。

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

- Git worktree Node／consumer／bridge contracts：由 CI 與本機 gate 執行。
- Bridge A–G：兩封成功、第二封失敗、附件 mismatch、private retry、不見 receipt 但 job evidence 完整、evidence 不完整、duplicate idempotency。
- GAS／consumer syntax、focused Playwright 與 `git diff --check` 已納入 `.github/workflows/report-official-ingest-p0.yml`。
- 未執行任何 GAS deploy、正式寄件、正式資料 promotion 或 private publish。

## UAT gate

程式、host adapter、版本化 rollback baseline 與無副作用 CI 齊備後可進入正式 UAT。這不代表正式 UAT 已通過；另行授權後仍需部署 upload GAS，並以隔離測試檔驗證三檔 promotion、兩封 Outlook 寄件備份、private readback、網站與 App 日期對齊。
