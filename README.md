# 北一二B 每日回報系統

單一檔案 HTML App（`index.html`），部署於 GitHub Pages。後端為 Google Apps Script（`gas/Code.gs`）＋ Google Sheets。

## 每日移動里程

- `patrol.html` 的里程頁在督導驗證後，直接使用既有受保護 `ptdetail`，依目前月份、北一二B九店與每頁 100 筆完整分頁讀回；不需要貼上巡店資料、匯入 JSON，也不新增第二套 GAS API。
- 里程只從本次成功讀回的正式明細推導；載入中、token 逾時、月份／店點／分頁 contract 不一致或筆數未讀完整時一律 fail closed，不以 `rawDetails`、舊月份或空資料代替。
- 登出會清除本頁正式明細快取；reload 或重新登入後會重新讀取 `ptdetail`。預設月份沿用正式巡店頁目前月份，無值時才依 Asia/Taipei 當月決定，不再因硬編碼六月對帳基準跳回六月。
- 六月受控對帳仍固定為 11 天／74.5 KM；正式雲端資料不足的三天只依既有受控基準補入，不改寫巡店 Sheet。此次修正只改前端與測試，`gas/Code.gs` 及正式資料 0 diff。

## 稽核回報專區

- `audit-report.html` 是九店手機優先的環境清潔回報與督導逐項驗收頁；入口位於 `home.html`。
- `gas/AuditReport.gs` 使用獨立的批次、提交、照片與 append-only 時間軸模型；只在 `gas/Code.gs` 增加隔離的 `audit_*` POST dispatch，不改巡店、半月檢查、每日回報、KPI、台獎或班表資料列。
- 門市以既有員編＋Approved Device 驗證，後端只讀取該員編的啟用名冊與裝置綁定，換取 30 分鐘、綁定員編雜湊／批次／門市／`submission_id` 的 audit-only token；不回傳或沿用 KPI／全區私有戰情權限。店點依名冊固定，遮罩姓名只作「名冊辨識」提示；實際檢查人員姓名仍由門市必填，經後端清理與長度驗證後寫入正式紀錄，不綁入 token。員編可在下次開頁自動帶入，audit token 只保留於該分頁 session；`audit_start`、上傳、刪除、送出與狀態讀取還會再核對 `submission_id + edit token`。
- 私有照片只可經 `audit_photo_read` 讀取：督導驗證既有 PT token，門市驗證稽核 token 與 submission ownership；GAS 讀取 Drive Blob 後回傳 MIME＋base64，前端只建立暫時 Blob URL 並釋放，不取得 Drive URL／file ID。
- 督導可取消／重設遺失草稿或 edit token 的舊回報；舊照片與 append-only 事件保留為 `cancelled`，該店才能建立新的 submission。
- 門市填報頁在批次資訊後提供品質管理整理提醒原圖，可點擊或以鍵盤開啟單張全螢幕預覽；督導模式不顯示此圖卡。
- 九店稽核值使用既有正式 canonical ID；其中萬大為 `DNB10168`、通化為 `DNB10174`，不沿用巡店相容層的 provisional／legacy code。介面仍統一顯示「台北三創」。
- UAT 批次另提供 Trusted Employee 專用、唯讀的「員編名冊測試」：只回傳啟用狀態、遮罩姓名、名冊店點、九店映射結果與是否已有 Approved Device，不修改裝置綁定、`last_login_at` 或換發受測同仁 token。正式批次與一般員工不具此入口／API 權限。
- 私有照片重新載入統一走永遠回傳 Promise 的 `ensurePrivatePhoto()`；照片仍只由 `audit_photo_read` 讀成暫時 Blob URL，頁面卸載時釋放。正式批次維持關閉，部署與 Liam UAT gate 見 [`docs/AUDIT_REPORT_HANDOFF.md`](docs/AUDIT_REPORT_HANDOFF.md)。

## 智慧營運中心 Phase 1A（未部署）

- `kpi-battle.html` 是 KPI 戰情的獨立入口殼層；它在同源載入 `index.html` 的既有 KPI 面板，因此沿用同一套員編／核准裝置權限、資料來源、計算與 fail-closed 行為，不建立第二套公式、API 或快取。
- `home.html` 同仁大廳以「KPI 戰情」為第一順位入口；原 `index.html` KPI 戰情與每日回報、`kpi.html`、`kpitry.html`、店務檢查連結均保留。
- Phase 1A 只完成隔離分支、本機測試與畫面比對；未合併、未部署，也不代表 Liam 已正式驗收。

## 功能頁籤

- `📝 填報（店長）`：門市每日回報；台獎填報欄位已更新為目前協作的 10 台機款。
- `📊 彙整大盤（督導）`：當日回報與門市彙整。
- `🕐 日期回放`：單日歷史回放，僅保留 16:00 與 21:00 正式時段。
- `👤 個人追蹤`：個人回報與追蹤牆。
- `🏆 KPI戰情`：以正式每日戰報呈現北一二B與各店KPI總達成、公司排名、A999／A1399／好速／R1399，並標示相較前一日的 DOD；各項明細固定顯示「實績／月目標／100%日目標／差異」，日目標依報表資料截至日計算。個績排名提供遮罩姓名、總達成率與排名 DOD，以及個人台獎預估／獎金排名。
- `🏅 台獎戰情`：督導獎金置頂呈現；每店顯示店長／督導預估、前三項優先補量與完整 10 機款下一獎階。補量規則先救差 1～3 台的店長 50% 門檻，其餘依可增加獎金除以所需台數排序。

兩個戰情頁籤都受保護：首次以「員編＋啟用碼」提出裝置綁定，必須由管理者核准；核准後，該員編只可在該一台手機或電腦輸入員編登入。重新核准新裝置時，舊裝置會立即失效。登入後可查看所有店點與個人 KPI／獎金資料，但所有姓名一律維持遮罩。
- `📈 區間彙整`：讀取 OneDrive 每日報表的 `上線數KPI_每日上線`，呈現 AQ／A999／好速／RT／R1399 等日動能趨勢、掛蛋與下滑提醒。
- `🏅 台獎提醒`：讀取最新 10 台機款的店點實際、目標、達成率與缺口。

## 分析資料更新

每日報表流程可用下列工作區腳本，把 OneDrive `TWM每日戰報` 的日期報表整理成網站資料；原始 Excel 不會被修改：

```bash
python3 /Users/liamlu/Downloads/liam-agent/report-automation/work/build_github_pages_data.py
```

輸出會更新：

- `data/daily-momentum.json`
- `data/phone-awards-latest.json`

目前產生的 KPI／台獎 JSON 都保留在本機並由 `.gitignore` 排除；不得把它們放進 GitHub Pages。公開介面更新才可用 `.claude/scripts/auto-push.sh` 發布。

## KPI／台獎私有戰情部署與每日更新

私有資料已建立在 Google Drive 的系統管理資料夾，不分享給同仁，也不提交 GitHub。Google Apps Script 透過該資料夾提供登入後的快照。

第一次啟用時：

1. 將 `gas/Code.gs` 儲存到既有 Apps Script 專案。
2. 在「專案設定 → 指令碼屬性」設定：
   - `DASHBOARD_PRIVATE_FOLDER_ID`：私有 Drive 資料夾 ID。
   - `DASHBOARD_ADMIN_SECRET`：僅區主管持有的高強度密碼；不可放在程式或聊天室。
   - `DASHBOARD_BOOTSTRAP_CODE`：首次綁定碼（目前為 `0935`）。
3. 在 Apps Script 編輯器手動執行 `setupPrivateDashboard()` 一次，授權並建立登入名冊試算表。
4. 「部署 → 管理部署作業 → 編輯 → 新版本」重新部署 Web App；執行身分選自己、存取權選任何人。這只公開驗證入口，實際資料仍會驗證員編與綁定裝置。

每天兩封 Outlook 信都寄出、且 `寄件備份` 驗證附件成功後，才可把同一批資料發布到私有 Drive：

```bash
PRIVATE_DASHBOARD_GAS_URL='既有 Apps Script Web App URL' \
PRIVATE_DASHBOARD_ADMIN_SECRET='僅存於本機安全環境的管理者密碼' \
node /Users/liamlu/Downloads/liam-agent/report-automation/work/publish_private_dashboard_snapshot.mjs
```

這個命令會重新生成遮罩後 KPI／台獎快照與登入名冊、同步到私有 Drive；任一段失敗即非 0 結束，不會改動公開 GitHub 資料。

## patrol.html 受保護工作頁籤與個資邊界

`patrol.html` 除原有巡店看板外，另有兩個使用既有 GAS／Google Sheet／私有 Drive
資料流的工作頁籤；Microsoft 365／MSAL 路線已停用：

- `每月班表`：透過 GAS `sread` 讀取班表封存，支援每日、每週、每月檢視與 Excel `.xls` 匯出。
- `半月督導檢查`：固定第 1–18 項，透過 `hread`／`hwrite` 保存檢查、缺失與改善；照片／影片由 `half_media_upload` 存入私有 Drive，Excel 保留私有附件連結。

GitHub Pages 只放介面程式，不提交員工姓名、班表、檢查紀錄或媒體原檔。**2026-07-29 起
`ptAuthorized()` 已改回真的檢查**（`ptread`／`ptwrite`／`sread`／`hread`／`hwrite` 都要
`PT_KEY` 才能通過），因為新增的導覽首頁 `home.html` 會給門市同仁用來跳轉，Liam情報站的
卡片也會被看到，免密碼不再安全。媒體 POST 仍另外由 `HalfMedia.gs` 驗證同一組 `PT_KEY`。
`PT_KEY` 真實密碼只存在 GAS 編輯器，repo 只放 `CHANGE_ME` 佔位字。未取得 Liam 明確授權前，
不得自行改權限、資料欄位或既有串接。

## 文件與完成狀態

- 所有 AI 開工前先讀 `../AI協作中心/00_WEBSITE_INDEX.md`、`AI_WORKFLOW.md`、目標網站正式
  `PROJECT_HANDOFF.md`，再讀本 repo 的 `AGENTS.md`、`CLAUDE.md` 與 `docs/COLLAB-LOG.md`。
- 展示頁、占位資料、HTTP 200、本機測試、GitHub Pages／GAS 部署、正式資料驗證與
  Liam／門市驗收是不同狀態，不得只因頁面可開啟就寫成「已完成」。
- 不確定或疑似舊版的檔案先保留並標記，不直接刪除；有意義的工作完成後更新交接文件與協作日誌。
