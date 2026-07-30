# 督導巡店里程＋GAS 七分頁｜部署前安全報告

- 盤點時間：2026-07-30 21:25:55（Asia/Taipei）
- 整合分支：`integration/patrol-mileage-gas7-20260730`
- 基準：執行當下最新 `origin/main` `f4de11fe2f96fc460e668394865b983efbef7832`
- 里程來源：`origin/claude/mileage-calculation-survey-arhdmq`，最終 commit
  `c5bf7823edbdd00026bdcb77425ff6a6cc03bbbd`
- 狀態：只完成備份、比對、獨立分支整合與本機測試；未部署 GitHub Pages、未修改 GAS
  原始碼、未建立／重建／刪除觸發器、未寫入正式資料。

## 1. 正式專案辨識

巡店目前不是單一 Apps Script 專案，而是兩個正式角色：

1. 週報與 4 個排程的專案
   - Apps Script UI 名稱：`北一二B回報系統`
   - 程式內正式標記：`北一二B區 · 盧蔚榮 · 33 項檢核追蹤`
   - Script ID：`17XfhB1cYOIWIyIm0_1mO1a9-ba-H4QCBJHX56bYHiEX06XSSG05FWtlg`
   - 目前部署：第 19 版（2026-07-14 11:16）
   - Deployment ID：
     `AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6`
   - `sendWeeklyPatrolReport` 最近執行：2026-07-27 08:42:22，錯誤率 0%
   - 原始碼含 `改善提醒與照片`、`weeklyHalfPhotoBlob`、
     `buildWeeklyHalfCheckTab`，不含 `CHANGE_ME@example.invalid`。

2. `patrol.html` 目前實際呼叫的受保護 API 專案
   - Script ID：`1SW9qr0CU9Xvy97XkVr3n51_4Dx_6GArnTXT8780t0HofIB74v9IDMkWf`
   - 目前部署：第 21 版（2026-07-29 19:34）
   - Deployment ID：
     `AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv`
   - `patrol.html` 的 `PRIVATE_GAS_URL`／`DEFAULT_PATROL_GAS_URL` 均指向此 Deployment。
   - 編輯器為 `程式碼.gs`＋`HalfMedia.gs`，並保留 Drive 進階服務。

因此，不能把「含 4 個觸發器的週報專案」與「巡店前端目前呼叫的第 21 版 API 專案」
視為同一個部署。此次七分頁來源鎖定前者；里程前端仍使用後者，未改 URL。

另檢查 2026-07-15 修改的同名 Script ID
`1FVS0tig9vgiLUihSAIXZAgRN0RErAEsvV6e92A7RWRGTW-0c3iJMCqqU`，其原始碼不含第七分頁，
已排除。

## 2. 線上原始碼與七分頁清單

正式週報專案檔案：

1. `程式碼.gs`：967 行、36,364 bytes，
   SHA-256 `79b39c929e947ef04dbdfca15efdba3ff23a7be4b39da305c53f331390a912ce`
2. `appsscript.json`：10 行、203 bytes，
   SHA-256 `729a4c61bc65411f221c76ce80d368e477374cd3670f8f95cad5e9fc990ec5f0`

`appsscript.json` 的受控副本位於
`docs/evidence/patrol-formal-gas7-20260730/appsscript.json`。完整原始碼因線上版本仍含
硬編碼 `PT_KEY`，只存於權限 700/600 的本機安全備份，不提交 Git。

週報 Excel 七分頁順序：

1. `巡店紀錄`
2. `未巡店`
3. `上下半月2-13`
4. `每月盤點14-17`
5. `雙月全盤18`
6. `知悉20日前19-33`
7. `改善提醒與照片`

第七分頁欄位：

`日期`、`期別`、`店點`、`督導`、`題號`、`檢查內容`、`結果`、
`提醒／缺失內容`、`改善說明`、`照片`、`私有附件連結`、`最後更新`。

功能：

- 從同一試算表的 `半月督導檢查` 讀取第 1–18 題。
- 只納入有提醒／缺失、改善說明或媒體的資料。
- 多個媒體各自成列；照片嘗試透過 `DriveApp` 嵌入 Excel。
- 影片、不支援格式、檔案取得或圖片嵌入失敗時，保留私有 Drive 連結，照片欄顯示失敗提示。
- 郵件本文會統計改善／提醒筆數與照片數，並明示附件共有七分頁。

## 3. 四個正式觸發器

| 函式 | 排程 | 最近執行 | 錯誤率 |
|---|---|---|---|
| `check16` | 每日 16:00–17:00 | 2026-07-30 16:20:54 | 0% |
| `check21` | 每日 21:00–22:00 | 2026-07-30 21:16:50 | 0% |
| `sendWeeklyPatrolReport` | 每週一 08:00–09:00 | 2026-07-27 08:42:22 | 0% |
| `checkAwareAndNotify` | 每月 15 日 09:00–10:00 | 尚無最近執行時間 | — |

此次只讀取設定並按「取消」離開，沒有按「儲存」，觸發器數量與排程未變。

## 4. 線上版與 repo 差異

檔案對應：

- 線上 `程式碼.gs` 對應 repo `gas/Code.gs`。
- 線上獨有檔案：`appsscript.json`；repo 在整合前沒有 manifest。
- repo 獨有檔案：`gas/HalfMedia.gs`，負責私有半月照片／影片上傳。
- 線上 manifest `dependencies` 為空；API 專案編輯器則另有 Drive 進階服務。
  不可用這份空 dependencies manifest 覆蓋 API 專案設定。

函式統計（整合前）：

- 線上：38 個函式。
- repo：103 個不重複函式。
- 同名：31 個。
- 線上獨有：7 個。
- repo 獨有：72 個。

線上獨有、此次完整保留的 7 個函式：

`weeklyHalfMediaItems`、`weeklyHalfResultLabel`、`weeklyHalfPeriodLabel`、
`weeklyReadHalfCheck`、`weeklyHalfPhotoBlob`、`buildWeeklyHalfCheckTab`、
`formatWeeklyHalfCheckSheet`。

同名函式中，21 個原本已相同；10 個有差異：

`doGet`、`ptAuthorized`、`readPatrol`、`sendWeeklyPatrolReport`、`readData`、
`jsonResponse`、`setupTriggers`、`check16`、`check21`、`checkSegAndNotify`。

除 `sendWeeklyPatrolReport` 外，其餘差異均保留 repo 新版，原因包含：
Script Properties `PT_KEY`、短效 token、班表／半月／媒體後端驗證、`savedAt` 修正、
私有戰情、KPI 自動化與新版通知。整份改用線上舊碼會洗掉這些功能。

repo 獨有 72 個函式完整清單：

- 權限／巡店／班表／半月：
  `ptConfiguredKey_`、`ptSessionCacheKey_`、`ptSessionAuthorized_`、
  `ptCredentialAuthorized_`、`ptAuthenticatePayload`、`ptLogoutPayload`、
  `getHalfCheckSheet`、`halfCheckItemNo`、`halfCheckKey`、`halfResultToSheet`、
  `halfResultToClient`、`writeHalfCheck`、`readHalfCheck`、`findNamedSheet`、
  `readSchedule`、`scheduleDateString`、`doPost`。
- 私有戰情：
  `privateDashboardProperties`、`privateDashboardRequiredProperty`、
  `privateDashboardNow`、`privateDashboardCleanEmployeeId`、
  `privateDashboardIsTrustedEmployee`、`privateDashboardCleanDeviceId`、
  `privateDashboardHash`、`privateDashboardAdminAuthorized`、
  `privateDashboardFolder`、`privateDashboardRoster`、`privateDashboardSheet`、
  `privateDashboardRows`、`privateDashboardWriteObject`、`setupPrivateDashboard`、
  `privateDashboardUserByEmployeeId`、`privateDashboardRequestBinding`、
  `privateDashboardRequestStatus`、`privateDashboardNotifyAdminOfBindingRequest`、
  `privateDashboardSnapshot`、`privateDashboardAccess`、
  `privateDashboardAdminRequests`、`privateDashboardAdminApprove`、
  `privateDashboardAdminRevoke`、`privateDashboardAdminSetTrustedEmployee`、
  `privateDashboardSyncRoster`、`privateDashboardPublish`。
- KPI：
  `kpiCalcAccess`、`kpiCalcLatestDataFile`、`kpiCalcPublish`、`kpiCalcSetupSelf`、
  `setupKpiCalcAutoUpdate`、`testKpiCalcAutoUpdate`、`setupKpiCalcWatchdog`、
  `kpiCalcWatchdog`、`kpiCalcNotify`、`kpiCalcAutoUpdate`、`kpiCalcRound4`、
  `kpiCalcRate`、`kpiCalcPct`、`kpiCalcReadSnapshots`、`kpiCalcSaveSnapshots`、
  `kpiCalcBrief`、`kpiCalcParseReport`、`kpiCalcBands`、`kpiCalcBandsPairs`、
  `kpiCalcPrevRoles`、`kpiCalcBandVal`、`kpiCalcNum`、`kpiCalcParseMeta`。
- 私有媒體：
  `halfMediaAuthorized`、`halfMediaSafeName`、`halfMediaSubfolder`、
  `halfMediaRootFolder`、`setupHalfMediaStorage`、`uploadHalfMedia`。

完整 1,654 行逐行差異保存在安全備份的 `live-vs-repo-Code.gs.diff`，
SHA-256 `ef6193c2828891ece4529d3c23c40ba1845f66068c98a0b095fe8ab2963d3742`。

## 5. 整合內容

- `gas/Code.gs`
  - 新增線上 7 個獨有函式，內容與正式線上來源逐函式一致。
  - `sendWeeklyPatrolReport` 的第七分頁、格式化、統計與郵件文案已與線上來源一致。
  - repo 的安全驗證、短效 token、班表、半月、媒體、私有戰情、KPI、自動化與通知均保留。
- 里程分支只取下列 3 個檔案的 4 個里程 commit：
  - `patrol.html`
  - `tests/patrol.spec.js`
  - `docs/COLLAB-LOG.md`（以最新狀態重新記錄，未覆蓋 main 新紀錄）
- 安全衝突處理：
  - 里程原分支曾讓 `patrol`／`mileage` 成為驗證例外；整合版保留 P0 規則，
    `switchPatrolView()` 所有頁籤一律先檢查 verified session。
  - 里程 DOM 位於 `patrolAppTemplate`，未驗證時不建立。
  - 里程測試改為先通過 mock GAS 正式驗證，才載入資料與切頁。
- 未合併里程分支的其他歷史 commit、KPI、GAS 或自動化改動。

### 尚未解除的公開原始碼風險

里程模組仍把下列資料直接寫在公開 GitHub Pages 的 `patrol.html` JavaScript：

- Y2606 正式 11 天的日期、店到店路線與公里數。
- 歷史距離來源與實際日期。
- 成本歸屬者、成本部門與車號預設值。

全頁鎖定只能阻止 DOM 建立與 API 讀取，不能阻止未授權者下載 HTML 原始碼。因此這些資料
不受 P0 verified session 保護；原遠端里程分支 `c5bf782` 本身也已包含這些常數。

此次依「不改變既有資料流、未經 Liam 不部署 GAS」的邊界，沒有自行新增受保護里程 API。
正式部署前，Liam 必須二選一：

1. 明確確認上述常數可公開；或
2. 另案授權把正式里程基準、個人／車號預設值移到第 21 版受保護 GAS，由 verified token
   驗證成功後才載入。

未取得其中一項結論前，前端即使測試全過也不可部署。

## 6. 測試結果

- `gas/Code.gs`／`HalfMedia.gs` Node 語法檢查：通過。
- Node／GAS 契約：12/12 通過。
  - 包含七分頁順序、12 欄、照片嵌入、私有連結 fallback、4 個 handler 與關鍵自動化保留。
- 完整 Playwright：68/68 通過。
  - 全頁鎖定、錯誤密碼、正確 token、登出、巡店看板、班表、半月檢查、
    私有媒體、督導大盤、每日移動里程與原每日回報均通過。
- Y2606：
  - 11 個報銷出差日。
  - 74.5 KM。
  - 6/15 三創→永吉 4.4 KM、永吉→酒泉 10.0 KM，合計 14.4 KM。
  - 油料 11 列、距離計算明細 12 段、備註全空白。
  - 正式報銷 Excel 兩工作表、欄位、成本歸屬、檔名與匯出按鈕測試通過。

未完成且不可用本機測試取代：

- 尚未執行正式 `testWeeklyReport()`；本輪禁止寄信與建立暫存 Sheet。
- 尚未用真實照片資料驗證收件 Excel 的圖片呈現。
- 尚未部署 GitHub Pages，未做正式網址里程頁無痕／手機驗收。
- 未變更正式 Apps Script，因此線上 `程式碼.gs` 與整合 repo 全檔不會一致；
  已驗證第七分頁 7 個函式與 `sendWeeklyPatrolReport` 一致。

## 7. 備份位置

安全備份：

`/Users/liamlu/Downloads/liam-agent/private-backups/patrol-formal-gas7-20260730212555/`

權限：資料夾 `700`、檔案 `600`。內容：

`程式碼.gs`、`appsscript.json`、`metadata.json`、`triggers.json`、
`deployment.json`、`weekly-workbook-tabs.json`、`SHA256SUMS`、
`live-vs-repo-Code.gs.diff`。

## 8. Liam 驗收後的部署步驟

里程功能是純前端；本次不需要 GAS 新版本：

1. Liam 先檢查此報告、整合 branch diff 與測試結果。
2. 先決定里程常數是否可公開；若不可公開，先另案完成受保護 GAS 載入與契約測試。
3. 只合併 `integration/patrol-mileage-gas7-20260730` 的核准 commit 到最新 `main`。
4. push `main`，等待 GitHub Pages workflow 成功。
5. 全新無痕瀏覽器開正式 `patrol.html`：
   - 未驗證只見鎖定畫面，里程 DOM 不存在。
   - 正確驗證後巡店看板、每日移動里程、班表、半月檢查均可切換。
   - 驗收 Y2606 11 天／74.5 KM、6/15 兩段與正式 Excel 下載。
   - 登出後所有督導 DOM（含里程）移除。
6. 手機再驗收里程卡片、日期切換與月份彙整。
7. 若 Liam 已確認常數可公開，則不部署任何 GAS；第 21 版 API 與第 19 版週報專案
   維持原狀，4 個觸發器不重建。

若未來另案核准部署 GAS，必須先重新抓兩個專案的 live source，分別比對 Script ID，
不得把其中一個專案整份覆蓋到另一個專案。Drive 進階服務與 Script Properties 必須先確認。

## 9. 回滾方式

- GitHub Pages：revert 本次整合 commit，push `main`，回到部署前 `f4de11f` 的前端內容。
- 本次 GAS 未部署，不需回滾。
- 若未來有人誤改 4-trigger 專案的編輯器 HEAD：
  - 觸發器執行的是 HEAD，不是 Web App 第 19 版；只切換 Deployment 版本不足以回滾排程。
  - 必須從安全備份還原 `程式碼.gs`／`appsscript.json`，核對 SHA-256 後存檔。
  - 觸發器保留原 4 個，不執行任何 `setup*Trigger` 重建函式。
- 第 21 版 API 專案若另案部署失敗，Web App 可切回第 21 版；同時確認 Script Properties
  `PT_KEY` 與 Drive 進階服務仍存在。

## 10. 是否可安全部署

- 前端里程：程式與本機回歸已達可交 Liam 驗收的狀態。
- 正式部署：目前仍是「不可部署」，因里程常數仍可由公開 HTML 原始碼讀取、Liam 尚未驗收，
  且尚未做正式 Pages 無痕／手機驗收。
- GAS：本次里程不需要部署 GAS；禁止用 repo 整份覆蓋任何 Apps Script 專案。
