# 北一二B 稽核回報專區交接

狀態：Draft PR #62，受控部署／UAT 進行中。Liam 已完成 `AUDIT_REPORT_SUBMIT_CODE` 手動 gate 與 `setupAuditReportStorage()`；四個 Sheet 及私有照片資料夾已建立。首次 GAS v59 smoke 發現稽核沿用巡店 provisional／legacy code，已立即將正式 deployment rollback 至 v58、停用 UAT 批次並保留證據。canonical 修正與完整本機回歸已完成；GitHub Pages 尚未發布，九店尚未開放，正式驗收仍未完成。

## 範圍與資料流

`home.html` 的「稽核回報專區」連到 `audit-report.html`。門市端由 `audit-report.js` 將草稿中繼資料存於 `localStorage`、照片 bytes 以 ArrayBuffer 存於 IndexedDB；上傳前最長邊縮至 2048 px、JPEG quality 0.9，逐張呼叫獨立 `audit_*` POST 路由。只有所有必要照片成功、`audit_submit` 寫入並讀回一致後，才顯示「回報完成」。失敗照片維持 failed，下一次只重試未成功的 `client_photo_id`。

門市填報模式在批次資訊後、基本資料前顯示「拍照前請先依此方向整理」圖卡，讀取公開素材 `assets/audit/quality-management-reminder.png`；督導模式會隨 `#storeView` 隱藏。圖卡沿用共用 `#photoDialog`，支援滑鼠、Enter、Space、關閉按鈕與 ESC，單張時不顯示左右切換並在關閉後還原觸發按鈕焦點；圖片失敗時顯示明確替代訊息。收到的附件實檔為 932×526 JPEG，轉為 932×526 lossless PNG 時未裁切、縮放、改字或重新製圖。

門市先輸入批次回報碼，`audit_submit_auth` 只用這一次原始碼向 Script Property `AUDIT_REPORT_SUBMIT_CODE` 驗證，換取 30 分鐘、scope 固定為 `audit-submit`，且綁定 `batch_id + store_id + submission_id` 的短效 token。原始回報碼立即清空，不寫入 localStorage／sessionStorage；後續 `audit_start`、`audit_upload`、`audit_photo_delete`、`audit_submit`、`audit_status` 都驗證短效 token，並繼續核對 `submission_id + edit token` ownership。Sheet 只保存 edit token SHA-256，不保存明文。

未直接套用既有 Approved Device 員編機制的原因：該機制是區域私有戰情的裝置核准，權限可讀全區資料，沒有稽核門市／submission 綁定語意；直接重用會擴大門市端權限。因此本階段採規格允許的批次回報碼 fallback，換發權限更窄的 audit-only token。

照片 metadata API 只回傳 `client_photo_id, photo_name, revision, status`，不回傳 `photo_file_id`、`private_url` 或可直接存取的 Drive URL。`audit_photo_read` 在 GAS 端先驗證：督導必須持有既有 PT token；門市必須同時持有綁定該 submission 的短效 token 與 edit token。驗證後才讀取私有 Drive Blob，回傳 `mime_type + base64`；前端轉成 Blob/Object URL 顯示，換頁、重畫、刪除、登出或卸載時 revoke。Drive 檔案不開啟連結分享。

督導端 `audit_cancel` 沿用 PT token，前端有二次確認。取消只把 submission 設為 `cancelled` 並 append `cancelled` 事件，不刪 Sheet row、照片或歷史；overview 將該店重新顯示為未回報，門市可用新的 submission 回報。這也是裝置草稿或 edit token 遺失時的復原方式。

`gas/AuditReport.gs` 是獨立模型，不寫入巡店、巡店到離店、半月督導檢查、每日回報、KPI、台獎或班表分頁。`gas/Code.gs` 只增加十二個隔離 `audit_*` `doPost` action dispatch；既有 action 合約不變。照片資料夾依「批次／店點／項目」建立，檔案不設公開分享。

九店稽核 store value 使用正式 canonical ID：酒泉 `DNB10062`、永吉 `DNB10082`、復興南 `DNB10094`、杭州南 `DNB10146`、萬大 `DNB10168`、通化 `DNB10174`、大稻埕 `DNB10284`、三創 `DNB10307`、六張犁 `DNB10440`。`PT_STORES` 仍只用來驗證既有店名存在；稽核不採用其中萬大的 provisional code 或通化的 legacy code，也不修改巡店既有合約。

## Sheet 與 Drive 規劃

首次由 Apps Script 編輯器手動執行 `setupAuditReportStorage()`，在既有 `SPREADSHEET_ID` 建立：

- `稽核批次`：`batch_id, batch_name, starts_on, due_on, active, created_at, updated_at`
- `稽核回報提交`：`batch_id, batch_name, submission_id, store_id, store_name, inspector_name, edit_token_hash, status, submitted_at, reviewed_at, updated_at, revision, created_at`
- `稽核回報`：`batch_id, batch_name, submission_id, store_id, store_name, inspector_name, item_id, item_name, photo_file_id, private_url, photo_name, client_photo_id, note, status, reviewer_comment, submitted_at, reviewed_at, updated_at, revision, created_at`
- `稽核回報紀錄`：`event_id, event_key, batch_id, submission_id, store_id, store_name, item_id, item_name, event_type, status, comment, actor, revision, created_at`

預設批次為 `audit-cleaning-202608`／「稽核前環境清潔確認」，暫定 `2026-08-20` 至 `2026-08-31`。部署前 Liam 應確認截止日；之後只需在 `稽核批次` 新增一列並確保恰有一列 `active=TRUE`，不必改程式。

`photo_file_id` 只供 GAS 伺服器內部查找私有 Drive 檔；`private_url` 為避免破壞既有 seed schema 而保留的相容欄位，新寫入固定空白，兩者都不進前端 API。

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

- Node contract：`234/234`
- 完整 Chromium Playwright：`162/162`
- 完整 WebKit Playwright（Safari 等價）：`162/162`
- 390×844 無橫向 overflow；多圖、分次加入、刪除／預覽、10 張限制、部分失敗重試、冪等、own-submission scope、PT auth／逾時重驗、單項補件與逐項覆核皆有自動測試。
- 提醒圖卡測試涵蓋 DOM 順序、門市／督導顯隱、非 base64 路徑、圖片尺寸、載入失敗 fallback、點擊／Enter／Space、單張導覽隱藏、關閉／ESC／焦點回復與手機 overflow。完整 WebKit 回歸另把兩支既有 Supervisor App 測試改用 `TEST_BASE_URL`，並修正里程 fixture 不再覆寫巡店正式月份；產品碼與正式資料流未改。
- 安全案例涵蓋匿名開始／上傳／刪除／送出／讀取拒絕、錯誤回報碼、過期 token、跨門市 token／edit token 越權拒絕、PT 保護的私有 Blob 讀取、DOM/API 無 Drive view URL／file ID，以及取消後證據保留與新 submission。
- canonical 回歸另固定檢查九店 ID，拒絕 `xxx` placeholder 與通化 legacy `DNB10059`；正式 smoke 必須讀回萬大 `DNB10168`、通化 `DNB10174` 才可繼續。
- 截圖：`docs/screenshots/audit-report-20260820/audit-report-mobile-390x844.png`、`audit-report-quality-reminder-desktop.png`、`audit-report-supervisor-desktop.png`。截圖無正式姓名、正式照片或正式資料。

## 未來獲准後的部署步驟

1. 重新 fetch，確認部署來源是屆時最新 `main`，且只含本 PR 的增量；比對 `gas/Code.gs` 既有關鍵函式與 action 完整。
2. 在合併／部署前，以當下正式 main 建立 annotated rollback tag，例如 `rollback/audit-cleaning-predeploy-20260820`，並記錄現行 GitHub Pages commit、GAS deployment ID／version。
3. 在既有 Apps Script 專案新增 `AuditReport.gs`，把 repo 最新 `gas/AuditReport.gs` 內容存入；對 `Code.gs` 只套用本 PR 的十二條 dispatch，絕不以舊整檔覆蓋。保留最新 `HalfMedia.gs` 與其他檔案。
4. 確認 Script Properties 已有 `PT_KEY`、`DASHBOARD_PRIVATE_FOLDER_ID`，並新增強度足夠且只透過安全管道提供門市的 `AUDIT_REPORT_SUBMIT_CODE`；如要用另一個私有根目錄，再設定 `AUDIT_REPORT_FOLDER_ID`。所有秘密只在 Script Properties，不貼入 repo、HTML、JavaScript 或文件。
5. 手動執行 `setupAuditReportStorage()` 一次，核對四個分頁、批次日期、私有資料夾與 `active=TRUE`；這一步只是初始化，不是部署。
6. 「部署 → 管理部署作業 → 編輯 → 新版本」建立 GAS 新版本。記錄新 version；GAS 存檔不算部署。
7. 以測試批次做門市三項送出、單項退回、補件、三項通過；核對 Sheet、Drive 私有權限、冪等重送、PT token 過期重驗與讀回。
8. 合併／發布 GitHub Pages 後，以 iPhone Safari 390×844 與桌面 Chrome 做正式 smoke；確認後才把狀態提升為已部署／已驗收。

Rollback：Pages 回到上述 rollback tag 對應 commit；GAS 在「管理部署作業」把既有 deployment 指回部署前 version。新建的四個 Sheet 與私有照片資料夾先停用批次並保留證據，不自動刪除。若需資料刪除，另取得 Liam 明確授權。

## 安全與限制

- 前端無 `PT_KEY`、回報碼、Drive ID／URL、正式員工名單、正式照片或正式資料。
- 短效稽核 token 綁定 `batch + store + submission`；`submission_id + edit token`、`client_photo_id`、事件 `event_key` 與 Script Lock 共同避免越權與重複提交、照片及覆核事件。
- 單項最多 10 張，server 再驗證 image MIME 與壓縮後 10 MB 上限。
- 首批開始／截止日目前是待 Liam 確認的 seed；本 PR 不建立正式資料、不部署，也不代表使用者驗收。
