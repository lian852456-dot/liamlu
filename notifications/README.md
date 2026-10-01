# 北一二B 21:45 LINE 收官修復

此模組修正來源讀取失敗時九店全部被誤寫成「資料未取得」的問題。

## 接線

既有排程保留 LINE sender 與去重 ledger，只替換資料讀取及組字流程：

```js
const { runClosing } = require('./closing-line.cjs');

await runClosing({
  date: taipeiDate,
  time: '21:45',
  readPrimary: (date, seg) => gasClient.readData(date, seg),
  readFallback: (date, seg) => sheetsClient.readReportRows(date, seg),
  send: (message, meta) => lineSender.push(message, meta),
  logger,
});
```

`readPrimary`／`readFallback` 支援資料列陣列、`{rows:[...]}`、正式 GAS
`{status:'ok', data:{店點:資料列}}`／原始店點物件，以及包含表頭的 Sheets `{values:[表頭,...資料列]}`。
GAS 的錯誤狀態一律視為來源錯誤，不能採用其中的資料。
欄位沿用現行契約：
`date`、`store`、`seg`、`aq999`、`haosu`、`rt1399`、`rt999`、`insurance_pct`。
Sheets 非格式化日期序號可直接使用；資料列必須具備明確日期與時段，不能用前日或16:00資料代替。
Sheets reader 應依當次 metadata 分頁讀取日期欄與匹配資料列，不固定總列數；
若回傳 `values`，必須附當次表頭，不能把無表頭片段當成完整來源。

## 修復行為

- 主要來源最多重試 3 次，指數退避。
- 查無資料也視為可重試異常，再切換備援來源。
- 取得部分店點時保留已取得資料，只把真正沒有資料列的店列為尚未回報。
- 欄位空白仍顯示「資料未取得」，但不列入掛蛋或低標。
- 主要與備援皆失敗時，僅發送來源故障訊息並停止判斷，不再生成九店全缺值報告。
- 九店可帶 `台北` 前綴，皆映射為既有短名。
- 重複提交按 savedAt 取最新，時間相同取最後一列。
- 已提交與五項欄位完整分開統計，空白不補0。
- LINE sender 失敗時錯誤直接交回既有 sender／ledger，不能再送另一則來源故障訊息。

## 驗證

```bash
node --test tests/closing-line.test.cjs
```

正式 Mac 排程套用後，先以 `2026-09-27`、`seg=21` 回放；預期為 8/9 店完成、尚未完成三創。

## 正式部署狀態

截至2026-10-01，本 PR 仍未接入正式 Mac runner。GitHub 修復模組、測試通過或合併，
都不等於 Mac LaunchAgent 已套用。必須取得實際 runner、讀取錯誤日誌，沿用既有 sender、
收件者與去重 ledger 接入上述流程並回放驗證，再以 Mac 排程執行結果確認生效。
不得以替代 ChatGPT 排程、郵件或新增 LINE sender 冒充原收官通道已修復。
