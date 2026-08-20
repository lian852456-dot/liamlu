# 北一二B 稽核回報專區交接

狀態：commit `db9c54d`、Draft PR #62；程式與本機測試完成，尚未部署 GitHub Pages、GAS、建立正式 Sheet／Drive 資料，亦尚未完成 Liam 驗收。

## 範圍與資料流

`home.html` 的「稽核回報專區」連到 `audit-report.html`。門市端由 `audit-report.js` 將草稿中繼資料存於 `localStorage`、照片 bytes 以 ArrayBuffer 存於 IndexedDB；上傳前最長邊縮至 2048 px、JPEG quality 0.9，逐張呼叫獨立 `audit_*` POST 路由。只有所有必要照片成功、`audit_submit` 寫入並讀回一致後，才顯示「回報完成」。失敗照片維持 failed，下一次只重試未成功的 `client_photo_id`。

門市只持有隨機 `submission_id` 與隨機 edit token；Sheet 僅保存 token SHA-256，不保存明文。`audit_status`、`audit_upload`、`audit_photo_delete`、`audit_submit` 都同時核對兩者，所以不能列出其他門市。督導端的 `audit_overview`、`audit_detail`、`audit_review` 沿用既有 `ptauth` 產生的 30 分鐘 PT token 與重新驗證流程；公開 HTML／JavaScript 不含 `PT_KEY`。

`gas/AuditReport.gs` 是獨立模型，不寫入巡店、巡店到離店、半月督導檢查、每日回報、KPI、台獎或班表分頁。`gas/Code.gs` 只增加九個 `doPost` action dispatch；既有 action 合約不變。照片資料夾依「批次／店點／項目」建立，檔案不設公開分享。

## Sheet 與 Drive 規劃

首次由 Apps Script 編輯器手動執行 `setupAuditReportStorage()`，在既有 `SPREADSHEET_ID` 建立：

- `稽核批次`：`batch_id, batch_name, starts_on, due_on, active, created_at, updated_at`
- `稽核回報提交`：`batch_id, batch_name, submission_id, store_id, store_name, inspector_name, edit_token_hash, status, submitted_at, reviewed_at, updated_at, revision, created_at`
- `稽核回報`：`batch_id, batch_name, submission_id, store_id, store_name, inspector_name, item_id, item_name, photo_file_id, private_url, photo_name, client_photo_id, note, status, reviewer_comment, submitted_at, reviewed_at, updated_at, revision, created_at`
- `稽核回報紀錄`：`event_id, event_key, batch_id, submission_id, store_id, store_name, item_id, item_name, event_type, status, comment, actor, revision, created_at`

預設批次為 `audit-cleaning-202608`／「稽核前環境清潔確認」，暫定 `2026-08-20` 至 `2026-08-31`。部署前 Liam 應確認截止日；之後只需在 `稽核批次` 新增一列並確保恰有一列 `active=TRUE`，不必改程式。

照片根目錄優先讀 Script Property `AUDIT_REPORT_FOLDER_ID`。未設定時，初始化函式會在 `DASHBOARD_PRIVATE_FOLDER_ID` 下建立 `04_稽核回報_照片` 並回寫其 ID：

```text
04_稽核回報_照片/
└── audit-cleaning-202608/
    └── 台北酒泉/
        ├── island_display_中島、展示機環境清潔/
        ├── op_zone_OP 商品、專區清潔/
        └── counter_seating_櫃台電腦後方／客戶座位區清潔/
```

## 本機驗證

- Node contract：`221/221`
- 完整 Chromium Playwright：`156/156`
- 稽核專區＋首頁 WebKit（Safari 等價）：`7/7`
- 390×844 無橫向 overflow；多圖、分次加入、刪除／預覽、10 張限制、部分失敗重試、冪等、own-submission scope、PT auth／逾時重驗、單項補件與逐項覆核皆有自動測試。
- 合成資料截圖：`docs/screenshots/audit-report-20260820/`。截圖無正式姓名、正式照片或正式資料。

## 未來獲准後的部署步驟

1. 重新 fetch，確認部署來源是屆時最新 `main`，且只含本 PR 的增量；比對 `gas/Code.gs` 既有關鍵函式與 action 完整。
2. 在合併／部署前，以當下正式 main 建立 annotated rollback tag，例如 `rollback/audit-cleaning-predeploy-20260820`，並記錄現行 GitHub Pages commit、GAS deployment ID／version。
3. 在既有 Apps Script 專案新增 `AuditReport.gs`，把 repo 最新 `gas/AuditReport.gs` 內容存入；對 `Code.gs` 只套用本 PR 的九條 dispatch，絕不以舊整檔覆蓋。保留最新 `HalfMedia.gs` 與其他檔案。
4. 確認 Script Properties 已有 `PT_KEY`、`DASHBOARD_PRIVATE_FOLDER_ID`；如要用另一個私有根目錄，再設定 `AUDIT_REPORT_FOLDER_ID`。秘密只在 Script Properties。
5. 手動執行 `setupAuditReportStorage()` 一次，核對四個分頁、批次日期、私有資料夾與 `active=TRUE`；這一步只是初始化，不是部署。
6. 「部署 → 管理部署作業 → 編輯 → 新版本」建立 GAS 新版本。記錄新 version；GAS 存檔不算部署。
7. 以測試批次做門市三項送出、單項退回、補件、三項通過；核對 Sheet、Drive 私有權限、冪等重送、PT token 過期重驗與讀回。
8. 合併／發布 GitHub Pages 後，以 iPhone Safari 390×844 與桌面 Chrome 做正式 smoke；確認後才把狀態提升為已部署／已驗收。

Rollback：Pages 回到上述 rollback tag 對應 commit；GAS 在「管理部署作業」把既有 deployment 指回部署前 version。新建的四個 Sheet 與私有照片資料夾先停用批次並保留證據，不自動刪除。若需資料刪除，另取得 Liam 明確授權。

## 安全與限制

- 前端無 `PT_KEY`、密碼、正式員工名單、正式照片或正式資料。
- `submission_id + edit token`、`client_photo_id`、事件 `event_key` 與 Script Lock 共同避免重複提交、照片及覆核事件。
- 單項最多 10 張，server 再驗證 image MIME 與壓縮後 10 MB 上限。
- 首批開始／截止日目前是待 Liam 確認的 seed；本 PR 不建立正式資料、不部署，也不代表使用者驗收。
