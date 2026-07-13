# 北一二B 每日回報系統

單一檔案 HTML App（`index.html`），部署於 GitHub Pages。後端為 Google Apps Script（`gas/Code.gs`）+ Google Sheets。

另有 `patrol.html`（督導巡店追蹤系統）：貼上巡店明細表 → 33 項檢核看板。
與 index.html **共用同一個 GAS 部署**（localStorage `bei12b_gas_url` 也共用），
資料存「巡店明細」工作表，API 為 `?action=ptread`（fetch GET 讀全部）與
`?action=ptwrite&payload=...`（JSONP 寫入，前端每 10 筆分批送避免網址過長；
GAS 端以 fillTime+store+item 為唯一鍵去重，content 欄不上傳、由題號 ITEM_TEXT 還原）。
巡店讀寫需通行碼：GAS 端 `PT_KEY`（repo 只放 `CHANGE_ME` 佔位字，實際密碼只改在
GAS 編輯器裡，**不要 commit**），前端存 localStorage `bei12b_pt_key`，錯誤會重新詢問。

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

## 自動檢查未回報 + Email 通知

`gas/Code.gs` 有 `checkSegAndNotify()`：每天 16:20、21:20（台北時間）由時間觸發器自動比對
「回報資料」工作表，有未填門市寄警示信、全數完成寄報平安信（含 A999/好速/R1399 進度與最佳/最差店點），
收件人為 `NOTIFY_EMAIL`。啟用方式：GAS 編輯器執行一次 `setupTriggers()`（會要求授權）。
注意：**時間觸發器跑的是編輯器最新存檔的程式碼，不需要重新部署 Web App**；
只有 `doGet` 相關改動才要重新部署。門市清單 `STORES` 在 GAS 端也有一份，開新店時記得同步。

另有 `checkAwareAndNotify()`：每月 15 號 09:00 檢查「巡店明細」的知悉題（19-33）
本月進度，未完成門市寄提醒信（20 日前需全數勾核）。啟用：執行一次 `setupAwareTrigger()`。

## 常用檢查清單（改動資料欄位時）

1. `index.html`：表單 input（`f_` 前綴 id）+ `FIELDS` 陣列 + 彙整表格 cols
2. `gas/Code.gs`：`FIELDS` 陣列同步
3. 重新部署 GAS（新版本！）
4. 用 `?action=debug` 確認欄位已補上
5. 填一筆測試資料 → `?action=read` 確認讀得回來
