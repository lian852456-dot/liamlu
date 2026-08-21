# 北一二B 稽核回報專區交接

狀態：PR #65／#66 已部署至 UAT，正式批次仍為 `active=FALSE`，`audit-cleaning-202608-uat` 維持唯一 `active=TRUE`。2026-08-21 PR #67 deployment candidate 新增 Trusted Employee 專用的 UAT 唯讀名冊 probe，並修正 Safari 重新載入 server photos 時 `ensurePrivatePhoto(...).then is not a function`；本次變更完成本機驗證後仍須經 GAS／Pages 部署與 Liam 實機 UAT，通過前不得啟用正式批次或通知九店。

## 範圍與資料流

`home.html` 的「稽核回報專區」連到 `audit-report.html`。門市端由 `audit-report.js` 將草稿中繼資料存於 `localStorage`、照片 bytes 以 ArrayBuffer 存於 IndexedDB；上傳前最長邊縮至 2048 px、JPEG quality 0.9，逐張呼叫獨立 `audit_*` POST 路由。只有所有必要照片成功、`audit_submit` 寫入並讀回一致後，才顯示「回報完成」。失敗照片維持 failed，下一次只重試未成功的 `client_photo_id`。

門市填報模式在批次資訊後、基本資料前顯示「拍照前請先依此方向整理」圖卡，讀取公開素材 `assets/audit/quality-management-reminder.png`；督導模式會隨 `#storeView` 隱藏。圖卡沿用共用 `#photoDialog`，支援滑鼠、Enter、Space、關閉按鈕與 ESC，單張時不顯示左右切換並在關閉後還原觸發按鈕焦點；圖片失敗時顯示明確替代訊息。收到的附件實檔為 932×526 JPEG，轉為 932×526 lossless PNG 時未裁切、縮放、改字或重新製圖。

門市輸入既有員編，前端沿用既有 `north12b_private_dashboard_device_id` Approved Device 識別；`audit_submit_auth` 在 GAS 端直接核對啟用名冊與該員編綁定的核准裝置，不呼叫 `privateDashboardAccess`／`privateDashboardSnapshot`，也不取得 KPI 或全區快照。驗證成功只回傳名冊綁定店點、安全遮罩 `masked_name` 與 30 分鐘短效 token；遮罩名只顯示為「名冊辨識：王＊明」提示，不會填入或寫成正式 `inspector_name`。token scope 固定為 `audit-submit`，並綁定 `employee_id_hash + batch_id + store_id + submission_id`，不綁姓名。員編可持久化供下次開頁自動帶入；audit token 只存在 `sessionStorage`，關閉頁面後必須重新驗證，且不寫入稽核草稿、Sheet 或 API 回應。

只有 active batch ID 以 `-uat` 結尾，且目前 audit session 是由既有 Trusted Employee 建立時，前端才顯示「員編名冊測試」。`audit_roster_probe` 只做名冊唯讀查詢，回傳 `exists`、`active/inactive`、`masked_name`、名冊店點、正規化稽核店點、映射結果及 Approved Device 是否已綁定的 boolean；不回傳員編雜湊、device ID、token、private snapshot、KPI 或台獎，也不改裝置綁定與 `last_login_at`。API 會再次核對目前唯一 active batch 為 `*-uat` 與 session 的 Trusted Employee UAT 權限；一般員工、正式批次或偽造 session 一律拒絕。

後續 `audit_start`、`audit_upload`、`audit_photo_delete`、`audit_submit`、`audit_status` 都驗證上述 audit-only token，並繼續核對 `submission_id + edit token` ownership。店點一律使用 token 內的名冊店點；`audit_start` 接收門市必填的實際 `inspector_name`，後端去除控制字元與前後空白、拒絕空值及超過 40 字，再寫入 submission、photo 與 append-only timeline。提交列保存不可逆的員編 SHA-256 雜湊，舊回報碼 token 或缺少員編綁定的 submission 一律 fail closed。此流程只重用「員編屬於啟用名冊且裝置 ID 完全相符」的判定，不直接沿用 Approved Device 的全區授權結果。

照片 metadata API 只回傳 `client_photo_id, photo_name, revision, status`，不回傳 `photo_file_id`、`private_url` 或可直接存取的 Drive URL。`audit_photo_read` 在 GAS 端先驗證：督導必須持有既有 PT token；門市必須同時持有綁定該 submission 的短效 token 與 edit token。驗證後才讀取私有 Drive Blob，回傳 `mime_type + base64`；前端轉成 Blob/Object URL 顯示，換頁、重畫、刪除、登出或卸載時 revoke。Drive 檔案不開啟連結分享。

`ensurePrivatePhoto()` 是 async function，快取命中、進行中請求與新讀取三種路徑都固定回 Promise。門市縮圖、督導縮圖與 `Promise.all` 放大預覽共用此合約；`pagehide`／`beforeunload` 會釋放 Blob URL。`audit-report.html` 對 JS／CSS 使用 release query，避免 iPhone Safari 混用前後版本資產；既有 root-scope Service Worker 另 bump cache namespace，並對稽核 HTML 改為 network-first，避免曾開過的舊頁殼卡住。

督導端 `audit_cancel` 沿用 PT token，前端有二次確認。取消只把 submission 設為 `cancelled` 並 append `cancelled` 事件，不刪 Sheet row、照片或歷史；overview 將該店重新顯示為未回報，門市可用新的 submission 回報。這也是裝置草稿或 edit token 遺失時的復原方式。

`gas/AuditReport.gs` 是獨立模型，不寫入巡店、巡店到離店、半月督導檢查、每日回報、KPI、台獎或班表分頁。`gas/Code.gs` 只包含十三個隔離 `audit_*` `doPost` action dispatch（第十三個為 UAT-only `audit_roster_probe`）；既有 action 合約不變。照片資料夾依「批次／店點／項目」建立，檔案不設公開分享。

九店稽核 store value 使用正式 canonical ID：酒泉 `DNB10062`、永吉 `DNB10082`、復興南 `DNB10094`、杭州南 `DNB10146`、萬大 `DNB10168`、通化 `DNB10174`、大稻埕 `DNB10284`、三創 `DNB10307`、六張犁 `DNB10440`。`PT_STORES` 仍只用來驗證既有店名存在；稽核不採用其中萬大的 provisional code 或通化的 legacy code，也不修改巡店既有合約。

## Sheet 與 Drive 規劃

首次由 Apps Script 編輯器手動執行 `setupAuditReportStorage()`，在既有 `SPREADSHEET_ID` 建立：

- `稽核批次`：`batch_id, batch_name, starts_on, due_on, active, created_at, updated_at`
- `稽核回報提交`：`batch_id, batch_name, submission_id, store_id, store_name, inspector_name, auth_employee_hash, edit_token_hash, status, submitted_at, reviewed_at, updated_at, revision, created_at`
- `稽核回報`：`batch_id, batch_name, submission_id, store_id, store_name, inspector_name, item_id, item_name, photo_file_id, private_url, photo_name, client_photo_id, note, status, reviewer_comment, submitted_at, reviewed_at, updated_at, revision, created_at`
- `稽核回報紀錄`：`event_id, event_key, batch_id, submission_id, store_id, store_name, inspector_name, item_id, item_name, event_type, status, comment, actor, revision, created_at`

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

- Node contract：`242/242`；既有稽核 Approved Device／audit-only 安全案例全數保留，並新增 UAT probe 唯讀／正式批次拒絕、敏感欄位不回傳及 target 名冊列完全不變的契約測試。
- 完整 Chromium `168/168`；稽核 WebKit（Safari 等價）`15/15`，其中包含 15 張 server photos 經重新驗證、`audit_status` 恢復、縮圖／放大及 Blob URL revoke，console 無 `.then is not a function`。
- 完整 WebKit 在 `file://` 為 `166/168`，兩案是既有 Liam Supervisor App file-origin CORS console gate；改以本機 HTTP 執行為 `167/168`，CORS 兩案通過，唯一失敗為既有 Patrol 測試 fixture 在 HTTP route 下回「巡店摘要月份或九店 contract 不完整」。同一 Patrol 案在完整 Chromium與 WebKit `file://` 均通過，本 PR 沒有修改 Patrol 檔案或 fixture；不得把環境差異記成產品全綠。
- 390×844 無橫向 overflow；多圖、分次加入、刪除／預覽、10 張限制、部分失敗重試、冪等、own-submission scope、PT auth／逾時重驗、單項補件與逐項覆核皆有自動測試。
- 提醒圖卡測試涵蓋 DOM 順序、門市／督導顯隱、非 base64 路徑、圖片尺寸、載入失敗 fallback、點擊／Enter／Space、單張導覽隱藏、關閉／ESC／焦點回復與手機 overflow。
- 安全案例涵蓋匿名開始／上傳／刪除／送出／讀取拒絕、未知／未核准／停用員編裝置、過期 token、偽造店點、同店不同員編與跨門市 token／edit token 越權拒絕；並驗證遮罩名不會成為正式姓名、實際姓名必填且正確寫入 submission／photo／timeline、員編跨頁保留但 token 不持久化、不呼叫全區 snapshot/access、API 僅回安全 profile、PT 保護的私有 Blob 讀取、DOM/API 無 Drive view URL／file ID，以及取消後證據保留與新 submission。
- canonical 回歸另固定檢查九店 ID，拒絕 `xxx` placeholder 與通化 legacy `DNB10059`；正式 smoke 必須讀回萬大 `DNB10168`、通化 `DNB10174` 才可繼續。
- 截圖：`docs/screenshots/audit-report-20260820/audit-report-mobile-390x844.png`、`audit-report-quality-reminder-desktop.png`、`audit-report-supervisor-desktop.png`。截圖無正式姓名、正式照片或正式資料。

## 未來獲准後的部署步驟

1. 重新 fetch，確認部署來源是屆時最新 `main`，且只含本 PR 的增量；比對 `gas/Code.gs` 既有關鍵函式與 action 完整。
2. 在合併／部署前，以當下正式 main 建立 annotated rollback tag，例如 `rollback/audit-cleaning-predeploy-20260820`，並記錄現行 GitHub Pages commit、GAS deployment ID／version。
3. 在既有 Apps Script 專案更新 `AuditReport.gs`，把 repo 最新 `gas/AuditReport.gs` 內容存入；`Code.gs` 必須以正式 editor 最新版本為底，只確認十三條 audit dispatch 完整，絕不以舊整檔覆蓋。保留最新 `HalfMedia.gs` 與其他檔案。
4. 確認既有 Approved Device 名冊設定與 `DASHBOARD_ROSTER_SHEET_ID` 可用，且 Script Properties 已有 `PT_KEY`、`DASHBOARD_PRIVATE_FOLDER_ID`；不再需要 `AUDIT_REPORT_SUBMIT_CODE`。如要用另一個私有根目錄，再設定 `AUDIT_REPORT_FOLDER_ID`。所有秘密只在 Script Properties，不貼入 repo、HTML、JavaScript 或文件。
5. 四個分頁與私有資料夾已初始化；PR #67 部署期間維持 UAT 批次唯一 `active=TRUE`、正式批次 `active=FALSE`，不得再次執行會破壞證據的初始化或刪除。
6. 「部署 → 管理部署作業 → 編輯 → 新版本」建立 GAS 新版本。記錄新 version；GAS 存檔不算部署。
7. 以測試批次做門市三項送出、單項退回、補件、三項通過；核對 Sheet、Drive 私有權限、冪等重送、PT token 過期重驗與讀回。
8. 合併／發布 GitHub Pages 後，以 iPhone Safari 390×844 與桌面 Chrome 做正式 smoke；確認後才把狀態提升為已部署／已驗收。

Rollback：Pages 回到上述 rollback tag 對應 commit；GAS 在「管理部署作業」把既有 deployment 指回部署前 version。新建的四個 Sheet 與私有照片資料夾先停用批次並保留證據，不自動刪除。若需資料刪除，另取得 Liam 明確授權。

## 安全與限制

- 前端無 `PT_KEY`、Drive ID／URL、正式員工名單、正式照片或正式資料；員編只作本機自動帶入，不寫入稽核草稿或後端資料列，audit token 只留在分頁 session。
- 短效稽核 token 綁定 `employee hash + batch + store + submission`，只允許稽核門市 action；`submission_id + edit token`、`client_photo_id`、事件 `event_key` 與 Script Lock 共同避免越權與重複提交、照片及覆核事件。
- 單項最多 10 張，server 再驗證 image MIME 與壓縮後 10 MB 上限。
- 正式批次維持未啟用；PR #67 的自動測試、GAS／Pages 發布與 Liam 實機 UAT 是三個不同 gate。只有 Liam 完成 roster mapping、Safari 15 張照片恢復及督導退回／補件／通過／取消驗收後，才能把 UAT 設為 `FALSE`、正式批次設為唯一 `TRUE`。
