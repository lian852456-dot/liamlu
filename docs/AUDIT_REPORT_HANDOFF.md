# 北一二B 稽核回報專區交接

狀態：Issue #71／Draft PR #72 是門市無法使用核准裝置流程登入後的 P0 自助回報修復候選。正式站目前仍是舊流程；PR #72 在完整 Node、Chromium、WebKit、巡店 0 diff、Pages／GAS 受控部署與正式 API readback 完成前，不得宣稱修復完成。最後 gate 是 Liam 以 iPhone Safari 實際完成「選三創、姓名、員編、三項拍照、送出、雲端讀回」。

## 範圍與資料流

`home.html` 的「稽核回報專區」連到 `audit-report.html`。門市端由 `audit-report.js` 將草稿中繼資料存於 `localStorage`、照片 bytes 以 ArrayBuffer 存於 IndexedDB；上傳前最長邊縮至 2048 px、JPEG quality 0.9，逐張呼叫獨立 `audit_*` POST 路由。只有所有必要照片成功、`audit_submit` 寫入並讀回一致後，才顯示「回報完成」。失敗照片維持 failed，下一次只重試未成功的 `client_photo_id`。

門市填報模式在批次資訊後、基本資料前顯示「拍照前請先依此方向整理」圖卡，讀取公開素材 `assets/audit/quality-management-reminder.png`；督導模式會隨 `#storeView` 隱藏。圖卡沿用共用 `#photoDialog`，支援滑鼠、Enter、Space、關閉按鈕與 ESC，單張時不顯示左右切換並在關閉後還原觸發按鈕焦點；圖片失敗時顯示明確替代訊息。收到的附件實檔為 932×526 JPEG，轉為 932×526 lossless PNG 時未裁切、縮放、改字或重新製圖。

門市端不再使用 Approved Device、核准裝置綁定、名冊店點、roster probe、回報碼、30 分鐘 audit-only session 或 CacheService 門市授權。基本資料固定為可選的九店 canonical store、必填實際姓名與必填員編；員編只清理空白、轉大寫並驗證 4–20 字元格式，不作目前的身分或裝置授權。`audit_start` 寫入 `store_id/store_name/inspector_name/employee_id` 後不得靜默切換。

門市 ownership 以唯一 active batch、canonical store、隨機 `submission_id` 與隨機 `edit_token` 為核心；Sheet 只保存 `edit_token_hash`。`audit_upload`、`audit_photo_delete`、`audit_submit`、`audit_status` 與門市 `audit_photo_read` 都重新核對 ownership。相同批次／店點只能存在一筆未取消 submission，取消後證據保留且才可建立新 submission。督導 `audit_overview/detail/photo_read/review/cancel` 完整保留既有 PT session，不把九店總覽或其他 submission 暴露給門市。

舊 `localStorage` 草稿會保留可讀的店點、姓名、員編、備註與項目；照片 bytes 仍留在 IndexedDB。若 active batch 改變，前端建立新的 submission/edit token 並複製本機照片至新 key，不刪舊 key；只有已無本機 bytes 的舊 server-photo 參照會標示「需重新選取」，不計入完成條件，也不會清空其他照片。

照片 metadata API 只回傳 `client_photo_id, photo_name, revision, status`，不回傳 `photo_file_id`、`private_url` 或可直接存取的 Drive URL。`audit_photo_read` 在 GAS 端先驗證：督導必須持有既有 PT token；門市必須持有正確 `submission_id + edit_token`，且 submission 屬目前 active batch／canonical store、照片確實屬於該 submission。驗證後才讀取私有 Drive Blob，回傳 `mime_type + base64`；前端轉成 Blob/Object URL 顯示，換頁、重畫、刪除、登出或卸載時 revoke。Drive 檔案不開啟連結分享。

`ensurePrivatePhoto()` 是 async function，快取命中、進行中請求與新讀取三種路徑都固定回 Promise。門市縮圖、督導縮圖與 `Promise.all` 放大預覽共用此合約；`pagehide`／`beforeunload` 會釋放 Blob URL。`audit-report.html` 對 JS／CSS 使用 release query，避免 iPhone Safari 混用前後版本資產；既有 root-scope Service Worker 另 bump cache namespace，並對稽核 HTML 改為 network-first，避免曾開過的舊頁殼卡住。

督導端 `audit_cancel` 沿用 PT token，前端有二次確認。取消只把 submission 設為 `cancelled` 並 append `cancelled` 事件，不刪 Sheet row、照片或歷史；overview 將該店重新顯示為未回報，門市可用新的 submission 回報。這也是裝置草稿或 edit token 遺失時的復原方式。

`gas/AuditReport.gs` 是獨立模型，不寫入巡店、巡店到離店、半月督導檢查、每日回報、KPI、台獎或班表分頁。`gas/Code.gs` 只包含十一個隔離 `audit_*` `doPost` action dispatch；已移除門市裝置授權與 roster probe 路由，既有非稽核 action 合約不變。照片資料夾依「批次／店點／項目」建立，檔案不設公開分享。

九店稽核 store value 使用正式 canonical ID：酒泉 `DNB10062`、永吉 `DNB10082`、復興南 `DNB10094`、杭州南 `DNB10146`、萬大 `DNB10168`、通化 `DNB10174`、大稻埕 `DNB10284`、三創 `DNB10307`、六張犁 `DNB10440`。`PT_STORES` 仍只用來驗證既有店名存在；稽核不採用其中萬大的 provisional code 或通化的 legacy code，也不修改巡店既有合約。

## Sheet 與 Drive 規劃

首次由 Apps Script 編輯器手動執行 `setupAuditReportStorage()`，在既有 `SPREADSHEET_ID` 建立：

- `稽核批次`：`batch_id, batch_name, starts_on, due_on, active, created_at, updated_at`
- `稽核回報提交`：`batch_id, batch_name, submission_id, store_id, store_name, inspector_name, employee_id, auth_employee_hash(舊列相容空欄), edit_token_hash, status, submitted_at, reviewed_at, updated_at, revision, created_at`
- `稽核回報`：`batch_id, batch_name, submission_id, store_id, store_name, inspector_name, item_id, item_name, photo_file_id, private_url, photo_name, client_photo_id, note, status, reviewer_comment, submitted_at, reviewed_at, updated_at, revision, created_at, employee_id`
- `稽核回報紀錄`：`event_id, event_key, batch_id, submission_id, store_id, store_name, inspector_name, item_id, item_name, event_type, status, comment, actor, revision, created_at, employee_id`

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

- PR #72 本機同一來源實跑：完整 Node `243/243`；稽核 contract `12/12`；稽核 Chromium `9/9`；稽核 WebKit `9/9`。完整 Chromium `172/173`，唯一失敗為 Freeze 外的半月 `expired hread` 預期逾時文案；完整 WebKit `170/173`，另有兩個既有 Liam Supervisor App `file://` CORS console gate。三個失敗都已在乾淨 `origin/main` `4f0baab52d2254c4b322b8a53a611973468db1f3` 以相同訊息重現，本 PR 對相關檔案 0 diff；未為清除基準失敗修改巡店／App。
- 390×844 必測九店選擇、姓名／員編必填、多圖、分次加入、刪除／預覽、10 張限制、部分失敗只重試失敗照片、正式送出讀回、reload、IndexedDB 舊草稿、server photos、rework 與 resubmit。
- 安全契約必測 edit-token ownership、跨 submission 拒絕、非九店拒絕、同批次同店重複 submission 拒絕、門市不可讀其他 submission、督導 action 仍需 PT，以及 DOM／API 不含 Drive URL／file ID。
- 提醒圖卡測試涵蓋 DOM 順序、門市／督導顯隱、非 base64 路徑、圖片尺寸、載入失敗 fallback、點擊／Enter／Space、單張導覽隱藏、關閉／ESC／焦點回復與手機 overflow。
- 門市 `audit_start` 不再是匿名無限制入口：必須提供 active batch、canonical 九店、有效 submission/edit token、姓名與員編；建立後所有後續門市操作仍以同一 ownership fail closed。督導 PT 邊界與私有照片邊界不變。
- canonical 回歸另固定檢查九店 ID，拒絕 `xxx` placeholder 與通化 legacy `DNB10059`；正式 smoke 必須讀回萬大 `DNB10168`、通化 `DNB10174` 才可繼續。
- 截圖：`docs/screenshots/audit-report-20260820/audit-report-mobile-390x844.png`、`audit-report-quality-reminder-desktop.png`、`audit-report-supervisor-desktop.png`。截圖無正式姓名、正式照片或正式資料。

## 未來獲准後的部署步驟

1. 重新 fetch，確認部署來源是屆時最新 `main`，且只含本 PR 的增量；比對 `gas/Code.gs` 既有關鍵函式與 action 完整。
2. 在合併／部署前，以當下正式 main 建立 annotated rollback tag，例如 `rollback/audit-cleaning-predeploy-20260820`，並記錄現行 GitHub Pages commit、GAS deployment ID／version。
3. 在既有 Apps Script 專案更新 `AuditReport.gs`、`AuditReportStore.gs`、`AuditReportReview.gs`，內容必須來自合併後最新 main；`Code.gs` 必須以正式 editor 最新版本為底，只確認十一條 audit dispatch 完整，絕不以舊整檔覆蓋。保留最新 `HalfMedia.gs`、Report Upload、巡店與其他檔案。
4. 確認 Script Properties 已有 `PT_KEY`、`DASHBOARD_PRIVATE_FOLDER_ID`；門市流程不需要回報碼、名冊或裝置屬性。如要用另一個私有根目錄，再設定 `AUDIT_REPORT_FOLDER_ID`。所有秘密只在 Script Properties，不貼入 repo、HTML、JavaScript 或文件。
5. 四個分頁與私有資料夾沿用既有正式資料，不重新初始化、不刪除現場 submission／照片／事件。
6. 「部署 → 管理部署作業 → 編輯 → 新版本」建立 GAS 新版本。記錄新 version；GAS 存檔不算部署。
7. 正式 API smoke 核對公開 config、九店 canonical value、自助 `audit_start`、edit-token ownership、跨 submission 拒絕、PT 督導保護與私有照片 readback。
8. 合併／發布 GitHub Pages 後，最後由 Liam 以 iPhone Safari 390×844 執行三創三項拍照送出；Sheet／Drive／督導總覽讀回一致且 console 0 error 後，才能把狀態提升為正式完成。

Rollback：Pages 回到上述 rollback tag 對應 commit；GAS 在「管理部署作業」把既有 deployment 指回部署前 version。新建的四個 Sheet 與私有照片資料夾先停用批次並保留證據，不自動刪除。若需資料刪除，另取得 Liam 明確授權。

## 安全與限制

- 前端無 `PT_KEY`、Drive ID／URL、正式員工名單、正式照片或正式資料；員編寫入自己的本機草稿與稽核 submission／photo／event，供督導辨識，但目前不作裝置授權。
- `active batch + canonical store + submission_id + edit token`、`client_photo_id`、事件 `event_key` 與 Script Lock 共同避免跨 submission 修改、同店重複提交、照片及覆核事件重複。
- 單項最多 10 張，server 再驗證 image MIME 與壓縮後 10 MB 上限。
- PR #72 的自動測試、合併、Pages、GAS、正式 API readback 與 Liam iPhone 實機驗收是不同 gate；只有最後一項也 PASS，才能宣稱門市拍照送出已正式恢復。
