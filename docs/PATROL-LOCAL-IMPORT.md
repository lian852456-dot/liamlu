# 巡店報表本機上傳

## 狀態

本功能先以獨立入口 `patrol-import.html` 實作，專供 Liam 現有北一二B巡店系統使用。

- 不修改既有 `patrol.html` 完整版。
- 不修改 Patrol GAS、Google Sheet schema、巡店看板、移動里程、班表、半月檢查或稽核。
- 原本「貼上巡店紀錄」完整保留，作為備援入口。
- 分享給其他督導的通用 Lite 版已移至下一階段，與本功能無關。

## 操作流程

1. 開啟 `patrol-import.html`。
2. 頁面先沿用 `patrol.html` 的短效 session；若已逾時，再輸入原巡店通行碼。
3. 選擇本機 XLSX、XLS、CSV 或 TSV 巡店報表。
4. 瀏覽器本機解析檔案，辨識工作表、表頭、日期、店點、題號與結果。
5. 以 `ptsummary` 取得正式店點清單，避免把未知店點寫入。
6. 依月份與店點呼叫 `ptdetail` 做雲端預檢，分類新增、已存在、結果更新與衝突。
7. 顯示預覽，使用者按「確認寫入」後才以 `ptwrite` 分批送出。
8. 寫入後重新呼叫 `ptdetail`，逐筆完成 readback 驗證。

## 資料與安全邊界

- Excel／CSV 原始檔不會先上傳 Google Drive，也不會整包傳到 GAS。
- 只送出通過檢查的標準化巡店欄位。
- 通行碼不存入 localStorage；短效 token 沿用 `bei12b_patrol_session_token_v2`，只存在 sessionStorage。
- 相同 canonical 鍵值但內容不同的檔案列會 fail-closed。
- 店點代碼與店名互相矛盾時會 fail-closed。
- 雲端出現同鍵多筆且結果不一致時會 fail-closed。
- 每次寫入後必須通過 readback 才宣告完成。

## 支援格式

- `.xlsx`
- `.xls`
- `.csv`
- `.tsv`
- `.txt`，內容必須為 CSV 或 TSV

Excel 解析使用固定版本 SheetJS `0.18.5`。若外部元件載入失敗，可先將來源另存為 CSV，再使用相同入口匯入。

## 驗證

本機自動測試：

```bash
node --check patrol-local-import-core.js
node --check patrol-import-runtime.js
node --check patrol-import-file.js
node --check patrol-import.js
node --test tests/patrol-local-import-core.test.cjs
```

目前結果：12/12 通過。測試涵蓋延後表頭、CSV 引號、Excel 日期、工作表選擇、店點 mapping、檔內重複、雲端分類、結果更新、歧義阻擋、readback 與認證儲存邊界。

## 尚待正式 UAT

開發環境無法直接呼叫正式 Google Apps Script，因此以下項目必須以 Liam 的實際巡店報表與正式登入環境驗證：

1. 真實 XLSX 工作表選擇與欄位辨識。
2. 預檢顯示的新增／已存在／更新數量是否正確。
3. 確認寫入後 Google Sheet 筆數與內容。
4. 巡店看板及移動里程重新讀取是否一致。
5. iPhone Safari 選檔與短效 session 行為。

在正式 UAT 通過前，不將此入口標記為正式完成，也不移除貼上備援。

## 回復方式

此階段只新增六個前端檔案與一個測試檔，沒有修改既有正式入口或後端。需要回復時，移除下列新增檔案即可：

- `patrol-import.html`
- `patrol-import.css`
- `patrol-import-runtime.js`
- `patrol-import-file.js`
- `patrol-import.js`
- `patrol-local-import-core.js`
- `tests/patrol-local-import-core.test.cjs`
