# 北一二B 每日回報系統

> 本文件保存現行產品契約與技術注意事項；Agent 工作規則只以 `AGENTS.md` 為準。日期型事故內容僅供追溯，不會自動成為後續任務的限制。

## 2026-09 店長個績來源契約

- 2026-09 起店長／代理店長納入個績；其總績效、實績、目標及達成率必須來自 `kpicalc_access`，原始來源為「上線數KPI_個人達成率_明細」（缺表時才使用既有個人店點版回退）。
- 店長的「個績」不可用 `store_calc[店點]`、店點總 KPI 或店績排名代替。救援／每日 builder 也必須先依姓名取得個人列，不能因 `category == 店長` 改讀店點列。
- dashboard 私有快照只有在 `kpiBattle.personal_semantics == "individual-v1"` 時，前端才可採用店長個人排名與 DOD；無標記的舊快照視為語意不可信，不得覆寫 kpicalc 個績。

## 2026-08-23 D+1 KPI 補值門檻（取代舊的檔名推算）

- 現行正式 snapshot 的 `report_date`、`data_as_of_date` 與 `source_as_of_date` 都代表資料截止日；
  來源附件可在次日收到，例如截止 `2026-08-22`、來源 `0823.xlsx`。
- App／standalone controller 只比較三件事：snapshot 日期等於 `kpicalc` cutoff、snapshot
  `source_file` 等於 `kpicalc.meta.sourceFile`、KPI 結構完整。絕對不可由日期推算 `MMDD.xlsx`；
  否則會誤把有效 D+1 快照判成不同步，並隱藏公司排名、DOD、排名變動與加減分。

## 2026-08-05 固定 KPI／台獎日期契約

- `report_date` 是每日戰報／網站發布日；`data_as_of_date`（相容讀取 `source_as_of_date`）是來源資料截止日，兩者不得互換。0805 範例：發布日 `2026-08-05`，截止日 `2026-08-04`，來源 `0805.xlsx`，區間 `2026/08/01 ~ 08/04`。
- KPI 實績、目標、店點總達成率、核心與逐項 KPI 必須取 `kpicalc_access`。公司排名、DOD、加掛、個人排名、個人台獎與保險搭售率，只能從同一次私有 snapshot 補入。
- 補值門檻必須同時通過：snapshot `report_date` 存在、snapshot 截止日等於 kpicalc 截止日、snapshot `source_file` 等於 kpicalc `meta.sourceFile`。任一項不符，顯示「尚未同步」，不得使用 localStorage、舊 snapshot 或舊附件。
- KPI 與台獎是否同次發布只比較 `report_date`。不可因為 KPI 截止日較早而隱藏同日發布的台獎。
- 本機快照建立器：`/Users/liamlu/Downloads/liam-agent/report-automation/work/build_github_pages_data.py` 必須輸出 `report_date`、`data_as_of_date`、`source_as_of_date`、`source_file`、`source_date_range`。2026-08-05 快照已驗證：公司排名 34、整體 KPI 1.097、加掛 12.35、9 店、41 人；台獎 13 款、10 列。
- KPI 店績的「保險搭售率」是實際搭售率，取同日、同來源的 `supplemental_daily_report`；快照要同時含整體與九店 `insurance_attach_rate`，來源不一致時不得補舊值。畫面位置固定接在「加掛」後。
- 台獎上方排序卡維持原規則。僅下方 13 款篩選器新增「北一二B整體」：選北一二B顯示每款督導 `80%／100%` 獎金，選店點顯示每款店長 `50%／100%` 獎金；兩者不可混算。
單一檔案 HTML App（`index.html`），部署於 GitHub Pages。後端為 Google Apps Script（`gas/Code.gs`）+ Google Sheets。

另有 `home.html`（**Liam 智慧管理中心**，導覽首頁，2026-07-29 新增）：給門市同仁跳轉用的入口頁，
四張卡片連到 `index.html` / `patrol.html` / `kpi.html` / `kpitry.html`。
**純靜態導覽頁——不含任何資料、不做登入、不呼叫 GAS**，權限由各系統自己把關
（Liam情報站需通行碼、KPI 試算需員編授權）。**不要因為「首頁方便」就把資料或密碼搬進來。**
※ 目前是獨立網址 `home.html`，沒有動 `index.html`（每日回報系統仍是預設首頁），
因為門市同仁的既有書籤都指向 index.html，換掉會讓他們每天多點一次。

另有 `kpitry.html`（KPI 通用試算版，2026-07 新增）：給**非本區同仁**的公開試算工具，
與 kpi.html **共用同一套計算引擎**但**完全不含個資**——無登入、無後端、無內建資料，
店點/姓名/目標/實績全部使用者自行輸入，內建的只有計算架構（`ARCH` 陣列：24 項加權項目
＋標準權重＋公式＋上下限）。權重進階可改，localStorage 鍵 `bei12b_kpitry_v1`，可公開分享。

另有 `patrol.html`（**Liam情報站**，2026-07-28 由「督導巡店追蹤系統」改名為「督導管理系統」，
2026-07-29 再改為現在的個人化名稱，因已含班表／半月檢查／檢查大盤，不只巡店）：
貼上巡店明細表 → 33 項檢核看板。改名只動前端 `<title>`／`<h1>`，GAS 的 `PT_TITLE`
（副標題，顯示「北一二B區 · 33 項檢核追蹤」）刻意不動，避免為改名多貼一次 Code.gs。
與 index.html **共用同一個 GAS 部署**（巡店網址存 localStorage `bei12b_pt_gas_url`，
相容回退舊的 `bei12b_gas_url`）。
**2026-07-29 起確定不再分享給其他督導**（原本 `patrol-guide.html` 是為此設計的操作手冊，
現已停止維護／過時，內容仍在但不代表目前狀態——不用再因為它而擔心「其他督導看到 Liam 的個人化名稱」這件事）。
資料存「巡店明細」工作表，API 為 `?action=ptread`（fetch GET 讀全部）與
`?action=ptwrite&payload=...`（JSONP 寫入，前端每 10 筆分批送避免網址過長；
GAS 端以 fillTime+store+item 為唯一鍵去重，content 欄不上傳、由題號 ITEM_TEXT 還原）。
**讀寫需通行碼（2026-07-29 恢復）**：`ptAuthorized()` 曾在 2026-07-23～07-29 之間固定
`return true`（免密碼，圖方便，Codex 當時的記錄有標註「未取得 Liam 明確指示前不得自行改回」——
這次是 Liam 本人在 07-29 明確要求恢復，不是 AI 自行決定），2026-07-29 起**改回真的檢查**
（`return PT_KEY !== 'CHANGE_ME' && e.parameter.key === PT_KEY`）——因為導覽首頁
（工具導覽／Liam 智慧管理中心）會給門市同仁用來跳轉到其他系統，Liam情報站的卡片也會被看到，
所以巡店/半月檢查/班表這幾項必須真的擋人。**`PT_KEY` 的真實密碼只存在 GAS 編輯器裡，
repo 永遠只放 `CHANGE_ME` 佔位字**——貼 Code.gs 進 GAS 後，記得把 `PT_KEY` 改成實際密碼再存檔部署，
不然 `ptAuthorized()` 會擋下所有人（包含 Liam 自己）。媒體 POST 另外由
`HalfMedia.gs` 的 `halfMediaAuthorized()` 驗證，用的也是同一組 `PT_KEY`。

### 2026-07-15 Microsoft 365 路線（停用版）

曾規劃以 Microsoft 365／MSAL、`scheduleApi`／`inspectionApi` 與公開班表產物提供班表及
半月檢查。2026-07-21 已決定停用；目前正式基準是既有 GAS／Google Sheet／私有 Drive
路線。相關歷史只可作追溯，不可當成現行部署說明。

另有 `kpi.html`（KPI 試算網站，2026-07 新增）：單檔前端，同仁 KEY 今日上線數即可
試算各項目與「明日 KPI 總進度達成率」。計分公式由「KPIPI資料設定」模板＋0720 日報
反推驗證（逐項 100% 吻合、總分 7/9 店完全一致，殘差由校正值吸收），細節見
`docs/COLLAB-LOG.md` 2026-07-20 兩則。**資料不內嵌**（repo 公開）：登入採
Codex 私有戰情同一套員編＋裝置綁定授權（GAS `kpicalc_access`），資料存私有 Drive
`north12b-kpicalc-private-latest.json`。**每日更新全自動**：GAS `kpiCalcAutoUpdate()`
時間觸發器每天 11:00 掃日報資料夾（檔名 `MMDD.xlsx`）自動解析發佈＋email 通知
（⚠️ `.atHour(11)` 沒有 `.nearMinute()`，GAS 會在 **11:00–12:00 任意時間**觸發，實測穩定
落在 **11:51**；查當天結果請等台北 12:00 後，別在 11:20 就判定失敗——已誤判過一次）
（啟用需 Drive API v3 服務＋執行 `setupKpiCalcAutoUpdate()`）；手動備援走 kpi.html
進階「督導發佈區」上傳 JSON（`kpicalc_publish`，管理者密碼）。localStorage 鍵：
`bei12b_kpi_v1`（試算輸入）、`bei12b_kpi_emp`（員編）；裝置 ID 與戰情共用。

## 架構

- **前端**：`index.html`（HTML/CSS/JS 全在一個檔案），localStorage 存個人回報資料
- **後端**：GAS Web App，讀寫 Google 試算表「北一二B每日回報」的「回報資料」工作表
- **試算表 ID**：`10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA`
- **GAS URL**：寫死在 `index.html` 的 `GAS_URL`，也可由使用者在 App ⚙️ 設定覆蓋（localStorage `bei12b_gas_url`）

## ⚠️ 踩過的坑（2026-07 台獎手機資料消失事件）

門市填的台獎手機數字一直沒出現在彙整，查了很久，其實是**三個問題疊加**：

### 1. 試算表缺欄位 → 資料無聲丟失
GAS 依標題列欄名寫入。前端新增欄位（如 `tw_pixel10`）後，若試算表標題列沒有對應欄，
資料就默默不存，不會報錯。
**對策**：`gas/Code.gs` 的 `getSheet()` 已加自動補欄位邏輯（`FIELDS` 清單比對標題列，缺的自動補在最右邊）。
前端加新欄位時，記得同步更新 `gas/Code.gs` 的 `FIELDS` 陣列，並重新部署 GAS。

### 2. Google Sheets 日期是 Date 物件，字串比對永遠 false
試算表會把 `2026-06-27` 自動轉成 Date 物件，`String(dateObj)` 變成
`Sat Jun 27 2026 ...`，跟查詢參數 `"2026-06-27"` 對不上 → 讀取永遠回空 `{}`。
**對策**：用 `toDateStr()`（`Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd')`）統一轉換再比對。
`savedAt` 是純時間序號，讀取時必須從同一資料範圍的 `getDisplayValues()` 取顯示時間；
不可套用 `toDateStr()`，否則會被轉成 `1899-12-30` 基準日。

### 3. GAS「存檔」≠「部署」——最容易中招
在 Apps Script 編輯器貼上新程式碼、Ctrl+S 存檔後，**線上跑的還是舊版**。
必須：部署 → 管理部署作業 → ✏️ 編輯 → 版本選「**新版本**」→ 部署，才會生效。
驗證方式：開 `{GAS_URL}?action=debug`，若回 `unknown action` 就是舊版還在跑。

### 其他注意事項
- GAS 用 `SpreadsheetApp.openById(SPREADSHEET_ID)`，不要用 `getActiveSpreadsheet()`
  （獨立部署的 script 抓不到 active spreadsheet，會無聲失敗）
- 若執行環境無法連線 `script.google.com`，改用可用且已授權的環境驗證，或精確回報尚未完成的正式端點檢查。`?action=ping` / `?action=read&date=...&seg=16` / `?action=debug` 是現成測試端點。
- 前端寫入用 JSONP（script tag + callback），因為 GAS 的 CORS 限制
- `5cb0fba` 加了 localStorage 影子備份（`bei12b_shadow_*`），fetch 後會把本機 `tw_` 欄位
  合併進雲端資料——這是同裝置的備援，跨裝置仍靠 GAS

## 2026-07-25 自動化被舊版覆蓋事件（歷史 evidence）

當時 `gas/Code.gs` 被舊副本整檔覆蓋，造成 `kpiCalc*` 時間觸發器停擺；完整經過保留在 `docs/COLLAB-LOG.md`。現行長期防護已集中於 `AGENTS.md` 的最新版本、最小差異與 production 驗證規則。本節不另建立固定開工流程或能力限制。

## 自動檢查未回報 + Email 通知

`gas/Code.gs` 有 `checkSegAndNotify()`：每天 16:30、22:00（台北時間）由時間觸發器自動比對
「回報資料」工作表，有未填門市寄警示信（含已回報門市的 N12B 加總：KPI 均值＋A999/A1399/好速/R1399）、
全數完成寄報平安信（含 A999/好速/R1399 進度與最佳/最差店點），收件人為 `NOTIFY_EMAIL`
（存在指令碼屬性，不進 repo）。啟用方式：GAS 編輯器執行一次 `setupTriggers()`（會要求授權）。
注意：**時間觸發器跑的是編輯器最新存檔的程式碼，不需要重新部署 Web App**；
只有 `doGet` 相關改動才要重新部署。門市清單 `STORES` 在 GAS 端也有一份，開新店時記得同步。

另有 `checkAwareAndNotify()`：每月 15 號 09:00 檢查「巡店明細」的知悉題（19-33）
本月進度，未完成門市寄提醒信（20 日前需全數勾核）。啟用：執行一次 `setupAwareTrigger()`。

另有 `sendWeeklyPatrolReport()`：每週一 08:00 寄巡店週報，夾檔 xlsx（暫存試算表→
export URL + OAuth token 匯出→寄出→刪除），含「檢核總表」與「本月明細」。
啟用：執行一次 `setupWeeklyReport()`（首次會多要 Drive/UrlFetch 授權）；試寄：`testWeeklyReport()`。

## ⚠️ 「Drive is not defined」＝忘了加 Drive API 進階服務（2026-07-29）

`kpiCalcParseReport()` 用 `Drive.Files.create()` 把 xlsx 轉成暫存 Google 試算表，這需要
GAS 編輯器左側「服務」手動加入「**Drive API**」進階服務——這一步**不在 `Code.gs` 檔案裡**，
貼程式碼、存檔、部署都不會補上它，是每個 GAS 專案要單獨設定一次的東西。
少了它，11:00 自動更新會寄「❌ 自動更新失敗：Drive is not defined」，**跟日報欄位格式無關**，
不要看到失敗信就去查解析器。加入服務後不用重新部署（時間觸發器用的，不是 `doGet`/`doPost`）。

## ⚠️ 日報格式會變（2026-07-28）

0728.xlsx 少了 `上線數KPI_個人達成率_明細`（26 張表變 25 張），個人資料整個沒來源。
`kpiCalcParseReport()` 已加回退：找不到該表就改用 `上線數KPI_個人達成率_店點`
（依門市分群的版面，內容經 0727 交叉驗證逐項完全一致）。兩個要補的落差：
店代碼靠店點表的「店名→代碼」對照，職稱靠 `kpiCalcPrevRoles()` 沿用上一份已發佈 JSON。
※ `_店點` **不是固定 4 欄一段**（合併儲存格會讓 Netflix 那段佔 5 欄），
所以用 `kpiCalcBandsPairs()` 逐段偵測「實際數／目標數／權重」，不要用 `c += 4`。
解析失敗時第一步先印 `wb.sheetnames` 比對，不要預設是欄位錯位。

## 資料欄位相容性

資料欄位變更需維持 `index.html` 的表單／`FIELDS`／彙整欄位與 `gas/Code.gs` 的 `FIELDS` 相容；驗證與部署範圍依 `AGENTS.md` 的風險原則決定，不使用固定五步流程。
