# 2026-08-22 report date contract patch

`report-automation` 是 `/Users/liamlu/Downloads/liam-agent` 下的實際排程 runtime，位於
`lian852456-dot/liamlu` Git repo 外。本目錄把已套用到該 runtime 的最小 unified diff
納入 PR，供審查、重套與 rollback；合併 PR 本身不會發布網站資料或部署 GAS／Pages。

日期契約：

- `report_run_date` / `mail_date`：執行、附件、郵件與 manifest 檔名日期。
- `data_cutoff_date`：`source_date_range` 最後一日；正式 KPI／台獎 `report_date`。
- `source_file`：保留實際來源檔名，例如 `0822.xlsx`，但不得用它推導正式資料日。
- manifest 以 run date 定位；`websitePublication.reportDate`、KPI／台獎 snapshot 與正式 readback 一律以 cutoff 為準。

回歸案例：`0822.xlsx`／寄信日 `2026-08-22`、資料範圍截止 `2026-08-21`，正式 KPI／台獎
`report_date` 必須是 `2026-08-21` 並通過 `datesAligned`／`sourcesAligned`；錯日仍 blocked。

Runtime patch：[`runtime.patch`](runtime.patch)。

正式發布後發現 dashboard snapshot 有數秒 propagation delay：第一次立即逐值 readback fail-closed，
稍後 verify-only 即完全一致。後續補丁 [`runtime-readback-retry.patch`](runtime-readback-retry.patch)
只為正式 readback 加入最多三次、每次間隔五秒的有限重試；最後一次仍不一致時照常 blocked，
不放寬日期、來源、筆數或逐值驗證。

2026-08-22 正式驗證結果：`websiteResult=published-verified`、`datesAligned=true`、
`sourcesAligned=true`；`report_run_date=2026-08-22`、`data_cutoff_date=2026-08-21`、
`source_file=0822.xlsx`，KPI 9 店／40 人／25 項，台獎 13 機款／10 列且 exact match。

Rollback：在 runtime 根目錄執行 `git apply -R --check runtime.patch` 的等效檢查後，才可反向套用；
或從本次變更前備份逐檔恢復。回滾後 wrapper 會回到單一 `REPORT_DATE_ISO` 契約，故不得在未確認
資料日等於寄信日的情況下發布。
