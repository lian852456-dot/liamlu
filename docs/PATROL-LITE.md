# Patrol Lite 分享版

## 目的

提供其他督導使用的簡易巡店工具，只保留：

1. 本機巡店報表匯入
2. 33 項巡店看板
3. 每日巡店路線與移動里程

不包含貼上巡店資料、半月檢查、班表、稽核、照片媒體、KPI 或其他 Liam 個人管理模組。

## 資料流

`本機 XLSX / XLS / CSV / TSV → 瀏覽器本機解析 → Server Preflight → 使用者確認 → Patrol GAS → 各督導自己的 Google Sheet → Readback → 看板更新`

來源檔不需要先放進 Google Drive。Google Sheet 只保留作為中央正式資料庫，讓同一位督導的手機、Mac 與其他裝置讀到一致資料。

## 分享邊界

- `patrol-lite.html` 可共用同一份公開前端。
- 每位督導必須使用自己的 Google Sheet 與 Patrol GAS deployment。
- 每位督導自行設定 `SPREADSHEET_ID`、`PT_TITLE`、`PT_STORES`。
- `PT_KEY` 只存在該督導自己的 Apps Script Script Properties，不可寫進 GitHub。
- 短效巡店 session 沿用現有 `patrol-session-v2` / `patrol-isolated-v1` 驗證。
- 前端只在 localStorage 保存 GAS URL，不保存通行碼；session token 只放 sessionStorage。

## 首次設定

1. 建立或複製巡店 Google Sheet，確保 Patrol GAS 有權存取。
2. 以 `patrol-gas/PatrolCode.gs` 為後端基準，設定該督導自己的 `SPREADSHEET_ID`、`PT_TITLE`、`PT_STORES`。
3. 在 Apps Script Script Properties 設定 `PT_KEY`。
4. 部署 Web App，取得 `/exec` URL。
5. 開啟 `patrol-lite.html`，在「連線設定」輸入 GAS URL 與通行碼登入。
6. 選擇巡店報表，確認解析筆數、新增筆數、既有筆數與衝突數，再執行寫入。

## 本機匯入安全規則

- 支援 `.xlsx`、`.xls`、`.csv`、`.tsv`、`.txt`。
- Excel 在瀏覽器本機以 SheetJS 解析；CSV/TSV 不依賴 SheetJS。
- 必須能辨識填表時間、店點與題號 1 至 33。
- 檔案內同一鍵值但內容不同時直接 blocked。
- 上雲前先用 `ptdetail` 做既有資料 preflight。
- 既有相同資料不重複寫入。
- 既有同鍵但內容不同時直接 blocked，Lite 不提供覆蓋模式。
- 新增資料寫入後必須再以 `ptdetail` readback；數量不一致不得宣稱完成。

巡店唯一鍵沿用正式 Patrol 後端：`fillTime + store + item`。

## 巡店看板

看板直接使用既有受保護 `ptsummary` contract，顯示：

- 本月巡店事件數
- 完成店數
- 待追蹤店數
- 各店 33 項完成度
- 缺少題號
- 最近巡店日期

因此 Lite 不複製另一套巡店判斷規則。

## 移動里程

Lite 使用 `ptmileage2` 的 `patrol-mileage-visits-v2` 事件資料，只自動整理日期與巡店順序。

其他督導的店點與距離不同，所以 Lite 不帶 Liam / 北一二B 的固定距離表。每個巡店日的公里數由使用者手動填入，僅存在該瀏覽器 localStorage，不回寫巡店 Google Sheet。

## 與 Liam 完整版的關係

- `patrol.html`：Liam 的完整管理版，保留既有功能與資料契約。
- `patrol-lite.html`：分享給其他督導的簡易版。
- 兩者可使用相同 Patrol API contract，但其他督導不可共用 Liam 的 Sheet、GAS deployment 或 PT_KEY。
