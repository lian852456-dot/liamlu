# Liam Supervisor App Data Contract V1

狀態：Frozen for Native 1.0
版本：`liam-supervisor-app-1.1-contract-v1`
資料方向：正式來源 → 唯讀 adapter → App contract → Web／Native Shell

本 contract 不新增正式資料來源、不改 KPI／台獎／回報判斷，也不提供任何寫入 action。正式欄位缺少、來源日期不一致或來源未授權時一律保留 `null`、`partial`、`no_data`、`unauthorized` 或 `error`，不得套用 Preview 數字。

## 共通 envelope

每個模組固定提供：

- `status`: `ok | partial | no_data | unauthorized | stale | error`
- `updatedAt`: adapter 本次整理時間
- `sourceUpdatedAt`: 正式來源回傳的更新時間；來源未提供時為空字串
- `stale`: 是否超過模組允許的新鮮度
- `source`: `{ label, href }`
- `sourceLink`: 與正式來源入口一致的非空字串
- `data`: 模組資料
- `note`: fail-closed／partial 原因

## Frozen modules

| 模組 | Frozen data shape | 正式唯讀來源 |
| --- | --- | --- |
| `todayOperations` | `date`, `segments[]`；每時段含完成／缺店／店點上線／未過關 | `read` + `pread` |
| `kpiSummary` | 區 KPI、排名、KPI DOD、排名變化、加減分、資料日 | `kpicalc_access` + 同來源日期私有摘要 |
| `kpiStores` | 九店摘要、六項主 KPI、各店 25 項 rate | `kpicalc_access` |
| `kpiFullMetrics` | `region[25]`, `stores{店名:[25]}` | `aggregateRates` + 各店 `reportRate` |
| `awardSummary` | 區金額、領獎店數、資料日 | 同日正式台獎私有摘要 |
| `awardStores` | 九店金額、領獎狀態；每店 `items[]` 為該店正式指定機款及來源已提供欄位 | 同上 |
| `awardTop2Models` | 相容保留的正式摘要欄位；App 1.1 區／店點畫面均不顯示 | 同上 |
| `report1600` | 九店回報、時間、店點上線摘要 | `read(seg=16)` + `pread(seg=16)` |
| `report2100` | 九店回報、時間、店點上線摘要 | `read(seg=21)` + `pread(seg=21)` |
| `reportFailures` | 缺店、未過關店／人／指標、正式回報內容 | 正式 `failed[]` + `extra` |
| `scheduleToday` | 今日九店人員、班別、上班／休假 | `sread` |
| `scheduleByDate` | `selectedDate`, `availableMonth`, 九店班表 | `sread` |
| `patrolToday` | 今日路線、順序、完成、下一站、移動資訊 | `ptread`；來源缺欄位時 `no_data` |
| `patrolOverview` | 正式期間、完成／應完成、剩餘、未巡、關注、最近紀錄 | `ptread` |
| `patrolStores` | 最近巡店日、距今天數、狀態、待追蹤數 | `ptread` |

## KPI hard gates

1. 25 項 rate 只讀 `kpicalc` 的正式 `aggregateRates`／各店 `reportRate`；不以實績／目標重算。
2. KPI 摘要補充只有在 `data_as_of_date` 與 `source_file` 同時對齊時才可合併排名、DOD、加減分。
3. 九店或 25 項不完整時為 `partial`；來源不一致時補充欄位 fail-closed。
4. 台獎 `report_date` 必須與 KPI `report_date` 一致，否則整個台獎摘要為 `no_data`。
5. 店點指定機款只可直接映射該店 `row.items`；不得用區 Top 2 推算、跨店合併、前端計算或人工補值。

## Schedule／Patrol hard gates

- 只接受既有短效 session 後的 `sread`、`ptread`。
- `patrolOverview` 只有正式來源提供期間與 completed／expected 時才可顯示進度。
- 正式來源沒有今日路線、順序、移動欄位時，`patrolToday.status=no_data`；不得自行假定本月 9 店或計算路線。

## Native consumption

Native 1.0 不建立第二套資料 mapping。SwiftUI／WKWebView shell 只載入這套 App 1.1 contract 的既有 Web UI，保留 HttpOnly Cookie、Approved Device 與既有 session 邊界。
