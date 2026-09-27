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

## 2026-08-23 follow-up：source_date_range 月內簡寫

根因屬於「發布流程仍呼叫另一個舊日期解析器」：`runtime.patch` 的 downstream cutoff
consumer 已可處理完整日期範圍，但上游 `extract_today_report.mjs` 仍只辨識半形
`YYYY/MM/DD ~ MM/DD`。因此全形 `～` 或完整結束日期會輸出空的 `source_date_range`，後續
consumer 才 fail-closed 為缺少截止日；不是由 `0822.xlsx`、寄信日或系統今天日期推導錯日。

[`runtime-source-range-shorthand-followup.patch`](runtime-source-range-shorthand-followup.patch) 只調整該
擷取／consumer 路徑：以單一嚴格 parser 支援 `YYYY/MM/DD ~ YYYY/MM/DD`、
`YYYY/MM/DD~MM/DD`、`YYYY/MM/DD～MM/DD`（分隔符周邊空白可有）；月內簡寫只以起始日年份補齊
結束日。空值、檔名、無效日、逆序、跨年簡寫歧義與晚於 `report_run_date` 的截止日一律 blocked。
未變更 KPI／台獎計算、Sheets、GAS、Pages 或正式資料。

修改前 SHA-256：`extract_today_report.mjs`
`83aff0aaefff0ff91040d187b932552e0989476d8f963caf17c581c4149e338c`；
`report_official_ingest_consumer.mjs`
`25426860f5aca0547454b5f699e9deca24783461f99b782c2db085c7c53cf9c3`；
`report_official_ingest_consumer.test.mjs`
`4bf54fe65bc51e1fb295720877c1d447f880568f355a8024704c33ff1eceea3c`。
修改後 SHA-256 分別為
`17a7f159f9378f245e051888c9b895748b32ca0b5ced8121b084f584249cba77`、
`06f2bd143d34da3b0840ce4357595c7ccdbdf24547d8e09271071aabd01ec513`、
`e3b15191c9ef258633a7d162e9b41c500cf484ed638094fef1e034965565fc2a`；新增 parser
`source_date_range.mjs` 為
`a0d06c2d1d0bbe4ea42b317c5e052dd5caa5292303b4fd0f7485cd7350f7bf25`。

非寫入測試僅以臨時 `TMPDIR` 執行：
`node --test report-automation/work/source_date_range.test.mjs report-automation/work/report_official_ingest_consumer.test.mjs report-automation/work/formal_website_publish_gate.test.mjs`，
結果 `24/24` 通過；沒有發布或變更正式資料。

Rollback 必須先作反向 dry-run，不可覆寫整個 runtime 目錄：

```sh
cd /Users/liamlu/Downloads/liam-agent
patch -R --dry-run -p1 < worktrees/report-runtime-source-range-20260823/docs/ops/report-data-cutoff-date-20260822/runtime-source-range-shorthand-followup.patch
patch -R -p1 < worktrees/report-runtime-source-range-20260823/docs/ops/report-data-cutoff-date-20260822/runtime-source-range-shorthand-followup.patch
```

## 2026-08-23 follow-up：台獎 snapshot source_file

根因是 `build_github_pages_data.py` 只把 canonical `today_report_data.json` 來源寫入 KPI snapshot，
建立台獎 snapshot 時遺漏頂層 `source_file`；正式 readback 也只比對 KPI 來源。這個 follow-up
只從同次 canonical `source_path`／`source_file` 的 basename 填入 KPI 以外的兩份台獎輸出，且在
local／正式台獎 readback 都要求它等於 KPI 的來源。不得由 report date、寄信日或系統日期推導；
未提供有效 `.xlsx` 來源時在寫出前 blocked。

[`runtime-awards-snapshot-source-file-followup.patch`](runtime-awards-snapshot-source-file-followup.patch)
保留最小 runtime 差異。對 2026-08-22 的 canonical input，台獎 snapshot 必須為
`report_run_date=2026-08-22`、`report_date=2026-08-21`、`source_file=0822.xlsx`；KPI 與台獎
同源同日才能通過。空白／不同來源或日期不一致均 fail-closed，未修改 KPI／台獎計算、Sheets、
GAS、Pages、巡店或正式資料。

修改前 SHA-256：`build_github_pages_data.py`
`0152656ad93decb5cbaa04ba80d8b7de2989e72d95e2183b4869c218d8c58f14`；
`publish_formal_website_data.mjs`
`e518bfd4608cb8b54e145ee8dd3ef26edda9a99f687910a328ed07750bcc4e0d`；
`formal_website_publish_gate.test.mjs`
`1ba36615b0a9cb3278c6063f8dbc29cf83f1abc423c34c0a6ef246d2c2ec8757`。
修改後 SHA-256 分別為
`fb3fc20da85a34f5799c7726f273293dc88b681300ea29bbbc215459901b8fbe`、
`466cf77808aecd0837a950e83fc3a228fcf72b602b155b3655ccd8aed3e27b76`、
`00c58116a46e13d6cd35b6e938d79dab5b636b22774bc317e065d6eb0b05073c`。

非寫入測試只寫入臨時目錄：source-output Python fixture `1/1`、Python syntax compile、
Node formal／ingest gate `24/24` 均通過。Python 的 optional Excel／image dependencies 未安裝，
因此 source-output test 僅 stub 其未使用的 imports，實際驗證 builder 的 canonical-source helper
與兩份台獎 JSON 暫存輸出；沒有讀取或改寫正式 XLSX／JSON。

Rollback 必須先 reverse-check，且只反向套用此 patch：

```sh
cd /Users/liamlu/Downloads/liam-agent
patch -R --dry-run -p1 < github-pages-liamlu/worktrees/awards-snapshot-source-file-20260823/docs/ops/report-data-cutoff-date-20260822/runtime-awards-snapshot-source-file-followup.patch
patch -R -p1 < github-pages-liamlu/worktrees/awards-snapshot-source-file-20260823/docs/ops/report-data-cutoff-date-20260822/runtime-awards-snapshot-source-file-followup.patch
```
