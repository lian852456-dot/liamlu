# 北一二B 每日回報系統

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
每月班表另有 `?action=sread`（讀）與 doPost `action=swrite`（寫，前端每 400 列一批，
第一批帶 `replace` 清該月舊資料、最後一批帶 `finalize` 更新「班表版本」）——
**門市／公司電腦連得到 GAS 但不一定連得到 docs.google.com，所以班表更新一定要保留這條不開試算表的路。**
**寫班表明細前一定要 `sh.getRange('A:L').setNumberFormat('@')` 把整欄鎖純文字**（版本表用 `'A:I'`）——
否則「版本月份 2026-08」「日期 2026-08-01」會被試算表自動轉成 Date，`readSchedule` 的
`String(版本月份)==='2026-08'` 永遠 false（2026-08-03 正式站踩過，見「踩過的坑」與協作日誌）。
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

## 跨 AI 協作

本專案同時由 Claude 與 Codex 等多個 AI 助手協作維護：
- 正式接手順序以 `../AI協作中心/00_WEBSITE_INDEX.md`、`AI_WORKFLOW.md` 與目標網站的
  `PROJECT_HANDOFF.md` 為準，再讀本檔、`AGENTS.md`、`README.md` 與協作日誌。
- `AGENTS.md`：給所有 AI 協作者的通用指示（Codex 會自動讀取）。
- `docs/COLLAB-LOG.md`：共享工作日誌。**完成有意義的工作（新功能、修 bug、踩到新坑）後，
  在該檔最上方追加一則紀錄**，讓其他助手接手時有脈絡；長期性的坑同步記進本檔「踩過的坑」。
- 開工前先看日誌最近幾則，避免重工或重踩已知的坑。
- 不重寫、不整檔覆蓋、不擅自改資料流；資訊不足時標記待確認。
- 展示版、占位資料、HTTP 200、本機測試、正式部署、正式資料驗證與使用者驗收必須分開記錄。

## 架構

- **前端**：`index.html`（HTML/CSS/JS 全在一個檔案），localStorage 存個人回報資料
- **後端**：GAS Web App，讀寫 Google 試算表「北一二B每日回報」的「回報資料」工作表
- **試算表 ID**：`10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA`
- **GAS URL**：寫死在 `index.html` 的 `GAS_URL`，也可由使用者在 App ⚙️ 設定覆蓋（localStorage `bei12b_gas_url`）
- **推送**：用 `.claude/scripts/auto-push.sh`（gh-direct remote 帶 token，繞過環境 proxy 改寫）

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
- 這個開發環境的 proxy **封鎖 script.google.com**（403），無法直接 curl/fetch 測 GAS，
  只能請使用者在瀏覽器開 URL 回傳結果。`?action=ping` / `?action=read&date=...&seg=16` / `?action=debug` 都是現成的測試端點
- 前端寫入用 JSONP（script tag + callback），因為 GAS 的 CORS 限制
- `5cb0fba` 加了 localStorage 影子備份（`bei12b_shadow_*`），fetch 後會把本機 `tw_` 欄位
  合併進雲端資料——這是同裝置的備援，跨裝置仍靠 GAS

## 🚨 踩過的坑（2026-07-25 自動化被無聲洗掉事件）※所有 AI 協作者必讀

**症狀**：kpi.html 的同仁實績從 0721 起停更 **4 天**沒人發現。日報 0722~0725 都有上傳、
同仁也照樣登入得到（看似正常），但數字全是舊的。

**根因**：有人把 `gas/Code.gs` **從舊基準整檔貼進 GAS 編輯器**，把 `kpiCalc*` 系列函式
洗掉了。因為：
- **時間觸發器跑的是「編輯器最新存檔」的程式碼** → 函式不存在 = 每天空轉，
  **而且不會寄失敗信**（連錯誤都沒有，所以完全無聲）
- **同仁登入走的是「已部署的網頁版本」**，跟編輯器脫鉤 → 前台看起來完全正常，
  掩蓋了後台已死的事實

**這是第二次同類事故**：先前 index.html 的門市動物圖案也被「整檔從舊版覆蓋」洗掉兩次
（見協作日誌 2026-07-17 / 2026-07-22）。**同一個坑，換一個檔案再犯一次。**

### 鐵則：貼 `gas/Code.gs` 進 GAS 前，必須這樣做

1. `git fetch origin && git checkout main && git pull` → **一定要用 repo main 最新版**，
   不要用自己分支的舊基準、不要用手邊留的舊檔
2. 貼上前**自我驗證關鍵函式都在**（少任何一個就是版本錯了，不要貼）：
   ```bash
   for f in kpiCalcAutoUpdate testKpiCalcAutoUpdate setupKpiCalcAutoUpdate \
            kpiCalcWatchdog setupKpiCalcWatchdog kpiCalcSetupSelf \
            kpiCalcAccess kpiCalcPublish kpiCalcLatestDataFile \
            checkSegAndNotify checkAwareAndNotify sendWeeklyPatrolReport; do
     printf "%-26s %s\n" "$f" "$(grep -c "function $f" gas/Code.gs)"
   done   # 全部都要是 1
   grep -c "action === 'ptread'\|action === 'hread'\|half_media_upload" gas/Code.gs  # 要 3
   ```
3. 貼完存檔後，**函式下拉選單要看得到 `testKpiCalcAutoUpdate`**（看不到＝貼到舊版）
4. 改動涉及 `doGet`/`doPost` → 必須「部署 → 管理部署作業 → ✏️ → **新版本** → 部署」
5. 若動到觸發器相關 → 重跑 `setupKpiCalcAutoUpdate()` 與 `setupKpiCalcWatchdog()`

### 為什麼「沒人發現」：巡檢從未啟用

`setupKpiCalcWatchdog()`（每天 12:30 巡檢，資料沒更新就寄信）**當時還沒被執行過**，
所以少了唯一的守門員。**任何人動完 GAS，請確認這個巡檢是啟用狀態。**

### 環境限制（決定誰能做什麼）

| 動作 | 雲端 Claude | 本機 AI | Liam |
|---|---|---|---|
| 讀 Drive 日報、解析、產生資料 JSON | ✅ | ✅ | ✅ |
| 改 repo 程式碼、git 推送 | ✅ | ✅ | ✅ |
| **呼叫 GAS 端點** | ❌ proxy 封鎖 script.google.com（實測 403 CONNECT） | 視環境 | ✅ |
| **GAS 編輯器貼碼／執行／部署** | ❌ 做不到 | ❌ 做不到 | ✅ 只有 Liam 能做 |
| **寫入私有 Drive 資料夾** | ✅（已實測可建檔，但**無刪檔權限**） | 視環境 | ✅ |

因此 `kpiCalcAccess` 已改為讀取私有資料夾中**最後更新最新**的
`north12b-kpicalc-*.json`（相容舊的 `-private-latest.json`）。
意義：**GAS 排程若失效，AI 可直接補 `north12b-kpicalc-<日期>.json` 救資料，不必等 Liam 進 GAS**。

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

## 每月班表更新 SOP（情報站 patrol.html 班表頁籤）

### 概要

每月初 Liam 會把 9 間門市的班表圖片上傳至 Google Drive，AI 負責：
讀圖 → 轉寫成結構化文字檔 → 跑 `build_schedule_rows.py` 產生 12 欄 TSV →
Liam 用一次性 GAS 腳本匯入「班表明細」工作表。**班表含全區同仁姓名，不進 repo。**

### 來源位置（Liam 保證不會變）

- **Drive 資料夾**：`北一二B＿巡店班表督導系統（私有主資料夾）` →
  `02_班表原始檔_每月`（folder ID `1RCvU_gUSd8qKxLpTr-5D3olKv5kOPQgP`）
- **格式**：每店一張 PNG（檔名 `IMG_XXXX.PNG`），圖片標題列含店名與 `115/MM班表`
- **目標試算表**：與每日回報同一本（`10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA`），
  工作表名 `班表明細`

### 9 店清單與排序

| 順序 | 門市 | 全名 | 2026-08 圖檔 | 人數 |
|------|------|------|-------------|------|
| 1 | 酒泉 | 台北酒泉直營店 | IMG_0097 | 3 |
| 2 | 萬大 | 台北萬大直營店 | IMG_0094 | 6 |
| 3 | 大稻埕 | 台北大稻埕直營店 | IMG_0091 | 3 |
| 4 | 復興 | 台北復興南直營店 | IMG_0093 | 5 |
| 5 | 三創 | 台灣大哥大數位生活台北三創直營店 | IMG_0092 | 10 |
| 6 | 杭州 | 台北杭州南直營店 | IMG_0096 | 5 |
| 7 | 永吉 | 台北永吉直營店 | IMG_0098 | 3 |
| 8 | 通化 | 台北通化直營店 | IMG_0095 | 5 |
| 9 | 六張犁 | 台北六張犁直營店 | IMG_0099 | 4 |

**圖檔編號每月可能不同**——以圖片裡的店名標題為準，不要假設 IMG 號碼固定。
**人數也可能變動**（調任、新進、離職）——以當月圖片上的人員列為準，異動請向 Liam 確認。

### 執行步驟

#### 步驟 1：讀圖 → 結構化文字檔

用 `mcp__Google_Drive__search_files` 找 `parentId = '1RCvU_gUSd8qKxLpTr-5D3olKv5kOPQgP'`
取得本月所有圖片，然後用 `mcp__Google_Drive__read_file_content` 或直接 Read
（Drive 會給 OCR snippet）逐張辨識，每店產一個 `.txt`，存放在 scratchpad（不進 repo）。

文字檔格式範例（酒泉 3 人）：
```
# store: 酒泉
# title: 台北酒泉直營店
# img: IMG_0097
# staff: 賴秋雯|店長, 李鴻文|副店長, 方彩羽|業務代表
# checkcols: 全 上班人數 休假人數 請假人數
1 六 病V 全 全 2 2 0 1
2 日 國V 全 全 2 2 1 0
...
31 一 全 全 全 3 3 0 0
```

- 每行格式：`<日> <星期> <每人班別...> <檢核欄...>`
- 班別直接抄圖：`全`、`國V`、`例V`、`休V`、`病V`、`特V`、`開會/上課`、`17:00-21:00`、
  `早`、`晚1`、`晚2`、`假晚1`、`假晚2` 等；圖上空白用 `-` 表示
- `checkcols` 後面列出來源表檢核欄標題（用來對帳），不同店的欄數不同
- `# NOTE:` / `# WARN` 行可加異動說明（人員調入、來源表已知錯誤等）

**轉寫注意事項**：
1. 三創人數最多（8~10人），晚班/早班/假晚班別多樣，**逐行逐格對**，不要跳
2. 萬大有 `17:00-21:00` 特殊班別（含空格的不要拆開）
3. `開會/上課` 會讓來源表 COUNTIF 重複計數——上班人數對不上時看 `全` 欄
4. OCR 容易把 `晚1` 讀成 `晚2`、`例V` 讀成 `倒V`——用該日上班人數反算驗證
5. 圖片模糊時放大到 6 倍逐格確認

#### 步驟 2：跑轉換腳本

```bash
python3 scripts/build_schedule_rows.py \
  --data-dir <scratchpad>/sched/data \
  --month 2026-09 \
  --out <scratchpad>/schedule_2026-09.tsv \
  --with-header
```

腳本自動推導：
- `出勤`：班別空白或以 `V` 結尾 → `否`，否則 `是`
- `值班主管`：職務是店長/代理店長/副店長 且 出勤是 → `是`
- `來源檔`：取 `# img:` 的值
- `匯入時間`：UTC ISO-8601

對帳結果會印在 stdout：每日上班人數 vs 來源表檢核欄，不一致的列出來手動確認。

#### 步驟 3：交給 Liam 匯入

產出 TSV 後，**把 TSV 檔案交給 Liam**（SendUserFile）。同時產出一份一次性 GAS 匯入腳本
（參考 8 月的 `ImportAugustSchedule.gs`），讓 Liam 在 GAS 編輯器貼上執行。

匯入腳本要點：
- 用 `setNumberFormat('@')` 防止 `"2026-09"` 被 Sheets 轉成 Date
- 寫入前先把同月份舊資料刪除（版本月份 = 目標月份的 rows）
- 寫入後呼叫 `SpreadsheetApp.flush()` 確認

#### 步驟 4：驗證

請 Liam 開情報站 → 班表頁籤 → 選新月份，確認：
- 每間店都有資料
- 人數正確
- 值班主管標記正確

### 踩過的坑

- **版本月份被 Sheets 自動轉 Date**：`"2026-08"` 寫入後變 Date 物件 →
  `readSchedule()` 字串比對永遠 false → 新月份不可見。根因修復：寫入時
  對版本月份欄 `setNumberFormat('@')`（強制文字格式）
- **圖檔名每月不固定**：不要 hardcode IMG 編號對應哪間店
- **人員異動**：8 月張恪誠從復興調到通化——每月讀圖時注意姓名/人數變動

## 常用檢查清單（改動資料欄位時）

1. `index.html`：表單 input（`f_` 前綴 id）+ `FIELDS` 陣列 + 彙整表格 cols
2. `gas/Code.gs`：`FIELDS` 陣列同步
3. 重新部署 GAS（新版本！）
4. 用 `?action=debug` 確認欄位已補上
5. 填一筆測試資料 → `?action=read` 確認讀得回來
