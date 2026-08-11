# Liam Supervisor App 1.1｜巡店最小修正

## 範圍

- Shared read-only model：題 14–17、題 18、本月巡店次數、最近巡店聚合。
- App 巡店頁：顯示上述大盤；新增獨立快速到店／離店 UI。
- GAS：新增 `ptvisit_read` 與 `ptvisit_write`，不改 `ptread`／`ptwrite`／`sread` 或既有工作表 schema。

## 本月巡店次數口徑

沿用正式 `patrol.html`：優先使用 `arriveTime`、缺少時回退 `fillTime`，以「店點＋不同到店日期」計數。ptread 一次巡店的多題 rows 只算一次。

正式 ptread 沒有 visit/session identifier，因此同店同日實際多次到店無法可靠區分；App 只計一次並明示限制，不增加猜測值。新到離店紀錄另有 `visitSessionId`，但不反向改寫舊巡店明細。

## 到離店安全契約

- action：`ptvisit_read`（GET）、`ptvisit_write`（POST text/plain JSON）。
- auth：只接受既有 `ptauth` 簽發的 30 分鐘短效 token；不接受 passcode。
- allowlist：action 僅 `arrival`／`departure`；店點只接受正式 `PT_STORES`；note 最多 200 字；拒絕額外欄位。
- 時間：以 GAS server timestamp 為準。
- 儲存：獨立 worksheet `巡店到離店紀錄`，欄位固定為 `serverTime,date,action,store,note,visitSessionId`。
- 保護：單一 open visit、離店必須對應最新 open visit、15 秒重複點擊拒絕、Script Lock 防並行。
- 不記錄 token／passcode，不使用 URL 傳 passcode，不影響既有巡店檢核寫入。

## 部署與 rollback

本機 commit 不等於正式部署。GAS 需由 Liam 將最新完整 `gas/Code.gs` 儲存並建立新版本部署；不得只貼局部舊檔。rollback 為將巡店 GAS Deployment 切回部署前版本，並回退本次 Web commit。新 worksheet 為獨立 append-only 紀錄，不刪除既有資料。
