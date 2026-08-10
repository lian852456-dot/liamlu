# Liam Supervisor App 1.1 唯讀資料 Contract

版本：`liam-supervisor-app-1.1-contract-v1`

App 1.1 以固定 contract 隔離正式來源與手機畫面。所有模組都必須提供相同的來源中繼資料；畫面只顯示 adapter 已整理的正式結果，不在前端重算 KPI、台獎或未過關判定。

## 共通欄位

每個模組均包含：

- `status`：`ok | partial | no_data | unauthorized | stale | error`
- `updatedAt`：App adapter 完成本次整理的 ISO 時間
- `sourceUpdatedAt`：正式來源最後更新時間
- `stale`：來源是否超過允許的新鮮度
- `source.label`：來源名稱
- `source.href`：既有正式系統入口
- `data`：模組資料；無資料時仍保留欄位並使用 `null`
- `note`：選填，說明 partial、no_data 或來源限制

> 本文件為 App 1.1 設計期說明；Native 1.0 使用的 frozen contract 以 `LIAM_SUPERVISOR_APP_DATA_CONTRACT_V1.md` 為準。

## 固定模組

| 模組 | 主要資料 | 目前來源／adapter |
| --- | --- | --- |
| `todayOperations` | 日期、16:00／21:00 已回報、缺店、區／各店上線摘要 | 既有 `read`＋`pread` 唯讀結果 |
| `kpiSummary` | 區 KPI、公司排名、KPI DOD、排名變化、加減分 | 既有 `private_access` 正式私有快照 |
| `kpiStores` | 九店 KPI、排名、DOD、排名變化、加減分、六項 KPI rate | 同上；僅讀正式 `reportRate`／`rate` |
| `awardSummary` | 區領獎總額、領獎店數 | 既有正式台獎私有快照 |
| `awardStores` | 九店金額、領獎狀態、主要得獎機款 | 同上 |
| `awardTop2Models` | 依正式 100% 獎金欄位排序的 Top 2 | 唯讀 adapter 排序，不改台獎公式 |
| `report1600` | 16:00 九店回報、時間、上線摘要 | 既有 `read`／`pread` |
| `report2100` | 21:00 九店回報、時間、上線摘要 | 既有 `read`／`pread` |
| `reportFailures` | 未過關店／人／指標及個人正式回報內容 | 直接使用正式 `failed[]`，不推算 |
| `scheduleToday` | 日期、店點、人員、班別、上班／休假 | 既有短效 session 後呼叫 `sread` |
| `patrolToday` | 今日路線、順序、進度、下一站、移動資訊 | 目前正式來源欄位不足，formal 狀態固定 `no_data` |
| `patrolOverview` | 當期完成率、未巡店、距上次巡店天數、待追蹤、最近紀錄 | 既有短效 session 後呼叫 `ptread` |

## 已確認需要補的唯讀 adapter 欄位

目前唯一無法由既有正式唯讀資料可靠產出的模組是 `patrolToday`。若正式巡店來源未來已有以下欄位，可新增純讀取 adapter；在此之前 App 必須顯示「今日無正式路線摘要」，不得自行推測：

- 今日預定店點與巡店順序
- 每站完成狀態
- 下一站
- 店與店之間預估移動時間／抵達時間

其餘摘要已可由現有正式唯讀資料轉接。正式來源缺欄位時保留 `null`／`no_data`／`partial`，不得以 Preview 值補入正式模式。

## 安全邊界

- 正式 KPI／台獎／回報只允許既有 `private_access`、`read`、`pread`、`kpicalc_access` 唯讀 action。
- 班表／巡店只允許既有 `sread`、`ptread`；session 建立與登出沿用 `ptauth`、`ptlogout`。
- Preview 必須帶 `?preview=1`，使用本機明確標示的展示資料，且不呼叫正式 endpoint。
- App 不提供 `write`、`pwrite`、`ptwrite`、Sheet/GAS 寫入或前端 KPI／台獎／未過關重算。
