# Liam Supervisor 巡店唯讀效能復原

## 問題與安全結論

- 正式「巡店明細」仍存在：總計 1,476 rows，2026-08 為 297 rows。
- 舊 `ptread` 在 120 秒內沒有 HTTP response／JSON body，分類為 transport timeout；不得映射成空陣列、`0/9` 或 `0%`。
- 本次不清除或修改任何巡店正式資料，不啟用 `hwrite`，`half_media_upload` 維持 0。

## 新的唯讀路由

### `ptsummary`

- Auth：沿用既有 1,800 秒 `ptauth` token。
- Input：`month=YYYY-MM`。
- Source：同一張「巡店明細」，只讀既有 A:L schema。
- Contract：月份、九店巡店／未巡店、完成率、缺項、關注店、題 18、題 14–17、題 19–33、上下半月大盤、各店到店次數、最近 10 次與九店狀態。
- Cache：Script Cache 120 秒；key 包含月份與正式來源 row count／最新更新時間。unauthorized、error 與超過安全大小的 response 不會被 cache。
- Fail-closed：月份或九店 contract 不完整、HTTP／JSON／timeout 失敗時，App 與 `patrol.html` 顯示「巡店資料讀取失敗／逾時」及重新整理，不產生零值。

### `ptdetail`

- Auth：同一 `ptauth` token。
- Input：`month`、九店 allowlist 的 `store`、`page`、`limit`。
- 單次上限：100 rows。
- 使用時機：只有使用者主動點擊單店「查看完整巡店紀錄」時才讀取；首頁及巡店大盤不使用 raw `ptread`。

## Canonical parity

`patrol-read-model.js` 保留正式既有規則，GAS 的 compact contract 以同 fixture 做逐欄 deep parity：

- 題 1–33 完成度
- 題 2–13 上／下半月
- 題 14–17 每月盤點
- 題 18 固定雙月週期與上一期
- 題 19–33 每月 20 日前進度
- 本月巡店店數／未巡店／缺失／需關注
- 各店不同到店日期次數
- 一次巡店一列的最近 10 次

同店同日多次巡店在既有 raw source 沒有 visit/session ID，持續 fail-closed 為一天一次，contract 明示 `sameDayMultipleVisitsDistinguishable=false`。

## UI 與模組隔離

- 巡店摘要、班表、半月、到離店維持獨立 request 與獨立 loading/error state。
- 上次成功摘要可在更新失敗時保留，但必須標示「上次成功資料」與 timestamp。
- KPI、台獎、個績、每日回報、班表、到離店、半月唯讀、auth、Approved Device 均未改變資料語意。
- `hwrite` runtime 維持 disabled；正式半月仍為 read-only。

## Release Gate

正式部署前／後必須保留以下證據：

1. Node contract 與 canonical parity 全數通過。
2. Chromium／WebKit 390×844：console error 0、horizontal overflow 0。
3. 正式 `ptsummary` 5/5 回傳 `status=ok`、JSON parse 5/5、timeout 0、404 0。
4. Response 小於 100 KB（目標小於 50 KB），median 小於 5 秒、P95 小於 15 秒。
5. 正式 2026-08 `ptsummary` 與 297-row canonical fixture 逐欄一致。
6. `hwrite enabled = NO`、`half_media_upload = 0`。
