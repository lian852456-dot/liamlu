# 2026-08-24 P0：KPI／台獎 OneDrive Cloud-first

## Scope

正式來源 resolver 改為 Microsoft Graph 直接讀取 OneDrive `TWM每日戰報`。沒有修改 UI、Approved Device、authentication、TTL、巡店或稽核；KPI 已正式 PASS，本次未重跑、未發布、未改寫 KPI component。

## Design

- Production 預設 `onedrive-cloud`，精準抓同日 `MMDD.xlsx` 與兩份 canonical awards basename。
- 不接受 Finder duplicate suffix；不以 filesystem mtime 當 production version identity。
- 每份來源保存 `provider`、`driveItemId`、canonical basename、`lastModifiedDateTime`、`eTag`、size、SHA-256、Excel `source_data_date` 與 run ID。
- Graph bytes 寫入 run-scoped staging；檔名含 run ID、cloud item ID 與 hash，且 staged SHA 必須等於 cloud download SHA。
- Graph 缺檔、下載失敗、任一 awards version 未更新、兩份 cutoff 未與 KPI cutoff 對齊，全部 fail-closed。
- 本機 OneDrive emergency fallback 需明確雙旗標啟用，預設 OFF；production 不 silent fallback 到 CloudStorage、Google Drive、staging、outputs 或 cache。
- 新增 awards component-only publisher；只替換 `awardsBattle`，發布前後逐值驗證 KPI payload/component 與 KPI hash 不變。
- b-2 ACTIVE automation prompt 已改為同一 Cloud-first／component-level 契約；Git 僅保存不含憑證的機械 migration helper，不保存 automation 的私人設定全文。

## Runtime archive

`runtime-after/` 保存本次非 Git runtime 的正式腳本與契約文件快照。runtime 的實際生效位置仍為 `/Users/liamlu/Downloads/liam-agent/report-automation/`。

## Regression evidence

- 使用者指定 Cloud-first 五案例：5/5 passed。
- runtime Node：65/67 passed；兩項既有 `award_v15_frontend_contract` 失敗早於本次變更，且屬明確禁止修改的 UI 範圍。
- runtime Python（各檔隔離執行）：14/14 passed。
- repository `tests/*.test.cjs`：259/259 passed，包含 awards component-only publish、KPI preservation、auth／TTL／前端 freshness gate 不變。

## 2026-08-24 read-only preflight

執行：`REPORT_DATE_ISO=2026-08-24 REPORT_DATA_CUTOFF_DATE=2026-08-23 node report-automation/work/preflight_onedrive_cloud_sources.mjs`

結果：`BLOCKED`。目前執行環境沒有可用的 `North12BOneDriveGraphAccessToken`；local fallback 為 OFF。因尚未取得 Graph listing/download，沒有產生新台獎、沒有建立假的 8/24 snapshot、沒有發布 awards component，也沒有觸碰 KPI。

## Rollback

1. Apps Script deployment 切回本次部署前的 v33。
2. Runtime 依本 commit 前的 ops archive／版本回復本次列出的同名腳本；不要回退既有 KPI cutoff、manual-wins、awards freshness 或 component-level publish gate。
3. 自動化 prompt 回復前一版時，仍不得把 local fallback 誤標成 cloud source。
