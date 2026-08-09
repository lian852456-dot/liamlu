# Liam Supervisor App 1.1 Real Data Mapping Gate

驗證基準：最新已發布正式資料 `2026-08-09`；不重算、不改正式來源。正式資料內容不寫入 Git，本文件只保留去識別計數與 gate 證據。

| 模組 | Mapping | 正式證據 | 結果 |
| --- | --- | --- | --- |
| 今日營運／回報 | `read` + `pread`；partial 正確保留 | 16:00、21:00 均讀回 9 店；21:00 正式 `pread` 有 2 店未過關內容 | PASS |
| KPI | `kpicalc_access` 25 項官方 rate；摘要僅同日期／來源合併 | 正式 manifest：9 店、40 人、25 項，`aggregateRates=true`、`reportRate=true`；北一二B與酒泉／永吉／復興南抽驗已一致 | PASS |
| 台獎 | 同日 snapshot；100% 獎金欄位排序 Top 2 | 正式 manifest：13 機款、10 列、exact match；區與酒泉／通化／六張犁抽驗已一致 | PASS |
| 班表 | 既有 `sread`，今日與選日共用同一份 month payload | adapter／UI regression PASS；本輪沒有將短效 session 或班表內容寫入測試檔 | PASS（mapping）／真人重驗待 App 開啟 |
| 巡店 | 既有 `ptread`；期間／目標缺少時 fail-closed | adapter／UI regression PASS；正式 `ptread` 若無 period／target 不顯示假進度 | PASS（fail-closed mapping）／真人重驗待 App 開啟 |

## Automated evidence

- Node contract／mapping／security regression：118/118 PASS。
- App 1.1 Playwright 390×844 與互動 smoke：2/2 PASS。
- `npm audit`：0 vulnerability。
- KPI mapping test 確認 25 項只使用正式 `reportRate`，刻意放入不合理 actual 值也不影響顯示。
- KPI source mismatch、台獎日期 mismatch 均 fail-closed。

## Boundaries

本次未修改 OAuth、Cookie、Session、Approved Device、GAS、Sheet schema、正式寫入、KPI／台獎公式或 main。
