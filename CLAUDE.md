# 北一二B 每日回報系統

單一檔案 HTML App（`index.html`），部署於 GitHub Pages。後端為 Google Apps Script（`gas/Code.gs`）+ Google Sheets。

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
**讀寫免通行碼**：`ptAuthorized()` 自 2026-07-23 起固定 `return true`，前端雖仍會跳出
「請輸入通行碼」提示框、`PT_KEY` 也仍會送出，但後端不檢查內容——這是 Liam 明確要求維持的現況
（2026-07-29 再次確認過，不要復原），純粹是圖方便，**不是真的有密碼保護**，不要誤以為有資安防線。

另有 `kpi.html`（KPI 試算網站，2026-07 新增）：單檔前端，同仁 KEY 今日上線數即可
試算各項目與「明日 KPI 總進度達成率」。計分公式由「KPIPI資料設定」模板＋0720 日報
反推驗證（逐項 100% 吻合、總分 7/9 店完全一致，殘差由校正值吸收），細節見
`docs/COLLAB-LOG.md` 2026-07-20 兩則。**資料不內嵌**（repo 公開）：登入採
Codex 私有戰情同一套員編＋裝置綁定授權（GAS `kpicalc_access`），資料存私有 Drive
`north12b-kpicalc-private-latest.json`。**每日更新全自動**：GAS `kpiCalcAutoUpdate()`
時間觸發器每天 11:00 掃日報資料夾（檔名 `MMDD.xlsx`）自動解析發佈＋email 通知
（啟用需 Drive API v3 服務＋執行 `setupKpiCalcAutoUpdate()`）；手動備援走 kpi.html
進階「督導發佈區」上傳 JSON（`kpicalc_publish`，管理者密碼）。localStorage 鍵：
`bei12b_kpi_v1`（試算輸入）、`bei12b_kpi_emp`（員編）；裝置 ID 與戰情共用。

## 跨 AI 協作

本專案同時由 Claude 與 Codex 等多個 AI 助手協作維護：
- `AGENTS.md`：給所有 AI 協作者的通用指示（Codex 會自動讀取）。
- `docs/COLLAB-LOG.md`：共享工作日誌。**完成有意義的工作（新功能、修 bug、踩到新坑）後，
  在該檔最上方追加一則紀錄**，讓其他助手接手時有脈絡；長期性的坑同步記進本檔「踩過的坑」。
- 開工前先看日誌最近幾則，避免重工或重踩已知的坑。

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
同理 `savedAt` 這類時間字串會被轉成 1899-12-30 基準的 Date，顯示時要注意。

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

## ⚠️ 日報格式會變（2026-07-28）

0728.xlsx 少了 `上線數KPI_個人達成率_明細`（26 張表變 25 張），個人資料整個沒來源。
`kpiCalcParseReport()` 已加回退：找不到該表就改用 `上線數KPI_個人達成率_店點`
（依門市分群的版面，內容經 0727 交叉驗證逐項完全一致）。兩個要補的落差：
店代碼靠店點表的「店名→代碼」對照，職稱靠 `kpiCalcPrevRoles()` 沿用上一份已發佈 JSON。
※ `_店點` **不是固定 4 欄一段**（合併儲存格會讓 Netflix 那段佔 5 欄），
所以用 `kpiCalcBandsPairs()` 逐段偵測「實際數／目標數／權重」，不要用 `c += 4`。
解析失敗時第一步先印 `wb.sheetnames` 比對，不要預設是欄位錯位。

## 常用檢查清單（改動資料欄位時）

1. `index.html`：表單 input（`f_` 前綴 id）+ `FIELDS` 陣列 + 彙整表格 cols
2. `gas/Code.gs`：`FIELDS` 陣列同步
3. 重新部署 GAS（新版本！）
4. 用 `?action=debug` 確認欄位已補上
5. 填一筆測試資料 → `?action=read` 確認讀得回來
