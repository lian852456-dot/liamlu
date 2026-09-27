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

`readPrimary` 與 `readFallback` 都必須回傳資料列陣列，欄位沿用現行契約：
`date`、`store`、`seg`、`aq999`、`haosu`、`rt1399`、`rt999`、`insurance_pct`。

## 修復行為

- 主要來源最多重試 3 次，指數退避。
- 查無資料也視為可重試異常，再切換備援來源。
- 取得部分店點時保留已取得資料，只把真正沒有資料列的店列為尚未回報。
- 欄位空白仍顯示「資料未取得」，但不列入掛蛋或低標。
- 主要與備援皆失敗時，僅發送來源故障訊息並停止判斷，不再生成九店全缺值報告。
- `台北三創` 統一映射為 `三創`。

## 驗證

```bash
node --test tests/closing-line.test.cjs
```

正式 Mac 排程套用後，先以 `2026-09-27`、`seg=21` 回放；預期為 8/9 店完成、尚未完成三創。
