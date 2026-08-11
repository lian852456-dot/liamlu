# Liam Supervisor App 1.2 Mapping

## Daily Report 正式摘要契約

App 不再從店列自行加總或計算百分比。既有每日回報 GAS 的 `read` 唯讀回應新增 `summary`，使用目前正式 `index.html` 已採用的欄位與聚合口徑：

| App 顯示 | 正式欄位 | 正式摘要語意 |
|---|---|---|
| A999 上線數 | `aq999` | 已回報店加總 |
| 好速銷售點數 | `haosu` | 已回報店加總 |
| R1399 上線數 | `rt1399` | 已回報店加總 |
| R999 上線數 | `rt999` | 已回報店加總 |
| 保險搭售率 | `insurance_pct` | 有值店點算術平均，取一位小數 |
| 設備案佔比 | `device_ratio` | 有值店點算術平均，取一位小數 |

回應同時提供 `completedStores`、`totalStores`、`missingStores`、`updatedAt` 與九店各自的正式欄位值。契約識別為 `formal-index-summary-v1`；缺少或語意不符時 App fail-closed，只保留原有回報狀態，不自行產生營運摘要。

## 2026-08-11 16:00 Source Gate

17:53 的正式 `read` checkpoint 為 8/9，缺店 `萬大`；該 partial fixture 的摘要為 A999 2、好速 2、R1399 5、R999 11、保險 64.6%、設備案 59.0%、最後更新 17:17:33。這筆資料保留作 partial parity regression。

18:06 後重新唯讀正式來源，已更新為 9/9：

- A999：3
- 好速：2
- R1399：6
- R999：13
- 保險搭售率：50.5%
- 設備案佔比：52.2%
- 最後更新：18:06:51

本地 partial canonical fixture 與 App passthrough 測試已通過；最新 9/9 值只記錄為 formal source readback，不硬編進 App。正式線上 App Gate 必須等 GAS 與 Web App 1.2 獲得部署授權、部署後再讀回，不能以本地測試冒充正式部署 PASS。

## 21:00

21:00 使用相同契約，但只顯示當時正式來源實際提供的欄位。18:06 後正式讀回仍為 0/9、六項營運值皆無資料，因此 Gate 為 `WAITING-LIVE-DATA`。App 顯示「尚未進入／尚無正式 21:00 回報」，不帶入 16:00 數值。

## Scope proof

- 未修改 `write`／`pwrite` 或任何既有寫入語意。
- 未修改 OAuth、Cookie、Session、Approved Device、`ptauth`。
- 未修改 KPI、台獎、班表、巡店 mapping／規則。
- 個績沿用既有 `private_access` 正式快照，不新增身份驗證或 endpoint。
