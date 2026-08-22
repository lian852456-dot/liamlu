# 跨 AI 協作日誌

Liam、Claude、Codex（及其他 AI 助手）的共享工作紀錄。**新紀錄加在最上方**，格式：

```
## YYYY-MM-DD ｜ 作者（Claude / Codex / Liam）
- 做了什麼：
- 結果（成功 / 失敗 / 進行中）：
- 經驗 / 給下一位的提醒：
```

長期性的坑（會一再影響開發的）除了記在這裡，也請同步進 `CLAUDE.md` 的「踩過的坑」章節。

---

## 2026-08-22 ｜ Codex（戰報日期契約正式發布＋readback 同步延遲修正）

- 結果：PR #76 已合併；正式私有網站已發布並讀回 `reportDate/dataAsOfDate=2026-08-21`、來源 `0822.xlsx`，KPI 9 店／40 人／25 項，台獎 13 機款／10 列且逐值一致。Manifest 為 `published-verified`，日期與來源一致，owner 與 PRIVATE 權限正確。
- 補強：首次發布後立即 readback 曾因 snapshot propagation delay 暫時不一致，閘門正確 blocked；數秒後逐值差異為 0。Publisher 改為最多三次、每次五秒的有限 readback retry，最後一次仍不一致就 fail-closed。新增「短暫不同步後通過」及「重試用盡仍 blocked」測試，相關 Node gate 22/22 通過。
- 提醒：不得把一次發布 API 成功當完成；只認正式雙路 readback 與 manifest。有限重試僅吸收短暫同步延遲，不可移除或弱化精確比對。

## 2026-08-22 ｜ Codex（戰報執行日／資料截止日分離，Draft PR）

- Root Cause：Mac `report-automation` 以單一 `REPORT_DATE_ISO` 同時代表寄信日、manifest 日與網站 snapshot 日；`build_github_pages_data.py` 又讓台獎從 email body 檔名取日期。當 `0822.xlsx` 的資料範圍只到 8/21 時，正式 KPI parser 正確讀到 8/21，但 dashboard snapshot／readback 仍要求 8/22，因而被 fail-closed date gate 擋住。
- 修正：實際非 Git runtime 明確分成 `report_run_date`／`mail_date` 與 `data_cutoff_date`。Builder 從 `source_date_range` 取得 cutoff，並接受顯式 `--report-run-date`／`--data-cutoff-date` 交叉驗證；KPI／台獎 `report_date` 與 KPI `data_as_of_date` 都改用 cutoff，來源檔仍保留 `0822.xlsx`。Consumer、publisher、Keychain wrapper 與 manifest/readback 全鏈傳遞兩個日期；任一缺少、無法解析、晚於 run date 或正式讀回不一致都維持 blocked。
- 驗證（未發布）：Node 日期／正式 gate `20/20`；Python 日期契約與真實 8/22 本機產物 `3/3`。回歸案例確認寄信／檔名日 2026-08-22、資料截止日 2026-08-21 時，KPI／台獎 snapshot `report_date=2026-08-21`、KPI `data_as_of_date=2026-08-21`、`source_file=0822.xlsx`。未合併 PR、未部署 Pages／GAS、未執行正式私有資料發布或 readback。
- Repo 邊界：`report-automation` 位於 Git repo 外；本 Draft PR 保存可審查／可 rollback 的 runtime patch 與契約文件。合併 PR 不等於部署或套用 runtime，正式發布仍須由既有 Keychain wrapper 完成雙路徑 readback。

## 2026-08-21 ｜ Codex（P0 稽核門市自助回報簡化，Draft PR #72）

- Root Cause：正式門市頁仍依賴 Approved Device／名冊店點與 30 分鐘 audit-only session，現場 token 過期或裝置不符即無法繼續；前端另在 active batch 改變時直接建立空白草稿，會讓既有店點、姓名、備註與照片清單從畫面消失。
- 修正：門市改為自行選九店、填實際姓名與員編；首次 `audit_start` 後以 active batch、canonical store、`submission_id + edit_token` 驗證後續 upload/delete/submit/status/photo read。督導 overview/detail/photo/review/cancel 仍只接受 PT session，Drive 照片仍為 private 且 API 不回 file ID／URL。舊草稿採無損 migration，IndexedDB bytes 複製到新 submission key，不清 Safari storage。
- 驗證：完整 Node `243/243`；稽核 contract `12/12`；稽核 Chromium `9/9`；稽核 WebKit `9/9`。完整 Chromium `172/173`、完整 WebKit `170/173`；三個非全綠案例（半月逾時文案一案、WebKit `file://` CORS console 兩案）均在乾淨 `origin/main` `4f0baab52d2254c4b322b8a53a611973468db1f3` 以相同訊息重現。本 PR 對 `patrol.html`、`patrol-read-model.js`、`tests/patrol.spec.js` 與該半月測試皆 0 diff，依 Freeze 未越界修改。
- 狀態：程式與測試仍在同一 Draft PR #72 收斂中；尚未合併、部署或完成 Liam iPhone 實機驗收。正式完成前仍須 Pages／GAS 受控部署、API readback 與 Liam iPhone 三創三項送出。

## 2026-08-21 ｜ Codex（每日移動里程根因修復＋異常偵測，Draft PR #68／待正式部署）

- Root Cause：里程頁只掃本頁 `rawDetails`，reload／登出後候選明細被清空；固定 Y2606 對帳資料又會讓預設月份回到六月。另有第二層契約落差：看板 `ptsummary` 會由到店時間 fallback 月份，但 `ptdetail` 只看 `row.month`，所以月份欄缺漏時會「看板有、里程 API 0 筆」。8/4 同步修正未動里程來源，沒有涵蓋此問題。
- 修正：里程登入後以既有 PT 短效 token，按月份、九店、每頁 100 筆完整讀取 `ptdetail`；`ptsummary`／`ptdetail` 共用 `patrolSummaryRowMonth_()` 並回傳 canonical month，既有 8/1 起資料自動讀回，不寫回 Sheet。前端依日期＋canonical store 去重，同日同店多題／重讀只算一次；月份按 Asia/Taipei 解析。service-worker cache 已換版，避免正式手機保留舊 `patrol.html`。
- 異常偵測：新增來源列／去重店次／里程日一致性檢查；來源列 > 0 且里程明細 = 0 直接顯示 `⚠ 巡店已有 X 筆，但里程同步為 0 筆`。畫面與 console 記錄 `MILEAGE_NO_PATROL`、`MILEAGE_SOURCE_MISSING`、`MILEAGE_DATE_PARSE_ERROR`、`MILEAGE_STORE_MAPPING_ERROR`、`MILEAGE_CLOUD_READ_ERROR`、`MILEAGE_API_ERROR`、`MILEAGE_AUTH_ERROR`、`MILEAGE_DATA_FORMAT_ERROR`、`MILEAGE_CALC_ERROR`；異常時停用正式匯出。
- 驗證（未部署）：8/20 fixture 透過三創 101 筆跨兩頁＋六張犁 1 筆驗證為 2 店／4.5 KM，且 `rawDetails=0`；新增 7/8 月隔離、重讀去重、真無資料 0 KM、來源不一致、未知店點、timezone 跨日測試皆通過。Node `243/243`；完整 Chromium 功能 `171/176`，5 個逾時都停在與本次無關的 screenshot 寫檔，單 worker 重跑其中 2 個恢復，剩 3 個仍為 screenshot timeout；里程 24/24 全通過。正式 GAS／Pages 尚未部署，正式 8 月回補筆數、總里程與 iPhone readback 仍待 release 後確認。

## 2026-08-21 ｜ Codex（稽核 UAT 名冊 probe／Safari 私有照片恢復，PR #67 deployment candidate）

- 做了什麼：從 PR #66 合併後正式 `main` 建立隔離分支 `hotfix/audit-uat-roster-probe-photo-restore-20260821`。新增僅限 active `*-uat` 且既有 Trusted Employee audit session 的 `audit_roster_probe`，只回傳存在性、啟用狀態、遮罩名、名冊店點、九店映射及是否已有 Approved Device；不修改裝置綁定或 `last_login_at`，不回傳 employee hash／device ID，不換發受測同仁 token，也不讀 private snapshot／KPI／台獎。前端只有具該 UAT 權限時才顯示「員編名冊測試」，正式批次與一般員工都 fail closed。
- 結果（本機完成／待受控部署與 Liam UAT）：`ensurePrivatePhoto` 改為 async 並在所有路徑固定回 Promise，維持 `audit_photo_read → base64 → Blob URL` 私有照片合約；JS／CSS 加 PR #67 release query，root-scope Service Worker 同步 bump cache namespace，稽核 HTML 改為 network-first。Node `242/242`、完整 Chromium `168/168`、稽核 WebKit `15/15`；15 張 server photos 在 reload、重新驗證、`audit_status` 恢復後可載入縮圖與放大，Blob URL 在離頁釋放，console 無 `.then is not a function`。完整 WebKit 的 file／HTTP 環境結果與一個既有 Patrol fixture 差異另記於正式交接，不把它誤報為本 PR 全綠。
- 經驗 / 給下一位的提醒：正式批次必須繼續 `active=FALSE`，UAT 批次維持唯一 `active=TRUE`。部署只能從正式 GAS 最新版本最小更新 `AuditReport.gs` 並確認 `Code.gs` 十三條 audit dispatch，不得覆蓋 HalfMedia、ReportUpload、巡店 PR #63／#64 或其他正式函式。部署後先由 Liam 用真實 Trusted Employee 身分逐一 probe 名冊，再重開三創 UAT submission 驗證 15 張照片；完成退回／補件／通過／cancel 前不可啟用正式批次或通知九店。

## 2026-08-21 ｜ Codex（稽核 Approved Device audit-only follow-up，未部署）

- 做了什麼：從 PR #62 合併後的最新 `main` `5eddf26` 建立隔離分支 `fix/audit-approved-device-token-20260821`。取消門市批次回報碼，改由既有員編＋Approved Device 驗證後換發 30 分鐘 audit-only token；token 綁定員編雜湊、批次、名冊店點與 submission，店點不可自選。依 Liam 最新決策，名冊遮罩名只顯示「名冊辨識」提示，實際檢查人員姓名恢復必填文字欄位，由 `audit_start` 後端清理、長度驗證並寫入 submission／photo／timeline；姓名不綁 token。員編可持久化自動帶入，audit token 僅存分頁 session。後端只核對啟用名冊與裝置綁定，不呼叫私有戰情 access／snapshot，不把 Approved Device 的全區權限帶入稽核。
- 結果（本機完成／未部署）：正式 Sheet 已讀回確認 UAT `audit-cleaning-202608-uat` 與正式 `audit-cleaning-202608` 都是 `active=FALSE`。門市後續開始、上傳、刪除、送出、狀態與照片讀取仍需 audit token，並疊加既有 `submission_id + edit token` ownership；提交列保留不可逆 `auth_employee_hash`，舊回報碼 token 與缺少員編綁定的舊 submission fail closed。Node `238/238`、稽核合約 `16/16`（既有 15 案全保留）、稽核 Chromium `11/11`、稽核 WebKit `11/11`、指定稽核＋Patrol/Auth `60/60`。完整 Chromium 最新為 `159/163`，4 案只卡既有截圖等待穩定，其中 3 案獨立重跑通過；完整 WebKit `161/163`，2 案為既有 file-origin CORS console error。`gas/Code.gs`、巡店、半月、KPI、台獎與其他正式資料流無變更；本次未部署 GAS／Pages，正式批次未啟用。
- 經驗 / 給下一位的提醒：Approved Device 在本流程只作身分與單一裝置證明，不能直接重用可讀全區資料的授權回應；`masked_name` 也不能當成正式填報人。正式部署前須確認 `DASHBOARD_ROSTER_SHEET_ID` 與名冊店點 canonical value，並先以 UAT submission 驗證實際姓名落地、同店不同員編、跨店、token 過期與督導取消復原；本 follow-up 未獲准部署或開放九店。

## 2026-08-21 ｜ Codex（稽核回報受控部署 canonical blocker 與 rollback）

- 做了什麼：PR #62 已合入最新正式 main `0693468` 並保留 PR #63／#64；Liam 完成 `AUDIT_REPORT_SUBMIT_CODE` 手動 gate 與 `setupAuditReportStorage()`。初始化建立四個稽核 Sheet 與私有 `04_稽核回報_照片`，先建立 UAT 批次。GAS v59 部署後的 `audit_config` smoke 發現萬大仍回 provisional `DNB10xxx_wanda`、通化仍回 legacy `DNB10059`，因此沒有把 PR 轉 Ready、沒有合併或發布 Pages，立即把既有 deployment 指回 v58並停用 UAT 批次。其後只在 `AuditReport.gs` 固定既有正式 canonical ID（萬大 `DNB10168`、通化 `DNB10174` 等九店），不修改 `PT_STORES`、`patrol.html` 或巡店資料流。
- 結果（進行中）：rollback tag `rollback/audit-cleaning-predeploy-20260820-v2` 指向部署前 main；照片資料夾讀回 `shared=false` 且只有 owner 權限，四個稽核資料分頁尚無 submission／照片／事件資料。修正後 Node `234/234`、完整 Chromium `162/162`、完整 WebKit `162/162`、指定 Patrol/Auth/稽核安全案例 `30/30` 通過；PR #62 尚待新 commit push、重新部署固定版本及正式 UAT。
- 經驗 / 給下一位的提醒：稽核不能直接把巡店相容層 `PT_STORES.code` 當 canonical value；正式 UAT 前一定要讀回 `audit_config` 的九店 ID，看到 placeholder 或 legacy code 必須立即 rollback。v59 是已封存的失敗 smoke 版本，不可再指向正式 deployment；後續從修正後 PR head 建立新版本。未完成 iPhone／督導正式 UAT 前不得開放九店。

## 2026-08-20 ｜ Codex（北一二B 稽核回報專區，未部署）

- 做了什麼：從最新 `origin/main` `6564a68` 建立隔離分支 `feature/audit-cleaning-report-20260820`。在 `home.html` 新增稽核入口，新增手機優先 `audit-report.html/css/js` 與隔離 `gas/AuditReport.gs`；九店 canonical value 直接由既有 `PT_STORES` 解析。門市草稿以 localStorage + IndexedDB 保存，逐張壓縮／上傳／失敗重試，只有寫入後讀回一致才完成；督導總覽、逐項通過／退回與逾時重驗沿用既有 PT token。其後在同一 Draft PR #62 追加「整理方向」圖卡；本次再補 `AUDIT_REPORT_SUBMIT_CODE` 換發的 30 分鐘 submission-bound token、PT／ownership 保護的 `audit_photo_read`、Blob URL 生命週期，以及保留照片／事件的督導 `audit_cancel` 復原流程。
- 結果（Draft PR #62／未部署）：照片 metadata API 已移除 Drive URL／file ID，Drive 維持 private；匿名、錯誤／過期 token、跨門市越權、PT 私有照片讀取、取消保留證據與重新回報均通過。追加素材位於 `assets/audit/quality-management-reminder.png`；收到的附件實檔為 932×526 JPEG，未裁切／縮放／改字，只轉為 932×526 lossless PNG。Node `227/227`、完整 Chromium `160/160`、完整 WebKit `160/160`、GAS／JS syntax、diff check 與 390×844 overflow 通過；既有截圖位於 `docs/screenshots/audit-report-20260820/`。`gas/Code.gs` 只增加隔離 `audit_*` dispatch；`index.html`、`patrol.html`、`HalfMedia.gs` 及 KPI／台獎／每日回報／巡店／班表／半月資料流均未改。
- 經驗 / 給下一位的提醒：本輪不部署 Pages／GAS、不建立正式 Sheet 或照片、不等於 Liam 驗收。GAS 存檔不是部署；後續須從屆時最新 main 只套本次增量、新建 GAS version，先設定 `AUDIT_REPORT_SUBMIT_CODE`、記錄 rollback tag／舊 deployment version，再做正式私有權限、跨帳號照片 readback 與 iPhone Safari UAT。首批截止日暫定 `2026-08-31`，部署前由 Liam 確認。

## 2026-08-20 ｜ Codex（ptsummary 最近巡店紀錄 NA 判定 hotfix，未部署）

- 做了什麼：由最新 `origin/main` 的 PR #63 merge commit `bbaf045` 建立獨立分支 `hotfix/ptsummary-na-20260820`，只調整正式 `ptsummary.recentVisits` 與其唯讀 parity model 的單題已檢查判定；`result=v`、`result=na`、`reason=na` 視為已檢查，空白與真正缺失原因仍維持待補。沒有修改 `ptwrite`、Sheet schema、正式 66 筆巡店資料或其他巡店週期規則。
- 結果：程式與本機測試完成，尚未合併或部署。專項 Node `16/16`、完整 Node `222/222`、巡店與 auth Playwright `50/50` 通過；三創 `13 v + 20 na` 與含兩種 NA 的六張犁均為 `complete=true / missingItems=0`，空白及真正缺失 fixture 仍為 `complete=false / missingItems=2`。
- 經驗 / 給下一位的提醒：Apps Script editor HEAD 已含尚未部署的 `AuditReport.gs`／`audit_*` dispatch，不能直接從 editor HEAD 建立巡店 GAS 新版本。先保持 Draft PR，確認未混入稽核 PR #62；後續只能另行安排由乾淨 `main` 準備的最小 GAS hotfix 部署。本次未部署 GAS／Pages，也未寫入或修改正式資料。

## 2026-08-20 ｜ Codex（巡店貼上日期／NA 緊急防呆，Draft PR、未部署）

- 做了什麼：由最新 `origin/main` `cd3faf1` 建立獨立分支 `hotfix/patrol-paste-20260820`。`patrol.html` 的貼上 parser 改為先完整驗證整批，再一次更新候選；任一列「填表時間」為 `####` 或無法解析時整批拒絕，保留文字框與既有 `rawDetails`，且不呼叫 `cloudWrite`。未使用到店時間替代填表時間。`na` 同時相容「是否合格」欄與舊版原因欄，空白／`na` 原因正規化為 `reason:'na'`，真正的非 NA 原因文字保留。
- 結果：成功（本機程式／測試）。新增 8/20 的 66 筆 fixture，三創 33 筆、六張犁 33 筆；Node `221/221`、完整巡店 Playwright `43/43` 通過，涵蓋整批拒絕、零 cloud write、`rawDetails` 不變、貼上內容保留、新舊 NA、去重、正式摘要、班表、半月、媒體 mock 與里程回歸。
- 經驗 / 給下一位的提醒：Excel 顯示 `########` 不是可推導的日期值；不可用到店時間補造填表時間，否則會改變 `fillTime + store + item` 去重身分。此 hotfix 未修改 `gas/Code.gs`、Sheet schema、`gas/HalfMedia.gs`、正式 Sheet 資料、PR #62，也未合併或部署 Pages／GAS。

## 2026-08-18 ｜ Codex（台獎摘要金額單行與三創顯示名稱，未部署）

- 做了什麼：由最新 `origin/main` `b23a101` 建立隔離分支 `fix/awards-ui-store-label-20260818`。台獎摘要的「督導區實際／推估獎金」共用 `award-summary-money`，固定 `nowrap`、`keep-all`、`line-height:1` 並將金額字級調為 27px；六張摘要卡片只在台獎面板內補齊置中與等高規則。KPI／台獎共用 controller 新增純顯示層 `displayStoreName()`，只把 `台灣大哥大台北三創` 與 `台灣大哥大數位生活台北三創` 顯示為 `台北三創`。
- 結果（本機完成，未部署）：Node contract `216/216`、兩個 controller syntax、`git diff --check` 通過；本機正式 renderer 驗證 `$11,784` 為單行、六卡同高、三創選單文字／卡片文字為 `台北三創`，但 `option value` 仍是原始完整名稱，13 款篩選後數量與金額不變，console error `0`。前後截圖在 `docs/screenshots/awards-ui-20260818/`。
- 經驗 / 給下一位的提醒：本次未修改 `row.store`、`kpiBattleStoreKey()`、巡店 alias、GAS、正式 JSON/schema、資料計算、排序或統計；也未推送、PR、Pages/GAS 部署、正式資料 readback 或 Liam 實機驗收。後續若發布，需另走 release gate，不能把本機畫面證據當成正式上線。

## 2026-08-17 ｜ Codex（巡店上下半月雙輪進度，未部署）

- 做了什麼：只調整 Liam Supervisor App 「巡店」頁進度顯示；以既有 `ptsummary.halfDashboard` 的巡店檢查紀錄分開 H1（1–15 日）與 H2（16 日至月底），本期以 9 店為分母，另顯示上半月、下半月與整月 18 店次。保留題 14–33 原周期，並維持 `ptvisit_read/write` 到店／離店 session 與巡店完成統計分離。
- 結果（成功／未部署）：8/15、8/16、8/17、同店重複巡店與只按到店等 boundary 測試通過；Node `196/196`，Playwright `133/133`，390×844 無橫向溢出。未新增欄位，未修改 Sheet、GAS API、PT_TOKEN、reauth、hwrite、半月督導檢查或正式資料；未部署、未實機驗收。
- 經驗／給下一位的提醒：進度完成來源必須是既有巡店檢查摘要，不可以 `ptvisit` 到店 session 、本月最後到店日或「去過幾間不同門市」代替。

## 2026-08-17 ｜ Codex（Phase 1B：台獎戰情獨立化，implementation complete / awaiting Liam acceptance）

- 做了什麼：從正式 `origin/main` `a43ba42688125e68021ad1548e47ce1ca151e6b9` 建立隔離分支 `feature/phase1b-awards-battle-standalone`。新增 `awards-battle-controller.js` 與 `awards-battle.html`；原 `index.html` 與 standalone 共用同一台獎 controller，standalone 直接沿用既有 KPI controller 的 Approved Device／員編、`private_access → kpicalc_access`、同次正式 `snapshot.awardsBattle` 與 fail-closed。已移除 standalone iframe、程式化 click、`window.event` 與 DOM 遙控；沒有第二套 API、公式、JSON、快取、登入或 localStorage 台獎 fallback。原 index 台獎保留，`home.html` 順序為 KPI 第一、台獎第二。
- 結果（implementation complete / awaiting Liam acceptance）：Node `211/211`；台獎 standalone Chromium `5/5`、WebKit `5/5`，涵蓋 Approved Device、action 次序、未授權 fail-closed、日期／13 款／9 店完整性、原 index 與 standalone 九店逐店 exact match、390px 與返回大廳；原 index／KPI／App 聚焦 Chromium `54/54`，KPI WebKit `5/5`。完整 Chromium 為 `147/149`，兩個失敗已在乾淨同 SHA `origin/main` 以相同訊息重現：半月檢查既有 `5 / 9` 斷言，以及巡店里程入口 fixture 的九店 contract；均不屬 Phase 1B diff。
- 經驗 / 給下一位的提醒：App、Native/iOS、`gas/Code.gs`、`kpi-battle-controller.js`、`kpi.html`、正式 KPI／台獎 JSON/schema、Mail、Trigger、巡店、半月檢查、班表與回報邏輯均 0 diff。只可建立遠端分支與 Draft PR；未 Ready、未合併、未部署 Pages/GAS、未建立 rollback tag、未做正式資料 readback 或 Liam iPhone Safari smoke。下一步只等待 Liam 驗收決策，不得自行擴大到其他階段。

## 2026-08-16 ｜ Codex（Phase 1A.2：KPI Standalone 共用控制器，未部署）

- 做了什麼：從最新 `origin/main` `d12068f91185ac86117b414595700ca91ab2b43e` 建立隔離分支 `feature/phase1a2-kpi-controller-shared`。將 Approved Device／員編、`private_access → kpicalc_access`、KPI adapter、同次快照 supplement merge、店績／個績 renderer 與 fail-closed 抽到唯一 `kpi-battle-controller.js`；`index.html` 與 `kpi-battle.html` 均掛載同一 controller，standalone 不再以 iframe 遙控 index。沒有新增 KPI 公式、API、JSON、快取、登入或 localStorage KPI fallback。
- 結果（本機完成，未部署）：Node `205/205`；KPI standalone Chromium `5/5`、WebKit `5/5`，包含新舊日期／來源／整體／9 店／排名／DOD／加掛／保險／25 項 exact match、未授權 fail-closed、action 次序與 390px 無頁面級溢出；App／index Chromium regression（排除已證實 main 基線失敗）`52/52`。完整 Chromium 為 `143/144`，唯一失敗 `liam-supervisor-half-month-formal-read` 的既有 `5 / 9` 斷言已在乾淨同 SHA main 重現，非本次變更。
- 經驗 / 給下一位的提醒：本輪 App、Native/iOS、`gas/Code.gs`、`kpi.html`、正式 JSON/schema、Mail、Trigger、巡店、班表與回報邏輯均 0 diff；不得為了清除既有半月測試基線而越界修改 App。尚未推送、未建立 PR、未部署 Pages/GAS、未做正式資料 readback 或 Liam Safari smoke，也未進入 Phase 1B。

## 2026-08-16 ｜ Codex（智慧營運中心 Phase 1A：KPI 戰情獨立入口，未部署）

- 做了什麼：最初由 `origin/main` `fa40375` 建立隔離分支 `feature/ops-center-kpi-battle-standalone`；正式驗收前再 fetch，確認最新 main 為 `d8edb5557126c81418de305f11164373edfccc47`，並將原 commit `c2011d9` 無衝突 rebase 為 patch-equivalent `76422dc`。新增 `kpi-battle.html` 同源殼層，直接載入並切換到原 `index.html` 的既有 KPI 面板；`home.html` 同仁大廳新增第一順位「KPI 戰情」，原 KPI 與其他入口保留。
- 結果（Draft PR #53，待 Liam 正式驗收）：同步後 Node `204/204`；Phase 1A exact match、原 index、`kpi.html`、App 1.2 與 390px 聚焦 Playwright `40/40`。新舊日期、來源、北一二B整體、9 店、公司排名、DOD、加掛、保險搭售率與 25 項 KPI 逐區完全相同；權限 action 同為 `private_access → kpicalc_access`，未授權維持 fail-closed。遠端 Draft PR base 為指定 main、merge state `CLEAN`。
- 經驗 / 給下一位的提醒：`range-diff` 證明 rebase 前後 Phase 1A patch 等價；最新 main 新增的 `.github/workflows/publisher-shadow-preflight.yml` 與分支 blob 完全相同。`index.html`、`kpi.html`、App Freeze 檔案與 `gas/Code.gs` diff 均為 0。尚未 merge、未部署、未做正式 HTTPS／核准裝置／Liam 驗收；不得進入 Phase 1B 或順手處理台獎、回報拆分、App、GAS 或其他 backlog。

## 2026-08-12 ｜ Codex（半月 hwrite Security Review 修復，未部署）

- 做了什麼：依獨立 diff review，將 App 專用 hwrite 從 JSONP query 改為單次 POST body；移除 client URL chunk。新增 doPost hwrite route，沿用 ptauth token，server 先完整驗證 rows，再於 ScriptLock 內依 period/store/item 更新。App POST 拒絕非異常狀態的 note/improvement、evidence/media 與任意 extra field；既有 patrol.html JSONP hwrite 保持相容。
- 結果：POST URL 不含 token/payload，且 server 會拒絕 query token/payload；18 題單一 request、完整驗證先於寫入、unauthorized fail-closed、ScriptLock 競態保護、write→hread parity、跨店／跨期隔離與 390×844 測試已通過。Node 172/172、半月正式讀取與 hwrite Playwright 7/7；正式 hwrite 與 half_media_upload request 仍為 0，未 merge、未部署。
- 經驗 / 給下一位的提醒：既有 patrol.html 仍有不同的 legacy note/media semantics，不可用 App strict allowlist 直接破壞；App POST 與 legacy JSONP 必須維持分離的驗證選項。

## 2026-08-12 ｜ Codex（App 1.2 半月督導檢查 hwrite Predeploy，未部署）

- 做了什麼：在獨立 `feature/liam-supervisor-half-month-hwrite-integration` 分支，沿用既有 ptauth 1800 秒 token、`hwrite`、`hread` 與 H1/H2 規則，完成 18 題文字進度的明確 opt-in 儲存。到店只預選店點；只有 Liam 按「+ 開始半月督導檢查」、選店並按「儲存目前進度」才會寫入。每次 `hwrite` 後必須重新 `hread`，逐欄比對 period/store/item/status/note/improvement；不一致即顯示失敗。最近填寫日期只顯示可靠的 `YYYY/M/D`，不再產生 `0:00`。
- 結果（Predeploy Gate 通過，待 Liam review）：GAS 對既有 hwrite row 增加 auth-before-parse、九店／日期／期別／題號／狀態／extra field 嚴格驗證，business key 重複儲存不新增重複題目，且保留既有附件。Node 165/165、半月 hwrite Playwright 3/3、npm audit 0 vulnerabilities；正式 `hwrite` 與 `half_media_upload` request 均為 0，未部署 GAS／Pages。
- 經驗 / 給下一位的提醒：backend 沒有 completed flag，18/18 只能叫「18/18 已填」。媒體仍為唯讀且 `half_media_upload=0`。選定五頁籤回歸唯一未過是既有 2026-08-11 ptvisit fixture 在 8/12 today-only 規則下被排除；本輪依範圍不修改 ptvisit。

## 2026-08-12 ｜ Codex（App 1.2 Daily Report 門市回覆正式部署候選）

- 做了什麼：將獨立 hotfix `f4614d6` 以 cherry-pick 疊加在半月正式唯讀 release 之上，只保留 Daily Report 的 `zero_reason`、`zero_consult`、`zero_method`、`zero_plan` mapping、門市請益彙整、單店回覆、對應 contract/CSS/tests 與 cache bust。
- 結果（部署前 Gate）：兩時段互不沿用，空欄位不顯示，原文只做 HTML escaping；KPI、台獎、個績、班表、巡店、ptvisit、auth、Approved Device、Native shell 與 GAS write semantics 無變更。正式部署與 21:00 readback 仍須以後續 Gate 為準。
- 經驗 / 給下一位的提醒：正式 summary 未提供 canonical storeFeedback 時，唯一來源是同一 segment 的原始 `read.data[store].zero_*`；禁止跨時段帶值、推算或改寫原文。

## 2026-08-12 ｜ Codex（App 1.2 半月督導檢查 Formal Read，未部署）

- 做了什麼：從已通過 UI Preview 的 `51ce311` 建立隔離分支，只把既有 ptauth 1800 秒短效 session 接到 `hread`。新增純 read model，依正式 H1／H2、九店與題 1–18 篩選；`ok/abnormal/na/blank` 分別顯示符合／異常／不適用／尚未填寫。九店只呈現透明的「18/18 已填」「n/18 已填」「尚未填」，不建立 backend completed flag；openVisit 仍只提示與預選。
- 結果（成功，待 Liam review）：合成 fixture、未授權／逾時與 390×844 測試均通過；console error 0、橫向溢出 0、正式 write request 0。Liam 解鎖後正式 hread 讀回 2026-08 H1 為 1 店 18/18、4 店填寫中、4 店尚未填，有異常 1 店／1 項；大稻埕 18/18 無異常、歷史 H2 復興南 18/18 有異常、酒泉 7/18 三種店況的 item/status/原文/media/period/store/date 全欄 parity 通過。正式 `hwrite`、`half_media_upload`、GAS、Pages、Native 與既有 ptvisit／巡店 canonical 計算均未修改。
- 經驗 / 給下一位的提醒：hread 不暴露 worksheet 的正式 completed 欄位，因此 App 的 18 題 completeness 必須持續命名為「填寫進度」。既有 ptvisit fixture 固定 2026-08-11，在 08-12 會被 today-only 規則排除；依任務邊界只記錄，不可藉本次半月 read 修正它。

## 2026-08-12 ｜ Codex（App 1.2 半月督導檢查 Discovery／UI Preview，未部署）

- 做了什麼：從乾淨 `origin/main` 建立 `feature/liam-supervisor-half-month-preview-20260812`，只盤點正式 `patrol.html`／`gas/Code.gs` 的半月督導檢查資料、設計 read-only contract，並在 App 巡店頁加入第二層「巡店檢查／半月督導檢查」Preview。到店與半月檢查維持完全 opt-in；openVisit 只提示並預選店點，沒有自動開始、沒有呼叫 `hread`／`hwrite`／`half_media_upload`。
- 結果（進行中）：確認正式期別規則為 `H1=1–15 日`、`H2=16 日–月底`，固定 18 題，狀態為 `ok/abnormal/na/blank`；正式資料由 `hread` 回讀「半月督導檢查」worksheet，`hwrite` 與媒體上傳仍維持既有 ptauth 1800 秒短效 token。Preview Node／contract 15/15、390×844 App/Preview 10/10、既有 `patrol.html` 36/36；console error 0、橫向溢出 0、觸控目標至少 44px。未部署 GAS／Pages／Native，也沒有正式 write。
- 經驗 / 給下一位的提醒：現行 `hread` 不回傳 worksheet 的獨立建立時間與填寫狀態，且讀函式會透過 `getHalfCheckSheet()` 在缺表時建表；本輪只記錄，未改 GAS。App 正式接線前必須先決定 read adapter 是否補足 canonical status，並保持 Preview fail-closed。另有既有 App ptvisit 測試把日期固定為 2026-08-11，於 08-12 會被正式「只顯示台北當日」規則排除；本輪未越界修改 ptvisit fixture。

## 2026-08-12 ｜ Codex（App 1.2 店長績效語意修正，待部署／實機驗收）

- 做了什麼：從已部署個績區版本建立隔離分支 `hotfix/liam-supervisor-manager-semantics-20260812`，只修正「戰情 → 個績 → 北一二B → 職稱排名 → 店長」。店長列改以既有正式 `kpiStores` 顯示店 KPI、店公司排名、店 KPI DOD、店排名變化；AQ 仍只取店長 personal row 的正式 `AQ actual` 並提示距 10 點缺口。店長不再顯示或排序 personal `totalRate/rank/DOD/rankChange`，副店、其他業代與指標未達檢視維持原語意。
- 結果（進行中）：Node 全套 141/141；App 1.2 Chromium 390×844 2/2，console error、橫向溢出、ellipsis 與觸控目標 assertions 均通過。以 2026-08-11 正式快照副本驗證 9 位店長全部精確對應 9 店、依店公司排名排序，AQ 關注 7 人、AQ 缺值 0；Preview 特意放入店長 personal rank `1326` 與 totalRate `0`，UI 防洩漏測試確認兩者不顯示。完整五頁 smoke 的功能 assertion 已走完，但仍有既有巡店 full-page screenshot timeout 與跨日 visit fixture 失敗，未在本輪越界修改巡店。
- 經驗 / 給下一位的提醒：2026-08-12 Liam 已正式確認「店長沒有個人績效，店長看店績」；前一筆 2026-08-11 日誌要求忠實顯示店長 personal rank `1326` 的語意已被本次管理規則取代。此分支尚未合併／部署、未更新 Native release query、未完成 Liam 實機驗收，也未建立 final pilot tag。

## 2026-08-11 ｜ Codex（App 1.2 區個績職稱／未達檢視，待部署／實機驗收）

- 做了什麼：從乾淨 `origin/main` 建立隔離分支 `hotfix/liam-supervisor-personal-area-20260811`，只調整「戰情 → 個績 → 北一二B」。正式 `category/role` 映射為店長／副店／其他業代；職稱排名依正式 `rank` 由小到大、空值置後；指標未達只列非店長的 A999／好速／R1399 正式 `rate < 100%`，空值不當 0。第四張摘要卡改為店長 AQ `actual < 10`，只作管理提示，不重算總績效、KPI 或排名。店點模式沿用既有資料語意與來源排序。
- 結果（進行中）：Node 全套 140/140；390×844 個績專項、五頁籤互動、console、無 ellipsis／橫向溢出與 44px 觸控 assertion 均通過。完整 Playwright 10 項中 9 項通過，唯一失敗為既有巡店 full-page screenshot 在所有功能 assertion 通過後逾時。以 2026-08-11 已 `published-verified` 的正式快照副本做 source→adapter Gate：40 人＝店長 9／副店 11／其他業代 20，三項未達與 AQ 規則皆通過，另抽 5 人逐欄 exact match。
- 經驗 / 給下一位的提醒：正式來源目前 9 位店長的 `rank` 都是 1326，App 必須忠實顯示，不得以總達成率自行替換。此分支未包含 Daily Report 門市回覆 hotfix `f4614d6`，也未部署或完成 Liam 實機驗收；KPI、台獎、回報、班表、巡店、auth、Approved Device 與 Native 均未修改。

## 2026-08-11 ｜ Codex（App 1.2 個績＋每日回報摘要，待部署／21:00 live data）

- 做了什麼：從乾淨 `origin/main` 建立 `feature/liam-supervisor-app-1-2`。每日回報新增既有 GAS `read` 的唯讀 `formal-index-summary-v1` adapter，直接提供完成／缺店、更新時間、A999、好速、R1399、R999、保險搭售率與設備案佔比；App 只直通顯示，不從店列重算。戰情新增「個績」，沿用 Approved Device 保護下的 `private_access.snapshot.kpiBattle.personal`，顯示正式總績效、排名、DOD、排名變化與現有 10 項個人 KPI；正式來源沒有的「需要關注」與個人 25 項保持 `—`／不顯示。
- 結果（進行中）：全 Node 134/134、App 1.2 Chromium 390×844 2/2、npm audit 0；橫向溢出 0、可見數字無 ellipsis、相關 touch target ≥44px、console error 0。18:06 後正式 16:00 readback 為 9/9，A999 3、好速 2、R1399 6、R999 13、保險 50.5%、設備案 52.2%、更新 18:06:51；21:00 仍為 0/9，Gate 維持 `WAITING-LIVE-DATA`。尚未部署 GAS／GitHub Pages，不能把本機 mapping 當正式 App PASS。
- 經驗 / 給下一位的提醒：正式 16:00 資料會由 partial 變成 complete，測試保留 8/9 partial fixture，但 App 絕不可硬編當下數字。21:00 若正式欄位較少，adapter 必須省略欄位，不能把缺欄位變成 0 或帶入 16:00。KPI、台獎、班表、巡店、auth、Approved Device 與 Native shell 本輪未改。

## 2026-08-11 ｜ Codex（App 1.1 巡店最小修正，待部署／實機驗收）

- 做了什麼：只動巡店。擴充既有 `patrol-read-model.js`，讓 App 與 `patrol.html` 共用題 14–17、題 18、不同到店日期計數與一次巡店一列的聚合；App 巡店頁新增雙月全盤、每月盤點、九店本月次數、最近 10 次，以及獨立快速到店／離店。GAS 只新增 `ptvisit_read`／`ptvisit_write` 與獨立工作表 `巡店到離店紀錄`，既有 `ptread`／`ptwrite`／`sread` 語意與 schema 不變。
- 結果（進行中）：巡店 Node 契約與 Chromium/WebKit 390×844 回歸已通過；到離店驗證涵蓋短效 token、店點/action allowlist、server timestamp、額外欄位拒絕、open visit 配對與快速連點阻擋。尚未合併 main、尚未部署 GAS／Pages、尚未以 Liam iPhone 與正式資料驗收，因此不可宣稱正式完成。
- 經驗 / 給下一位的提醒：正式 ptread 只能可靠識別「店點＋不同到店日期」，同店同日多次沒有 session ID，只能計一次並明示 fail-closed。新到離店 `visitSessionId` 只服務新獨立紀錄，不得回寫或改造巡店明細。

## 2026-08-11 ｜ Codex（App 1.1 台獎店點指定機款補齊）

- 做了什麼：本輪只修正戰情 → 台獎 → 店點。店點模式直接映射正式台獎所選店的完整 `row.items`，保留來源已提供的機款名稱、達成率、實際、目標、50% 目標／差異、50%／100% 獎金與狀態；不再從全區 Top 2 推算，也不過濾、截斷或混入其他店機款。北一二B模式仍只列完整九店的店名、金額與領獎狀態。
- 結果（進行中）：等待契約、390×844、巡店 parity、Safari/WebKit 與 Native shell 回歸後部署。每日回報程式本輪完全不動；正式時段真人資料出現前，Gate 固定為 `WAITING-LIVE-DATA`，partial 可合法通過資料一致性驗收。App icon／Header Logo／Launch mark／favicon 僅記入 Visual Polish backlog，未修改任何圖示。
- 經驗 / 給下一位的提醒：正式網站的店點指定機款來源是該店自己的 `row.items`；App 只能逐欄轉接正式值。不得拿區 Top 2、九店合併結果或前端推算補出店點清單。

## 2026-08-11 ｜ Codex（App 1.1 實機巡店／台獎／KPI 修正）

- 做了什麼：只處理三個實機問題。巡店將 `patrol.html` 的 1–33 題、上下半月、題 18 固定雙月、題 19–33 每月 20 日前等純讀取計算抽成 `patrol-read-model.js`，正式巡店頁與 App 共用同一模型；台獎首頁與戰情改列完整九店、只顯示金額與「領獎／未領獎」，移除 Top 1／Top 2／機款欄，並拒絕把不同口徑的 aggregate `actual_total` 當區獎金；KPI 390px 店點列改成兩層排列，完整顯示 KPI、排名、DOD、排名變動與加減分。
- 結果（成功 / 失敗 / 進行中）：完整 `npm test` 為 Playwright 120/120，Node 契約 124/124、巡店同 fixture parity 2/2、巡店逾時草稿並行回歸 5/5、Chromium 390×844 6/6、WebKit/Safari 等價回歸 7/7、npm audit 0；console error 0、horizontal overflow 0、九店 KPI 觸控列皆至少 44px。另修正正式巡店頁初始雲端讀回可能覆寫尚未送出的半月表單草稿競態，只調整 render 時序，不改驗證或寫入規則。未修改 `gas/Code.gs`、OAuth、Approved Device、`ptauth` 或任何寫入 action。正式 Pages 合併／讀回及 Liam Native 實機複驗仍須分開確認。
- 經驗 / 給下一位的提醒：`ptread` 正式回應已有 rows 與 stores，不能再因缺少自訂 `summary/overview/period` 而讓月大盤整塊失效。台獎 aggregate `actual_total=179` 與店點千元金額不是可證明的同一幣別契約，前端不得相加或冒充區總額；來源未提供明確同口徑欄位時維持不顯示。

## 2026-08-09 ｜ Codex（Liam Supervisor Pilot 1.0 最小唯讀整合，待正式部署／實機驗收）

- 做了什麼：以最新 `origin/main` `b2e4533` 重整既有 `feature/liam-intel-app`；首頁依今日 Gate 固定為營運狀態、KPI、台獎、16:00／21:00 回報、今日班表、巡店提醒。KPI／台獎／回報只連既有正式頁；班表／巡店只重用正式 `ptauth` 短效 session，allowlist 固定 `sread`／`ptread`，未修改 `index.html`、`patrol.html`、`gas/Code.gs`、Sheet schema 或任何寫入 action。
- 結果（進行中）：本機 Node 契約 3/3、390×844 Playwright 3/3，HTTP／Service Worker 載入與 console error 掃描通過；npm audit 0。班表可顯示九店人員、班別、出勤／休假、店點與日期切換；巡店可顯示九店狀態、最近日期、待追蹤摘要與既有入口。正式部署、真資料三店勾稽、iPhone Safari／加入主畫面尚未取得證據，因此不可宣稱 Pilot 已上線。
- 經驗 / 給下一位的提醒：Service Worker 只快取 App shell，不快取 `sread`／`ptread`；通行碼不保存、token 只用既有 sessionStorage key。巡店摘要失敗必須 fallback 到既有巡店入口，不可顯示猜測值或拖延整體 Pilot。今日明確不做 Viewer B、TEST Admin recovery、金牌、店務檢查、多人登入或任何新架構。

## 2026-08-06 ｜ Codex（Liam 情報站 App 1.0 安全盤點與 PWA 空殼）

- 做了什麼：從最新 `origin/main` `31857ca` 建立 `liam-intel-app-baseline-2026-08-06` tag、可驗證 Git bundle／tar 備份，以及隔離 worktree 分支 `feature/liam-intel-app`。在分支中新增 `app.html`、manifest、Service Worker、離線頁、App icons、手機優先樣式與 App shell 契約／Playwright 測試；新頁只以原系統連結作為入口，未呼叫 GAS、Google Sheet、私有 Drive、D1 或 R2，也沒有寫入按鈕。
- 結果：本機 Node 契約 3/3、375px Playwright 2/2 通過；確認五個固定頁籤、iPhone safe area、44px 觸控目標、無橫向溢出、督導「Liam AI 指揮室」靜態預覽與離線 fallback。`index.html`、`home.html`、`kpi.html`、`kpitry.html`、`patrol.html`、`gas/Code.gs` 均未改動。
- 經驗 / 給下一位的提醒：此成果是未部署的 PWA 入口空殼，並不代表跨系統登入、KPI／台獎摘要、班表、公告、店務檢查或自動化狀態已串接。下一階段必須先定義最小只讀、已授權的摘要 adapter；不得把私有 JSON、名冊、員編、密碼、token 或既有 session 直接搬入 App。

## 2026-08-05 ｜ Codex（巡店單筆隔離寫入／清除驗收）

- 做了什麼：在 Liam 已完成督導通行碼登入的正式 Liam 情報站，僅新增一筆 `巡店明細` 隔離紀錄：`2026/8/5 20:00`、台北通化、題號 33，檢查人員與未查原因均為 `驗收測試_20260805`。頁面回覆「已同步至雲端（新增 1 筆，重複資料自動略過）」；重新整理後雲端看板本月已巡店數由 3 顯示為 4，確認走正式讀回路徑。
- 結果：已清除。以唯一識別字搜尋 `巡店明細` A1:L1272，唯一命中第 1272 列（完整欄位均為本次測試）後，只刪除該列；刪除 API 成功。再次重新載入雲端回覆「雲端已載入 1271 筆明細」，頁面不再出現 `驗收測試_20260805`，試算表精確搜尋亦為 0 筆。未操作班表、半月督導檢查、其他巡店列、KPI 快照或任何 PR。
- 經驗 / 給下一位的提醒：此頁面目前只有新增／讀回介面，沒有單列刪除控制；若必須做正式隔離測試，需使用唯一識別字，讀回精確定位列後以 Google Sheets row delete 清除，並再做頁面與工作表雙重讀回。看板店點彙整可能含另一筆既有通化紀錄，是否有任何非測試資料的併發異動需另依來源紀錄追查，不能把它歸因於已刪除的測試列。

## 2026-08-05 ｜ Codex（正式營運中心安全驗收）

- 做了什麼：以加上驗收參數的正式 GitHub Pages 請求逐一開啟 `home.html`、`index.html`、`kpi.html`、`kpitry.html`、`patrol.html`；全部非 404，且 `home.html` 唯一入口仍只連向每日回報、同仁 KPI 試算、公開 KPI 模擬器與需通行碼的 Liam 情報站。每日回報僅用既有 `2026-07-20 16:00` 做唯讀日期回放，沒有新增或覆寫 2026-08-05 資料。
- 結果：每日回放成功讀到 9 間門市、顯示「全數填報」；畫面未出現 `1899-12-30`。 `origin/main` 的 `readData()` 已以 `getDisplayValues()` 讀取 `savedAt`，與 PR #23 的核心修正等效；但 PR #23 的文件／測試提交本身不在目前 main，且本次頁面未顯示原始 `savedAt` 欄位，故保留 PR #23，不能以本次驗收宣稱整支 PR 已納入。巡店頁要求督導通行碼，未在無憑證情況下寫入、刪除或讀取正式資料，隔離測試維持 blocked。KPI 不重複發布：Drive `north12b-dashboard-private-latest.json` 讀回為 `report_date=2026-08-05`、`data_as_of_date=2026-08-04`、`source_file=0805.xlsx`、`publishedAt=2026-08-05T07:57:29.761Z`，與最新正式來源一致，檔案為 owner-only／未分享。PR #25 已留言「獨立台獎預覽流程尚未正式驗收，本次不合併，相關成果留作後續參考」後關閉（未合併）；PR #33 的班表匯入／`swrite` 功能未在目前 main 找到等效實作，且未完成正式 GAS 驗收，保留不關閉。
- 經驗 / 給下一位的提醒：通過「可開頁」不等於可寫入驗收。巡店驗收需要由 Liam 提供一次性、可撤銷的督導測試授權，才能完成「建立 → 已同步雲端 → 重整讀回 → 刪除 → 重整確認清除」；KPI 若遠端快照的 `report_date` 已與最新來源一致，應跳過發布，保留 Drive 讀回而非重覆覆寫。

## 2026-08-05 ｜ Codex（KPI 保險搭售率與台獎篩選門檻）
- 做了什麼：KPI 店績摘要與排名表在「加掛」後新增實際「保險搭售率」。本機快照建立器以同日、同來源檔的 `supplemental_daily_report` 補入北一二B整體及九店的 `insurance_attach_rate`；若報表日期或來源檔不一致，拒絕補值。台獎上方排序卡維持不變；下方 13 款篩選新增「北一二B整體」，預設選北一二B時顯示每款督導獎金 80%／100%，改選店點時才顯示店長獎金 50%／100%。
- 結果（成功 / 失敗 / 進行中）：以 0805 正式產物重建驗證：北一二B保險搭售率 `46.154%`，九店皆有實際搭售率；vivo X300／V70 FE 範例，北一二B 80%／100% 為 `$2,215`／`$3,410`，店點 50%／100% 為 `$2,130`／`$3,195`。契約測試 17/17、介面測試 32/32 通過。
- 經驗 / 給下一位的提醒：篩選器的北一二B金額只取 `supervisor` 規則的 80%／100%，店點金額只取 `manager` 規則的 50%／100%，不得把兩條獎金軌合併；上方實際獎金排序與優先補量卡不因篩選器而改動。

---

## 2026-08-05 ｜ Codex（KPI／台獎日期契約與同次快照補值）
- 做了什麼：修正 `index.html` 將 KPI 的「戰報發布日」與來源「資料截止日」混用的問題。`kpicalc_access` 仍是 KPI 實績、目標、店點總達成與指標的唯一來源；只有私有 snapshot 的 `report_date`、`data_as_of_date`／`source_as_of_date`、`source_file` 全部與 kpicalc 一致時，才補入公司／個人排名、DOD、加掛得分、個人台獎與保險搭售率。台獎一致性改比 `report_date`。本機 `build_github_pages_data.py` 也將快照補齊 `data_as_of_date` 與 `source_file`。
- 結果（成功 / 失敗 / 進行中）：0805 契約資料已驗證為戰報日 `2026-08-05`、資料統計至 `2026-08-04`、來源檔 `0805.xlsx`、公司排名 `34`、整體 KPI `109.7%`、加掛 `12.35`、KPI `9` 店／`41` 人、台獎 `13` 款／`10` 列。前端與契約測試同時保護 `gas/Code.gs`、`patrol.html` 不得變更。
- 經驗 / 給下一位的提醒：先前 2026-07-31 的「不得混入 snapshot」規則只適用於未驗證或舊快照。本契約以三項同次來源門檻取代它；任一項不符時必須維持「尚未同步」，不可回退到 localStorage 或舊 JSON，也不可拿 `data_as_of_date` 當 `report_date`。

---

## 2026-08-04 ｜ Codex（正式 Apps Script v26 與直接 POST 傳輸修復）
- 做了什麼：以遠端 `main` 的 `9f3e729` 為基準完成 Apps Script v26 部署，並將 `index.html`、`kpi.html` 的正式 GAS 請求從隱藏 iframe 改為直接 `fetch` POST；另加入管理者私有快照狀態讀回路由供發布驗證。
- 結果（成功 / 失敗 / 進行中）：Apps Script v26 已成功更新，HTTP 200 / `status=ok` 已確認；iframe 在 Chrome 實測會逾時，直接 POST 修復待 GitHub Pages 建置後重新驗收。
- 經驗 / 給下一位的提醒：Apps Script 端點可直接 POST 時，不能只以頁面 HTTP 200 判斷前端可用；必須實際驗證登入、回報寫入與快速更新流程，並以瀏覽器截圖及雲端讀回作為完成證據。

---

## 2026-07-31 ｜ Claude（方案 A 實作：index.html KPI 戰情改讀 kpicalc 唯一正式來源）

- 做了什麼：依 Liam 拍板實作方案 A。`index.html` KPI 戰情頁籤登入後改打 `kpicalc_access`
  （與 kpi.html 完全同一份受保護 JSON、同一個第 15 版主部署，**GAS 零改動、零新部署**），
  新增 `kpicalcToKpiBattleView()` 轉接層餵給既有渲染器；`_kpiBattleData` 不再吃
  `snapshot.kpiBattle`，KPI 頁籤的本機快照回退移除（台獎頁籤與其回退**完全未動**，
  snapshot 降為台獎來源＋舊版回復）。另補齊正式驗收清單（HANDOVER §7.10）。
- 結果：新契約測試 `kpi-battle-source.test.cjs` 11/11（含轉接層實際執行）、
  `app.spec.js` KPI 戰情段落改寫後 31/31、上傳 33/33、契約 70/70。
  **未建 PR、未合併、未部署**；等 Liam 建立上傳 Deployment 後照 §7.10 驗收。
- 經驗 / 給下一位的提醒：
  1. **缺少欄位的鐵則**：company_rank／DOD／加掛分／個人排名／個人台獎／保險搭售率
     不在 kpicalc JSON——畫面一律「尚未同步」（`kpiPendingCell()`）或不出現（DOD），
     **絕不混入 snapshot 舊數字**。Playwright 有反向斷言（加掛 13.36、整體 105.5%、
     DOD 字樣、val-gold 排名節點 = 0）。要補這些欄位的正道是擴充 `kpiCalcParseReport`
     從同一份 Excel 讀，不是把 snapshot 接回來。
  2. **轉接層只搬運與加總，不發明數字**：店點總達成率直接取 `official`；
     整體核心項＝各店 a/t 純加總；整體總達成率需加權、無法由 kpicalc 推得 → null（尚未同步）；
     進度差由同一組 meta（snapshotDay/monthDays）換算。有逐條行為測試。
  3. **updatedAt 目前拿不到**：第 15 版 `kpicalc_access` 回應沒有檔案 mtime，
     來源列顯示「更新時間 尚未同步（讀取於 <本機時間>）」。想補它要等主部署未來升版時
     在 kpiCalcAccess 回應加 `updatedAt`，不值得為此動第 15 版。
  4. **登入順序刻意台獎先渲染**、kpicalc 包獨立 try——kpicalc 失敗只影響 KPI 頁籤，
     訊息寫明「台獎頁籤不受影響」。
  5. 測試小坑之前也踩過一次：契約測試用 `doesNotMatch` 禁字時，**程式註解裡的
     識別字也算命中**——註解請改寫成不含禁字的說法，不要放寬測試。

## 2026-07-31 ｜ Claude（分支校正＋資料鮮度診斷落檔＋獨立上傳 Deployment 隔離）

- 做了什麼：依 Liam 指示停用舊分支 `claude/quick-report-upload-feature-elyajz`（含 bde4c6b
  事故歷史），從去污染驗收的 `claude/quick-report-upload-clean`（bc9301b，base adf7542）建出
  `claude/report-data-freshness-hotfix` 繼續。三件事：
  ①把「網站顯示舊資料」現場診斷**重寫**進本分支文件（HANDOVER §7.9，只搬文件不搬舊分支程式碼）；
  ②實作**部署隔離閘**：`reportUploadIsUploadDeployment_()` ＋指令碼屬性
  `REPORT_UPLOAD_DEPLOYMENT_URL`——當請求由「上傳專用 Deployment」服務時，doPost 只放行
  `report_upload_*` 四路由、doGet 只回 ping（帶 `app:'report-upload'` 識別），
  其餘 read/write/巡店/戰情一律拒絕；屬性未設定＝隔離不啟用，主部署行為不變（安全預設）；
  ③`report-upload.html` 改用獨立 `UPLOAD_GAS_URL` 常數（CHANGE_ME 佔位），
  不再引用每日回報端點，佔位未填時登入直接被擋、零請求送出。
- 結果：契約測試 70/70（新增 4 條：路由白名單恰為四個、doGet 隔離、隔離函式六情境行為、
  前端端點分離）、Playwright 33/33（新增佔位守門＋卡片標示）。HANDOVER §11 改寫為
  雙 Deployment 部署程序（含驗證與一鍵回滾）。**未建 PR、未合併、未部署。**
- 經驗 / 給下一位的提醒：
  1. **每日回報 Deployment 固定第 15 版**：貼新碼進編輯器不影響它；部署上傳功能時走
     「部署 → **新增部署作業**」拿全新 /exec URL，**絕不要 ✏️ 編輯既有每日回報部署**。
     回滾＝清空 `REPORT_UPLOAD_DEPLOYMENT_URL` ＋封存新部署，每日回報全程不受影響。
  2. **隔離判斷靠 `ScriptApp.getService().getUrl()` 比對屬性**：時間觸發器沒有 getUrl，
     函式以 try/catch 包住一律回 false，排程不受隔離影響（有行為測試）。
  3. **上傳頁端點固定寫死、無任何瀏覽器儲存覆寫**（bde4c6b 事故後的資安基準）；
     `window.__UPLOAD_GAS_URL_OVERRIDE__` 僅供 Playwright 在頁面載入前注入，正式頁不設。
  4. 診斷結論（Liam 已確認）：kpi.html 與 index.html **不是同一正式資料來源**——
     前者吃 GAS 排程產的 kpicalc JSON，後者吃 Liam 本機 Mac `report-automation` 產的
     dashboard snapshot。7/31 未更新＝來源資料夾沒有 0731.xlsx ＋本機流程沒重跑，
     不是程式壞掉。`Y26重點台獎手機.xlsx` 確認就是獎階表。
  5. 綜合戰情一致化：建議**方案 A**（index.html KPI 頁籤改讀 kpicalc JSON，GAS 免部署、
     不複製第二份真相），但 company_rank／DOD 欄位不存在於 kpicalc JSON，需 Liam 先接受取捨。
     比較表在 HANDOVER §7.9。
  6. 台獎雲端化仍缺：`Y26重點台獎手機.xlsx` 的獎階內容（工作表／欄位）、
     `update_phone_awards.py` 原始碼（或欄位對照邏輯）、`difference` 規則確認。
     拿到前不寫台獎解析器；本機發布流程照舊保留。

## 2026-07-31 ｜ Claude（快速上傳去污染：從回復後的 main 重建乾淨分支，待 Liam 驗收）

- **背景**：`claude/quick-report-upload-feature-elyajz` 是從事故 commit `62cbe1e` 分出去的，
  base 內含 `bde4c6b`，其 `index.html` 仍帶著「請輸入已核准裝置的員工編號」。
  直接合併會讓當天的全門市中斷事故完整重演。
- **做了什麼**：**不用盲目 rebase**。從回復後的 `origin/main`（`adf7542`）開
  `claude/quick-report-upload-clean`，先逐一盤點原分支 6 個 commit，確認它們
  **完全沒有動 `index.html`／`kpi.html`／`patrol.html`**，污染風險只集中在 `gas/Code.gs`。
  再以 `git diff 62cbe1e..42e3036` 隔離出「純上傳變更」（此區間已排除 `bde4c6b`），
  只把這份差異套到新 base，新檔案（`report-upload.html`、3 份 SPEC/FILE-MAP/HANDOVER
  文件、2 支測試）直接取自原分支。**原分支保留不刪、不改寫，作為備份。**
  原分支的 `docs/COLLAB-LOG.md` 刻意不搬——它基於事故版，搬過來會蓋掉事故紀錄。
- **結果**：`index.html`／`kpi.html`／`patrol.html` 與 main **diff 為 0 行**；
  `gas/Code.gs` 只新增 5 處（doPost 4 條 `report_upload_*` 路由、`kpiCalcPublish` 與
  `privateDashboardPublish` 各 6 行只登記版本、`kpiCalcAutoUpdate` 19 行排程防覆蓋、
  檔尾 824 行上傳模組）。`doGet`／`readData`／`writeData`／`readPersonal`／`writePersonal`／
  `privateDashboardAccess`／`kpiCalcAccess`／`privateDashboardIsTrustedEmployee`
  **逐函式 md5 與 main 完全相同**。全 repo 掃不到 `ensureReportSession`／`protectedGasPost`／
  `reportSessionRequired_`／`report_auth` 任一個。
  測試：Node 契約 **78/78**、`report-upload.spec.js` **31/31**、`app.spec.js` **30/30**。
- **經驗 / 給下一位的提醒**：
  1. **上傳功能的授權與每日回報是分開的，請維持這樣。** `reportUploadAuthorize_()` 走的是
     `DASHBOARD_ADMIN_SECRET` ＋ `REPORT_UPLOAD_ALLOWED_EMPLOYEES` 白名單
     （未設定時退回 `DASHBOARD_TRUSTED_EMPLOYEE_ID`），**完全不碰 `DashboardUsers` 裝置名冊**。
     它只保護「上傳與發布」這個管理動作，不是登入閘門。
  2. **命名沒有衝突但很接近，改的時候看清楚**：上傳模組是 `reportUpload*`／`reportVersion*`，
     事故那組是 `reportSession*`／`report*Payload_`。前者可留，後者不可回來。
  3. **`tests/patrol.spec.js` 在這個容器裡本來就不穩定**。實測 `origin/main` 原始碼連跑兩次，
     失敗集合分別是 {341,365,545,783} 與 {341,365,525,535,783,798}，每次都不同。
     其中 341／365 是 headless_shell 不回傳 `download.suggestedFilename()` 的固定環境問題。
     **判斷回歸請單獨重跑該測試，不要只看一次全量結果就下結論。**

## 2026-07-31 ｜ Claude（🚨 正式站全門市回報中斷事故：回復 bde4c6b 程式碼，保留事故文件）

- **事故**：全門市開 `index.html` 即跳瀏覽器 prompt「請輸入已核准裝置的員工編號」，
  輸入員編也進不去；每日回報讀取與儲存全數失敗，當日回報資料有持續遺失風險。
- **根因**：`bde4c6b`（Codex，07-31 01:03，已推 main 並部署 Pages run `30564346083`）
  把每日回報綁進了**只給 KPI／台獎私有戰情用的 `DashboardUsers` 裝置核准名冊**。
  `window.onload`（`index.html:2288`）→ `fetchDayData()` → `ensureReportSession('employee')`
  → prompt。**門市同仁從來沒被登錄進那份名冊**，所以無人能通過。
  疊加另兩項回歸：①`privateDashboardAccess` 與 `kpiCalcAccess` 兩處的
  `privateDashboardIsTrustedEmployee()` 豁免被刪，信任員編換裝置即鎖死；
  ②員編／session／`bei12b_kpi_emp`／`bei12b_shadow_*` 全改成純記憶體變數，
  重新整理就登出、影子備份救援機制同時失效。
- **範圍釐清**：**不是**資料遺失、**不是**路由錯誤、**不是** onclick 綁錯或載入順序問題，
  也**與 `claude/quick-report-upload-feature-elyajz` 無關**（`42e3036` 未合入 main，已用
  `merge-base --is-ancestor` 驗證）。`DashboardUsers`／`DashboardRequests` 兩張表
  **完全沒被動過**——`bde4c6b` 只改比對條件，未改任何名冊寫入或刪除邏輯。
- **做了什麼**：依 Liam 指示執行方案 B 止血。**只回復造成事故的程式碼檔案**至
  `dadd286`（`bde4c6b` 的 parent，已驗證為事故前最後正常版）：
  `index.html`、`kpi.html`、`gas/Code.gs`、`patrol.html` 與對應測試；
  **刻意保留** `docs/PATROL_SECURITY_REVIEW_20260731.md`、Codex 的事故當事人紀錄、
  Playwright 1.55.1 升級與 `playwright.config.js` 的可攜性修正。
  未 force-push、未改寫 git 歷史、未碰任何正式資料與核准紀錄。
- **結果（已完成止血，正式站恢復）**：Node 契約 12/12、Playwright 66/68。
  那 2 個 fail（`patrol.spec.js:341/365`）**在事故版 62cbe1e 上跑也同樣 fail**，
  是 headless_shell 不回傳 `download.suggestedFilename()` 的環境問題，非回歸。
  Liam 先完成 GAS「每日回報 Deployment」第 22 版 → 第 15 版切版並實測讀寫正常，
  之後 `1799d58` 以 fast-forward 推上 main（`62cbe1e..1799d58`，未 force-push），
  Pages run **`30620023862` 部署成功**（2026-07-31 09:28:43Z）。
  巡店 Deployment 與七分頁 Deployment 依判斷**維持原狀未動**——
  `bde4c6b` 未改動 `ptread/ptwrite/hread/hwrite/sread` 契約，`dadd286` 版 `patrol.html`
  與第 22 版巡店 API 相容；七分頁專案無前端 API，回退只會白白拆掉與本事故無關的
  公式注入防護。
- **⚠️ 未爆彈：`claude/quick-report-upload-feature-elyajz` 是從事故 commit `62cbe1e`
  分出去的**，因此**含有 `bde4c6b`，其 `index.html` 仍帶著那句 prompt**。
  該分支目前未合入 main、不影響正式站，但**直接合併就會讓整起事故重演**。
  接手前必須先 `git rebase --onto 1799d58 62cbe1e` 或改由新 main 重開分支。
- **經驗 / 給下一位的提醒**：
  1. **本機 `origin/main` 會過期，只看本機 branch 會完全誤判事故版本。**
     這次一開始看到的 main 是 `857a536`，重新 `git fetch` 後才發現已被推到 `62cbe1e`。
     查正式站事故，第一步一定要先 fetch。
  2. **每日回報與 KPI／台獎共用同一個 Deployment `AKfycbwf…onDIl4Mi`**
     （`index.html` 與 `kpi.html` 都指它），巡店是另一個 `AKfycbznzo…Grghd-Mv`。
     動其中一個的授權條件會同時影響兩個系統，改之前務必確認影響面。
  3. **授權範圍不等於授權強度。** 把「少數人的裝置核准名冊」套到「全門市每天在用的路徑」，
     就算每一行程式都正確、測試全綠、資安報告 0 高風險，結果仍是全站中斷。
     新增授權時要先問「現在有多少人在這份名冊裡」，而不是只問「這樣夠不夠安全」。
  4. GAS Deployment 版本回復**只需在原 Deployment ID 選回舊版，不要貼 `Code.gs`**——
     貼碼就會重演 2026-07-25 的 `kpiCalc*` 無聲洗掉事故。

## 2026-07-31 ｜ Codex（匿名讀寫 P0 資安修補與正式 GAS 部署）

- 做了什麼：只針對本次確認的匿名讀寫與瀏覽器敏感資料風險做最小修補。
  `read/write/pread/pwrite` 已停止 GET／JSONP 存取，改為 GAS 後端驗證短效
  session；員工 session 必須同時符合啟用名冊、員編與已核准裝置，`pread`
  僅限督導，員工 `read/write/pwrite` 另受店別範圍限制。session 只存記憶體，
  登出會在後端撤銷；姓名、員編、改善內容與私有附件不再寫入
  localStorage／sessionStorage。另固定受保護 GAS URL、移除 repo 內固定通行碼，
  補上輸出 HTML escaping、七分頁公式注入防護與 Drive 連結 allowlist。
- 結果：正式七分頁 Script `17XfhB1cYOIWIyIm0_1mO1a9-ba-H4QCBJHX56bYHiEX06XSSG05FWtlg`
  由第 19 版更新至第 20 版；正式主 Script
  `1SW9qr0CU9Xvy97XkVr3n51_4Dx_6GArnTXT8780t0HofIB74v9IDMkWf`
  的巡店與每日回報兩個 Deployment 均更新至第 22 版。`PT_KEY` 已輪替並只保存在
  Script Properties，管理用副本在 macOS Keychain。完整本機契約 20/20、
  Playwright 71/71、npm audit 0。正式匿名、假 token、模擬過期 token、登出後舊 token
  均只回 unauthorized；匿名寫入隔離標記授權讀回為 0 筆。GitHub Pages
  `bde4c6b` 的 run `30564346083` 成功；正式桌機無痕 A／B／C 與 390×844 行動版
  均通過，行動版另確認 11 天／74.5 KM、對帳相符、正式 Excel 可下載且無水平溢位。
- 經驗 / 給下一位的提醒：Apps Script ContentService 無法自行設定 HTTP status，
  因此外層 HTTP 仍為 200，應以 JSON `status:"error", code:403` 判斷拒絕。
  部署前備份位於
  `private-backups/patrol-security-predeploy-20260731004841/`；四個既有觸發器未重建。
  正式金鑰不可回填 repo、文件或瀏覽器 storage；若要回滾，應在原 Deployment ID
  選回第 19／15／21 版並以備份最小還原 HEAD，不能整份六分頁覆蓋七分頁專案。

## 2026-07-30 ｜ Codex（巡店里程＋正式 GAS 七分頁安全整合，待 Liam 驗收）

- 做了什麼：由最新 `origin/main` `f4de11f` 建立
  `integration/patrol-mileage-gas7-20260730`；確認里程最終 commit `c5bf782`，只取其
  `patrol.html`、`tests/patrol.spec.js` 與協作紀錄內容。另以 Apps Script 後台實測鎖定
  4-trigger 專案 `17XfhB1cYOIWIyIm0_1mO1a9-ba-H4QCBJHX56bYHiEX06XSSG05FWtlg`，
  完整備份正式 `程式碼.gs`、`appsscript.json`、第 19 版部署與 4 個觸發器；把線上第七分頁
  `改善提醒與照片` 的 7 個獨有函式與 `sendWeeklyPatrolReport` 最小差異納入 repo，
  未整份覆蓋任一正式專案。
- 結果：Y2606 11 個報銷出差日／74.5 KM、6/15 4.4＋10.0＝14.4、油料 11 列、
  距離明細 12 段與空白備註均通過；Node／GAS 契約 12/12、完整 Playwright 68/68。
  里程 DOM 仍位於 P0 驗證後才建立的 template，所有頁籤共用 verified session。
  `patrol.html` 正式 API 仍指向另一路第 21 版專案 `1SW9...`，URL 未改。
- 經驗 / 給下一位的提醒：目前是兩個正式 Apps Script 角色，不可只看同名專案。
  里程是純前端，不需要 GAS 新版；未經 Liam 驗收不得部署 Pages，也不得把 repo
  `gas/Code.gs` 整份貼到任一專案。4-trigger 專案排程跑 editor HEAD，切回 Web App
  第 19 版不會回滾觸發器程式；需用安全備份還原 HEAD。另因 Y2606 路線／公里數、
  成本歸屬與車號預設值仍是 `patrol.html` 內的靜態 JavaScript，P0 DOM gate 無法阻止
  view-source；Liam 尚未確認可公開或授權改由 verified token 後載入前，正式部署維持
  blocked。詳見
  `docs/PATROL_MILEAGE_GAS7_PREDEPLOY_20260730.md`。

## 2026-07-29 ｜ Codex（P0 Liam 情報站全站權限修復）

- 做了什麼：由執行當下最新 `origin/main` 建立
  `security/patrol-full-auth-gate-20260729`；先以獨立 commit `c67e012` 關閉
  `home.html` 督導入口。`patrol.html` 改為正式 GAS 回 `status:"ok"` 前只建立全頁鎖定，
  不建立督導 DOM、不執行 render／cloudLoad、不切頁或讀取巡店、班表、半月資料。
  通行碼只送一次，成功後改用 sessionStorage 的 30 分鐘 token，登出與錯誤驗證清除全部狀態。
  正式 GAS 只套用權限最小差異：`PT_KEY` 移至 Script Properties，全部巡店／班表／半月／媒體
  action 統一後端驗證，`ping`／`pthealth` 只保留最小健康資訊。
- 結果：成功。正式 Apps Script 專案
  `1SW9qr0CU9Xvy97XkVr3n51_4Dx_6GArnTXT8780t0HofIB74v9IDMkWf`、
  Deployment ID
  `AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv`
  已由第 20 版更新至第 21 版。GAS 負向契約 8/8、Node 9/9、Playwright 51/51，
  正式 A/B/C 全新隔離瀏覽器與登出驗收全數通過。確認既有 KPI、自動更新、通知與週報
  關鍵函式仍存在後，入口才由 commit `f17e41e` 重新開放；Pages run `30448659037` 成功。
- 經驗 / 給下一位的提醒：前端顯示密碼框不等於授權；巡店主頁本身也必須受同一個
  verified session 約束。正式密碼不得進 repo／文件／localStorage。後續若權限回歸，
  先重新套用 `c67e012` 的緊急關閉，再將 GAS 部署切回第 20 版；未完成正式 GAS 與無痕
  驗收前不得重新開放入口。正確憑證的寫入／媒體上傳仍需另行指定安全測試資料。

## 🔴 進行中／待辦（2026-07-30 更新，接手者先看這段）

**狀態：全線正常。11:00 排程已在 0730 首次獨立驗證成功（非人工補救）。**

| 項目 | 狀態 |
|---|---|
| repo 程式碼 | ✅ `gas/Code.gs` **2028 行**（自動化＋通知信＋日報格式回退＋Codex P0 權限修復）；已部署第 21 版 |
| 通行碼 | ✅ 已移至 Script Properties（Codex P0 修復），repo 與文件均無明碼 |
| Drive API 進階服務 | ✅ 已啟用（0729 由 Codex 補上） |
| **11:00 自動更新** | ✅ **0730 排程自主跑通**：台北 **11:51** 寄出 `✅ KPI試算資料已更新（0730.xlsx）`，主旨無「手動發佈」字樣，私有檔 modifiedTime 同步為 03:51Z，累計推進到 07/29 |
| 12:30 巡檢 | ✅ 正常（今天自動更新成功 → 巡檢靜默不寄信，符合設計） |
| 同仁看到的資料 | ✅ 累計 **07/29**，區平均 1.085、8/9 店破百（僅通化 0.9189 未達標） |
| patrol.html／home.html／督導試算區 | ✅ 全部上線 |

### ⏰ 重要：11:00 排程實際落在 **11:51**，不要在 11:20 就判定失敗

`setupKpiCalcAutoUpdate()` 用的是 `.atHour(11)` **而沒有 `.nearMinute()`**，GAS 這種寫法
會在 **11:00–12:00 之間任意時間**觸發。實測這個專案穩定落在 **11:51**
（7/21 與 7/30 兩次成功排程都是 11:51 寄信）。

**踩過的誤判**：2026-07-30 我排了 11:20 的自動回檢，看到「沒有任何信 + 私有檔沒更新」，
差點依當時自己寫的判讀規則宣告「觸發器沒建立成功」。實際只是窗口還沒到。
**要驗證當天排程結果，請在台北 12:00 之後再查**（想連巡檢一起看就等 12:50）。
另外注意：**手動執行 `testKpiCalcAutoUpdate` / `setupKpiCalcAutoUpdate` 也會寄同樣的信**，
所以單看「有沒有 ✅ 信」不能證明排程有效——要一併看**寄信時間是否落在 11–12 窗口**。
（0729 那兩封 ❌15:46／✅16:09 都是下午的手動執行，不是排程。）

**怎麼驗證「是排程自己跑通、還是人工補救蓋過去」**（可複用的三層檢查）：
1. 私有資料夾 `north12b-kpicalc-private-latest.json` 的 `modifiedTime` 是否為最近
2. **看 Gmail 成功信主旨**：`kpiCalcPublish`（kpi.html 督導發佈區人工上傳）寄的信主旨帶
   **「手動發佈｜」**，`kpiCalcAutoUpdate` 寄的**沒有**這個字樣
3. **看寄信時間**：落在台北 **11–12 窗口**＝排程；其他時段＝有人在 GAS 手動執行
   （第 2 點只能排除「督導發佈區上傳」，排除不了「手動跑 testKpiCalcAutoUpdate」，
   所以第 3 點才是判斷排程是否真的有效的關鍵）
4. 需要再保險時，AI 另外重跑一次 `make_kpicalc.py` 對同一份日報，逐店比對數字是否一致

**另**：私有資料夾有一個 AI 建的測試檔 `zz-claude-write-test.txt` 可刪（AI 無刪檔權限）。

## 2026-07-29 ｜ Codex（Git 與交接文件最終封版）

- 做了什麼：以最新 `origin/main` 為正式程式基準，保留本機已驗證的
  `savedAt` 顯示時間修正、半月檢查附件連結防覆蓋契約與跨 AI 文件規範；完成衝突逐檔
  核對，未改 Google Sheet、資料欄位、Apps Script 串接或網站功能。跨站正式狀態同步至
  `../AI協作中心/00_WEBSITE_INDEX.md` 與三站 `PROJECT_HANDOFF.md`（Claude 雲端環境讀不到
  這兩份文件，只能靠這則日誌轉述結論）。
- 結果：成功。Node 契約測試 4/4、Playwright 44/44、五個主要頁面煙霧測試 5/5；
  `Code.gs` Node 語法檢查與 `.claude/scripts/auto-push.sh` Bash 語法檢查通過。
  舊版店務檢查 QA 頁仍引用缺少的 `qa-assets/` 圖檔，已記錄但未刪除或補造。
- 經驗 / 給下一位的提醒：正式接手先讀 `../AI協作中心/00_WEBSITE_INDEX.md`，
  再讀目標站 `PROJECT_HANDOFF.md`。**這則之後 Claude 又在同一天（07-29）繼續動了
  `gas/Code.gs`（恢復通行碼、日報解析回退）跟新增 `home.html`**，上面的「🔴 進行中／
  待辦」已經是合併兩邊之後的最新狀態，不是本則提到的舊快照——正式部署、GAS 線上版本
  與 Liam 驗收仍須各自取得證據。

## 2026-07-29｜Claude｜新增導覽首頁 home.html（Liam 智慧管理中心）

- 做了什麼：新增 `home.html`，四張卡片連到既有四個系統，給**門市同仁**當跳轉入口。
  純靜態、不含資料、不呼叫 GAS、不做登入——**權限一律由各系統自己把關**。
- **刻意沒做的事**：沒有把它變成 `index.html`。門市同仁的書籤都指向 index.html（每日回報），
  換掉等於他們每天多點一次。所以走獨立網址 `home.html`，**非破壞性、隨時可回頭**。
  Liam 若之後想讓它變成真正的預設首頁，那是另一個決定（要一併處理既有書籤）。
- 卡片標籤刻意標「督導專用 · 需通行碼」：同仁看得到 Liam情報站的卡片，
  先講清楚進不去，省得他們點了跳密碼框以為壞掉來問。
- 驗證：四個連結目標檔案都存在（逐一檢查）、HTML 標籤閉合無誤、
  Playwright 實跑淺色/深色/手機三種情境截圖，**無 JS 錯誤**，日期腳本正常。
- 給下一位的提醒：這頁是**唯一公開給同仁的入口**，改它要特別小心——
  任何時候都不要在這裡放門市清單、員編、KPI 數字或密碼。
  另外它用 `Microsoft YaHei` 當首選字型（Liam 指定），改字型前先問他。

## 2026-07-29｜Claude｜恢復 Liam情報站的通行碼保護（推翻昨天的「維持免密碼」決定）

- 背景：Liam 決定要做一個「工具導覽」首頁給**門市同仁**用，方便他們在四個系統間跳轉；
  但 Liam情報站（原巡店系統）只給他自己看。既然首頁會被同仁看到、Liam情報站的卡片也會露出，
  免密碼就不再安全，Liam 明確要求恢復真的密碼保護。**這推翻了昨天那則日誌「不要加回通行碼」
  的決定**——不是我自己反悔，是需求變了（首頁要對同仁公開），下一位接手不用糾結兩則日誌矛盾。
- 做了什麼：`ptAuthorized()` 從 `return true` 改回原本（2026-07-23 之前）的檢查邏輯：
  `return PT_KEY !== 'CHANGE_ME' && e.parameter.key === PT_KEY;`
- **沒做的事，且是刻意的**：Liam 在對話裡直接給了他要用的密碼明碼，但我**沒有把它寫進
  `gas/Code.gs`**。repo 的 `PT_KEY` 仍是 `CHANGE_ME` 佔位字——這是專案既有鐵則
  （見 `AGENTS.md`：密碼只存在 GAS 編輯器裡，不進 repo），git 歷史一旦寫入明碼就洗不掉，
  尤其這個 repo 會被 GitHub Pages 讀取。**Liam 貼 Code.gs 進 GAS 編輯器後，
  要自己手動把 `PT_KEY` 改成他要的密碼再存檔部署**——這一步沒有人能代勞。
- 給下一位的提醒：看到「巡店免密碼」的舊記錄（AGENTS.md/CLAUDE.md 都改過來了，但如果
  你是從對話歷史或舊 commit 訊息看到的）不要照做，**現況是有密碼保護**，`PT_KEY` 只有
  Liam 自己知道。

## 2026-07-29｜Claude｜patrol.html 改名「Liam情報站」，確定不再分享給其他督導

- 做了什麼：`patrol.html` 從「督導管理系統」再改名為「Liam情報站」（個人化名稱），
  只動 `<title>`／`<h1>`，GAS 的 `PT_TITLE`（副標題）依慣例不動。
- **關鍵決策（已跟 Liam 確認）**：
  1. **不加回通行碼保護**——`ptAuthorized()` 維持 `return true`。前端還留著「請輸入通行碼」
     的提示框、`PT_KEY` 也還會送出，**但這只是介面殘留，後端完全不檢查**，任何人拿到網址、
     隨便輸入什麼都能進去。這不是新發現的漏洞，是 Liam 2026-07-23 的明確決定，2026-07-29
     再次確認維持現況，**不要主動幫他加回密碼檢查**。
  2. **`patrol-guide.html`（給其他督導的操作手冊）正式停止維護**——分享計畫確定不做了。
     檔案還在 repo 裡（懶得刪，也沒有壞處），但內容已經過時（還寫著「督導管理系統」、
     「每人自建試算表分享」），**看到它不代表現在還要維護多督導共用的設計**，不用因為
     它跟 patrol.html 現在的名稱兜不起來而去「修正」。
- 給下一位的提醒：**這個系統現在是 Liam 的個人工具，不是共用產品**。以後改
  `patrol.html` 標題／文案時，不用再考慮「其他督導看到會不會奇怪」這件事。

## 2026-07-28｜Claude｜日報少了一張工作表，解析器加自動回退

- 症狀：0728.xlsx 只有 **25** 張工作表（往常 26），少的正是
  `上線數KPI_個人達成率_明細`——**個人資料的唯一來源**。
  舊解析器（本機 py 與 GAS `kpiCalcParseReport`）都是直接 throw「找不到工作表」，
  等於**個人資料整個斷掉**，而且 GAS 排程一旦復活也會天天失敗。
- 解法：回退到 `上線數KPI_個人達成率_店點`（依門市分群的版面）。
  先在 **0727**（兩張表都有）做交叉驗證：**40 人全對、逐項 3000 格完全一致**，
  確認可安全替代後才用。兩個落差另外補：
  1. `_店點` 沒有**店代碼** → 用店點表的「店名→代碼」對照
  2. `_店點` 沒有**職稱** → 沿用上一份已發佈 JSON（新增 `kpiCalcPrevRoles()`）
- 版面陷阱：`_店點` **不是固定 4 欄一段**（Netflix 那段因合併儲存格佔 5 欄），
  照舊的 `c += 4` 掃會整段錯位。改用 `kpiCalcBandsPairs()`：
  先抓名稱列的段起點，再在段內找「實際數／目標數／權重」的實際欄位。
- 驗證：GAS 那段邏輯**逐行用 Python 模擬**跑真實檔案，與已驗證輸出比對
  **3160 格全等**；本機解析器對 0727 重跑，輸出與原檔**位元組相同**（沒動到舊路徑）。
- 給下一位的提醒：**日報格式會變，而且是「整張表消失」這種變法。**
  解析失敗時先 `wb.sheetnames` 印出來比對，不要假設欄位錯位。
  另外「兩張表內容是否真的一樣」一定要拿有兩張表的那天做交叉驗證再換來源，
  不要因為看起來像就直接換。

## 2026-07-28｜Claude｜patrol.html 改名「督導管理系統」（刻意不動 gas/Code.gs）

- 做了什麼：`patrol.html` 已不只巡店（巡店看板＋每月班表＋半月督導檢查＋督導檢查大盤），
  改名為「督導管理系統」。只動 `patrol.html` 的 `<title>`／`<h1>`，以及 `patrol-guide.html`
  的 title／標題／footer。
- **關鍵決策：GAS 的 `PT_TITLE` 故意不改。** 它是副標題（其他督導各自填自己的區名），
  改它就得為改名再貼一次＋再部署一次 Code.gs。維持不動 → Liam 只需貼一次、部署一次，
  之後不會再有「為了改名要重貼」的第二輪。驗證：`git diff --name-only` 不含 `gas/Code.gs`。
- 經驗 / 給下一位的提醒：**前端改名時先問「這個字串是不是從 GAS 回傳的」**。
  patrol.html 的 `subTitle` 與門市清單都由 `ptread` 的 `title`/`stores` 覆蓋，
  動到那兩個就等於動到部署，成本從「改 HTML 推一下」變成「Liam 進 GAS 貼＋部署」。

## 2026-07-23｜Codex｜修復貼上巡店明細切換大盤後還原

- 根因：切換「督導檢查大盤」時會自動執行 `ptread`。貼上後的 `ptwrite` 尚在背景寫入時，該讀取可能取得舊資料並直接覆蓋 `rawDetails`，所以畫面會先更新、切頁後又還原。
- 修復：大盤切頁只重繪目前已解析的 `rawDetails`，不再另觸發雲端重讀；`ptwrite` 收到成功回覆後也不再用立即重讀覆蓋畫面。手動「重新載入」仍保留作為明確的雲端刷新動作。
- 驗證：新增回歸案例，確認已有雲端舊資料時貼上新明細、切換大盤仍保留新資料且不新增 `ptread`；完整 Playwright 43/43 通過。

## 2026-07-22｜Codex｜巡店大盤到店次數與異常門檻

- 做了什麼：每間門市在大盤標示本月到店次數（不同到店日期計一次）。
- 結果：巡店異常明細只統計本月已檢查至少 10 個不同題號、且到店至少 5 次的門市；門檻未達的異常不納入該總數。
- 經驗 / 給下一位的提醒：到店次數不可用明細列數計算，否則同一次到店多題會被重複計次；不適用項目也視為已檢查題號。

## 2026-07-22｜Codex｜巡店大盤名稱釐清

- 做了什麼：將督導檢查大盤中的「每月盤點」改稱「每月檢查一次項目」。
- 結果：完成；僅調整題 14–17 在大盤的說明與完成統計名稱，計算規則及原本「每月盤點提醒」功能不變。

## 2026-07-22｜Codex｜督導檢查大盤改採巡店明細

- 做了什麼：督導檢查大盤改直接讀取「貼上巡店紀錄」與 `ptread` 雲端明細，不再以另一份半月檢查表作為大盤依據；資料貼上、載入或重新同步後立即重算。
- 結果：完成。上／下半月依原規則採計第 2–13 項、每月盤點採第 14–17 項、雙月全盤獨立採第 18 項；每店可看到巡店明細筆數與缺漏／異常。
- 經驗 / 給下一位的提醒：此頁是原 33 項巡店紀錄的週期大盤，不應與半月督導檢查的 18 項表單資料混合；原半月表單、媒體與歷史回放仍維持原資料來源。

## 2026-07-22｜Codex｜督導檢查上下半月／雙月大盤

- 做了什麼：新增「📊 督導檢查大盤」頁籤，按門市分開呈現上半月第 1–17 項、下半月第 1–17 項，以及第 18 項固定雙月全盤；可選月份，並顯示完成、缺漏與異常數。
- 結果：完成；不更動既有逐項填寫、照片／影片、歷史回放及雲端資料結構。
- 經驗 / 給下一位的提醒：第 18 項不可併入上下半月，雙月區間採固定 1–2、3–4、5–6、7–8 月；門市名稱以去除台北前綴／杭州南尾碼正規化，避免班表和歷史名稱不同造成漏計。

## 2026-07-22｜Codex｜防止半月檢查附件連結遺失

- 查核結果：復興南當期 18 題雲端紀錄仍在，但附件數為 0。先前媒體上傳回覆 unknown action 時，照片尚未寫入私有 Drive；重新整理後暫存檔無法由雲端救回。
- 修復：上傳成功即同步該題附件連結；仍有待上傳檔案時阻擋本期同步；GAS 遇空白附件欄保留既有 Drive 連結。第 19 版 Apps Script 已部署，GitHub Pages `ba28d01` 已發布。
- 驗證：本機媒體契約 4/4、完整 Playwright 41/41，且正式 Pages 原始碼已讀到防呆標記。待原始照片由手機相簿重新上傳後，驗收實際 Drive 預覽、歷史回放與 Excel 連結。

---

## 2026-07-22 ｜ Claude（門市動物圖案第二次還原）
- 做了什麼：門市反映動物圖案又不見了。追查發現 2026-07-17 的動物改動（8c00629，已進 main）
  被 Codex 的 65c8a25「Publish KPI battle aggregate…」整檔覆蓋洗掉（從舊版 index.html
  分岔，把 store-card 9 個圖案全改回原本 emoji）。重新在最新 main 上套回動物
  （通化🐯 酒泉🐻 三創🦅 萬大🐘 六張犁🦌 復興南🐺 永吉🐲 大稻埕🦁 杭州南🐎），
  改 store-card＋selectStore icons map 兩處。
- 結果：成功（Playwright 驗證店卡與副標）。
- 經驗 / 給下一位的提醒：**⚠️ 重要協作坑——不要「整份 index.html 從舊版覆蓋」**。
  Codex 產 index.html 時若從自己的舊基準整檔輸出，會默默洗掉別人已 merge 的小改動
  （這次是動物圖案，第二次被洗）。改 index.html 請 base 在最新 main、只動自己那幾行。
  門市圖案有兩份（HTML store-card＋JS icons map），改要同步。

## 2026-07-25 ｜ Claude（自動更新停擺 4 天：根因與補救管道）
- 做了什麼：稽核發現 kpi.html 資料自 0721 起停更 4 天（0722~0725 日報都有上傳，但私有資料檔
  modifiedTime 停在 7/21）。**根因：GAS 編輯器被貼成舊版程式碼**，kpiCalc* 函式消失 →
  11:00 觸發器空轉、也不會寄失敗信（同仁登入仍正常，因為走已部署的舊網頁版本，與編輯器脫鉤）。
  補救：(1) 本機解析 0725 產生 JSON、Liam 經「督導發佈區」上傳，資料補到 07/24（已驗證
  檔案 83,395 bytes 與 modifiedTime 相符）；(2) `kpiCalcAccess` 讀取改為
  `kpiCalcLatestDataFile()`——掃私有資料夾取 `north12b-kpicalc-*.json` 中**最後更新最新**者，
  相容舊的 `-private-latest.json`，並讓外部工具（AI 經 Drive 連接器）可直接補
  `north12b-kpicalc-<日期>.json` 當緊急管道。
- 結果：語法檢查通過、挑檔邏輯單元驗證正確（正確排除 north12b-dashboard-* 與非 json）。
  **需 Liam 貼最新 Code.gs＋部署新版本**才生效。
- 經驗 / 給下一位的提醒：**時間觸發器跑「編輯器最新存檔」的碼，貼到舊版會無聲停掉自動化**——
  貼 Code.gs 前務必確認是 repo 最新版（可用 grep testKpiCalcAutoUpdate 驗證）。
  這次 4 天沒被發現是因為 `setupKpiCalcWatchdog()` 從未啟用，務必補跑。
  環境限制：雲端 Claude 的 proxy 封鎖 script.google.com（實測 403 CONNECT），無法代跑 GAS；
  但 **Drive 連接器可寫入私有資料夾**（已實測），故緊急補資料可繞過 GAS。

## 2026-07-22 ｜ Claude（追分策略頁改為「督導試算區」＋督導限定＋全區試算＋日目標）
- 做了什麼：(1) kpi.html 第三頁籤改名「🎯 督導試算區」，**僅督導本人可見**——GAS
  `kpiCalcAccess` 回傳 `profile.isTrusted`（用 `DASHBOARD_TRUSTED_EMPLOYEE_ID` 判斷），
  前端據此顯示/隱藏頁籤，非督導看不到也切不進去。(2) 保留原追分策略（潛力分排行/流量分配/
  建議），下方**新增「全區彙總試算」**：督導在各項輸入假設「試算今日」量，看全區明日預估
  總達成率如何變化（以官方區平均為錨點、試算今日移動增量，標近似值）。(3) 每項多一欄
  **「日目標」**：自動＝區月目標÷本月天數，可手動覆蓋；試算今日 ≧ 日目標標「達日目標」。
- 結果：成功（Playwright：isTrusted=true 顯示頁籤+全區試算即時運算+日目標自動值20.3=628/31、
  isTrusted=false 完全隱藏、無 JS 錯誤）。**需 Liam 重新部署 GAS（新版本）才會回傳 isTrusted**。
- 經驗 / 給下一位的提醒：isTrusted 走 doPost 的 kpiCalcAccess，改動要部署新版本才生效。
  全區彙總試算用 DATA.stores 加總+店級 floors，與各店官方加總非完全一致（近似），已標註。
  localStorage：LS.stratSim（試算日/試算今日/日目標覆蓋）。

## 2026-07-22 ｜ Claude（KPI 自動更新中午巡檢）
- 做了什麼：`gas/Code.gs` 新增 `kpiCalcWatchdog()`：每天 12:30（台北）巡檢當日資料，
  (1) 資料夾沒有今天的 `MMDD.xlsx` → 寄「今日尚未上傳」提醒；(2) 今日檔存在但
  `KPICALC_LAST_IMPORT` 對不上（11:00 更新沒跑成功）→ 寄「可能未更新」提醒；(3) 正常則
  靜默不寄信。補足「忘了上傳」「靜默漏更新」這兩種原本不會觸發 ❌ 信的缺口。
  啟用：執行一次 `setupKpiCalcWatchdog()`（同授權、不需重新部署）。
- 結果：成功（Node 語法檢查通過）。GAS 端需 Liam 執行 setup 啟用。稽核當下確認
  0720/0721 自動更新皆成功（成功信＋期間逐日推進、9店40人完整解析）、無失敗信，
  0722 檔已上傳待 11:00 觸發。
- 經驗 / 給下一位的提醒：巡檢不重試（避免與 11:00 的 ❌ 信重複），只偵測+提醒。
  時間觸發器跑最新存檔碼、不需重新部署。成功信的「期間」比檔名少一天屬正常（D-1 資料）。

## 2026-07-21 ｜ Claude（kpi.html 新增「🎯 追分策略」督導頁籤）
- 做了什麼：kpi.html 加第三頁籤「🎯 追分策略」（督導區用，同資料無需重登）。功能：
  (1) **潛力分排行**——區彙總各項（Σ各店目標/實績），算「潛力分＝權重×(100%−目前達成率)」
  排序，點出拉哪項對總分最有感；(2) **各店流量分配**——選定項目後把區缺口(T−A)按流量
  分級權重（高:三創/通化 1.5、中:萬大/杭州/復興 1.0、低:六張/酒泉/永吉/大稻埕 0.6，可調）
  重新分配，並對照各店「自身缺口」找出高流量又落後的優先店；(3) **動態補充建議**——依即時
  數據生成優先追分/防退控管/激勵加分門檻差距/流量原則/衝刺節奏。
- 結果：成功（Playwright：潛力分＝權重×落後幅度正確、分配加總=區缺口、建議精準點出
  「升轉率29.8%差0.2%達標」等、切回試算頁無誤、無 JS 錯誤）。
- 經驗 / 給下一位的提醒：策略頁用 DATA.stores 全區彙總＋DATA.meta 的月天數/到位日算 f，
  不吃 per-entity 的今日輸入。流量分級用店名 substring 判斷（trafficTier），開新店要補。
  防退類與激勵加分不進潛力分排行（無法靠「多做」追），改列建議區另計槓桿。

## 2026-07-21 ｜ Claude（新增 kpitry.html 通用試算版）
- 做了什麼：新增 `kpitry.html`——給**非本區同仁**用的公開試算版。與 kpi.html 共用
  同一套已驗證計算引擎（逐項達成率、250%上限、店績下限半分、防退類反向＋2025/07
  解約NP OUT新制、激勵加分），但**不含任何個資**：無登入、無 GAS、無內建資料，
  店點/姓名/目標/實績全部使用者自行輸入。內建的只有「計算架構」（24 項加權項目、
  標準權重、公式、上下限規則），權重進階可改（外區權重不同時可調）。青色主題與正式版
  橙色區隔避免混淆。含 localStorage 存檔、匯出/匯入 JSON、部分填寫時顯示「權重覆蓋率」
  警語（避免只填幾項誤讀總分偏低）。可完全公開分享。
- 結果：成功（Playwright 驗證：灌 0720 酒泉店績目標/實績、D=19 → 算出 108.90%，
  與官方報表逐格一致；個績模式、持久化、匯出無個資皆通過）。
- 經驗 / 給下一位的提醒：這版總達成率不做校正值（無官方基準可比）。分母為全項權重
  105.5%，未填項目以 0 計，故部分填寫時總分偏低屬正常（頁面已加警語）。若制度權重
  調整，改 `ARCH` 陣列即可。

## 2026-07-21 ｜ Codex（完成 half-inspection-media 分支收尾）
- 做了什麼：核對 `agent/half-inspection-media` 的 3 個 Codex commit 與最新 `main`；確認巡店媒體、moto 第 10 款及北一二B整體 KPI 已由後續提交拆分整合，因此以保留新版 `main` 檔案樹的 merge commit 補齊分支祖先關係，沒有把舊版 `patrol.html` 蓋回來。同步將巡店測試的半月題數由過時的 33 項改為正式 18 項，並驗證連續選取媒體、關閉回放視窗後匯出 Excel、私有附件連結。
- 結果：成功。`tests/app.spec.js` 29/29、`tests/patrol.spec.js` 11/11 通過；合併前後產品檔案樹一致，僅新增分支歷史關係與測試規格修正。
- 經驗 / 給下一位的提醒：若功能已由不同 commit 拆分整合，不要直接用舊分支內容解衝突；先比對功能標記與後續提交，再用 ancestry-only merge 收尾。半月督導檢查固定 18 項，原巡店看板的知悉題仍可維持 19–33 項，兩者不可混為同一題數。

## 2026-07-20 ｜ Claude（KPI 試算每日自動更新）
- 做了什麼：`gas/Code.gs` 新增 `kpiCalcAutoUpdate()`：每天 11:00（台北）由時間
  觸發器掃描 Liam 的日報 Drive 資料夾（`KPICALC_SOURCE_FOLDER_ID`，預設寫在
  程式常數），取檔名 `MMDD.xlsx` 最大者 → Drive API v3 轉暫存 Google 試算表 →
  解析「上線數KPI_店點/個人達成率_明細」→ 產生資料 JSON 直接覆寫私有 Drive 的
  `north12b-kpicalc-private-latest.json` → 刪暫存檔 → 寄成功/失敗信
  （`DASHBOARD_NOTIFY_EMAIL`，回退 `NOTIFY_EMAIL`）。同檔案已匯入過
  （屬性 `KPICALC_LAST_IMPORT` 記檔名+mtime）就靜默略過；解析失敗保留舊資料不動。
  啟用：GAS 加入 Drive API v3 服務 → 執行一次 `setupKpiCalcAutoUpdate()`。
- 結果：成功（解析演算法在本機以 0720/0719 兩天真實日報模擬驗證：與已勾稽的
  kpidata 逐格零差異、跨日欄位穩定）。GAS 端實跑需 Liam 啟用後由 email 確認。
- 經驗 / 給下一位的提醒：時間觸發器跑最新存檔程式碼免重新部署，但
  `kpicalc_access`/`kpicalc_publish` 屬 doPost，改動要部署新版本。日報若改版
  （欄位帶狀區塊位移），自動更新會寄失敗信並保留舊資料，屆時把新檔丟給 AI 重新對格式。

## 2026-07-20 ｜ Claude（kpi.html 加員編授權，資料撤出公開頁面）
- 做了什麼：kpi.html 資安強化——(1) 加 noindex；(2) 內嵌 KPI 資料全部移除
  （原始碼 grep 驗證 0 筆殘留），改為登入後從 GAS 拉取；(3) **重用 Codex 的
  私有戰情授權機制**（`private_request` 申請＋mail 通知＋裝置綁定＋DashboardUsers
  名冊審核，同網域共用 `north12b_private_dashboard_device_id`，戰情已核准的
  裝置直接能登入 KPI 試算）。GAS 新增兩個 doPost action：`kpicalc_access`
  （驗證員編＋裝置 → 回傳資料+profile）與 `kpicalc_publish`（管理者密碼＋
  base64 JSON → 存私有 Drive `north12b-kpicalc-private-latest.json`）。
  發佈入口在 kpi.html 進階設定「督導發佈區」（選 JSON 檔上傳）。
- 結果：成功（Playwright mock GAS 驗證：未核准擋下、申請流程、登入後計算
  仍與 0720 報表一致、重載自動登入）。**需 Liam 重新部署 GAS（新版本）才生效**。
- 經驗 / 給下一位的提醒：KPI 試算資料檔**不要 commit 進 repo**（repo 公開）；
  每日更新流程＝產生新 JSON → kpi.html 進階「督導發佈區」上傳，不用動 GAS。
  授權共用戰情名冊：核准/撤銷都在戰情頁籤管理介面或 DashboardUsers 表操作。

## 2026-07-20 ｜ Claude（新增 kpi.html KPI 試算網站）
- 做了什麼：新增 `kpi.html`（單檔，無後端，localStorage）。同仁選店點／個人後
  KEY 今日上線數，即算各項目「明日達成率」與明日 KPI 總進度達成率。
  內建 0720 日報（2026/07/01~07/19）九店＋40 人的目標數/累計實際數/權重。
  公式從「KPIPI資料設定」模板＋0720 日報反推並勾稽：逐項達成率 100% 吻合
  （含防退類 2−實際/目標、2025/07 解約NP OUT 店績新制 50%+50%×原始）；
  總達成率＝Σ(權重×達成率)（分母 1.0，好速 5%＋Netflix 0.5% 為疊加權重）
  ＋店績下限半分規則（個績無下限）＋激勵加分（降轉率≧1399≦37% +0.75%、
  升轉率<1399≧30% +0.75%、AQ件數加分推估≧130% +1%）。9 店中 7 店完全一致，
  大稻埕 −0.34%／三創 +0.14% 殘差由「校正值」（官方−模型）自動吸收。
- 結果：成功（Playwright 驗證：D=19 時模型＝報表官方值、輸入/重載/localStorage 正常）。
- 經驗 / 給下一位的提醒：日報「上線數KPI_店點達成率明細」最後的「TTL AQ上線數_加分項」
  欄位組間距不同（實際GK/目標GL/權重GN/達成率GP，中間跳格），照 +1+2+3 硬讀會錯位。
  店長／代理店長個人目標全為 0、報表個人總達成率直接顯示 0（店長只看店績）。
  目標數固定不變（Liam 說有變會告知）；每天新日報出來後，用「修改累計」＋
  進階設定更新累計與到位日即可，或請 Claude 重新產生內嵌資料。

## 2026-07-17 ｜ Claude（門市圖案改動物）
- 做了什麼：應門市要求，九間店圖案換成動物——通化🐯 酒泉🐻 三創🦅 萬大🐘
  六張犁🦌 復興南🐺 永吉🐲 大稻埕🦁（指定獅子） 杭州南🐎。
  改兩處：填報頁 store-card 與 selectStore 的 icons 對照表。
- 結果：成功（Playwright 驗證店卡與選店副標）。
- 經驗 / 給下一位的提醒：門市圖案有兩份（HTML 店卡＋JS icons map），改的時候要同步。

## 2026-07-16 ｜ Claude（移除 KPI/個績 死程式碼）
- 做了什麼：Liam 決定 KPI 呈現以 Codex 的「KPI戰情／台獎戰情」為準，
  移除 Claude 稍早做的「KPI/個績」頁籤殘留 JS（214 行：renderPerf/_getPersonalDay
  /_getPersonalMonth/_perfPersonalTable 等；頁籤按鈕與面板 Codex 已先拆）。
  Codex 的戰情頁籤完全未動。
- 結果：成功（Playwright 煙霧測試：六個頁籤全部正常切換、填報送出正常、無 JS 錯誤）。
- 經驗 / 給下一位的提醒：localStorage 可能殘留 `perfDay_YYYY-MM-DD` 快取鍵，無害可忽略。
  之後 KPI/個績相關需求一律做在 Codex 的戰情頁籤上，不要再開新頁籤。

## 2026-07-16 ｜ Claude（回報檢查信改版）
- 做了什麼：`checkSegAndNotify` 檢查時間 16:20/21:20 → **16:30/22:00**（`setupTriggers`
  改 atHour/nearMinute）；未回報警示信加入「📊 N12B 目前加總」——已回報門市的
  KPI 均值＋A999/A1399/好速/R1399 合計，零回填時顯示（尚無回填資料）。
- 結果：成功（Node stub 驗證主旨/加總/邊界情境）。**需 Liam 貼新碼進 GAS 編輯器
  存檔＋重跑一次 `setupTriggers()`**（改觸發時間必須重建觸發器；無 doGet 改動，不用重新部署）。
- 經驗 / 給下一位的提醒：改信件內容只要存檔即可生效（觸發器跑最新存檔碼），
  但改「觸發時間」一定要重跑 setupTriggers 重建。

## 2026-07-16 ｜ Codex（KPI／台獎權限與私有 Drive 串接）
- 做了什麼：`gas/Code.gs` 新增私有戰情 API 與名冊初始化：首次「員編＋0935」只建立待核准裝置申請，不回傳資料；管理者以獨立密碼核准後才會綁定一台裝置，改綁新裝置會使舊裝置失效。網頁 KPI／台獎頁籤已移除對 `private-data/` 的直接讀取，改為通過 Apps Script 驗證後才由私有 Google Drive 取回遮罩快照。新增名冊產生器與 `publish_private_dashboard_snapshot.mjs`，供 Outlook 寄件備份驗證後再同步當日網站資料。
- 結果：私有 Drive、啟用碼、名冊與管理者權限已設定，Web App 已更新部署；本機自動化仍須以安全方式提供管理者密碼後，才能在 Outlook 寄件備份驗證完成時自動發布當日快照。
- 經驗 / 給下一位的提醒：GitHub Pages 可公開，但不得含 KPI／台獎 JSON、名冊、員編或密碼。登入成功後也只顯示遮罩姓名；每日私有快照必須以 Outlook `寄件備份` 驗證成功為發布門檻。

## 2026-07-16 ｜ Codex（KPI戰情本機私有 MVP）
- 做了什麼：新增 `🏆 KPI戰情` 頁籤，提供店點總覽（KPI、公司排名、加掛、A999／A1399／好速／R1399）與店點全部KPI明細；個績排名支援店點／職類篩選。DOD 以當日相較前一天顯示：店點含 KPI、公司排名、加掛與各項指標；個人含總達成率與排名。KPI 明細新增「實績／月目標／100%日目標／差異」，以來源資料區間的最後一天計算日目標。新增 `🏅 台獎戰情`：督導獎金置頂、店長／督導預估、每店前三補量與 10 機款下一獎階；個績表加入個人台獎預估與獎金排名。日期回放移除 13:00，KPI／台獎手機字級與字重提高。
- 結果：成功。`update_phone_awards.py` 摘要新增完整 10 機款和個人台獎資料；`build_github_pages_data.py` 會產生私有 `kpi-battle-latest.json` 與 `phone-awards-battle-latest.json`。姓名遮罩且檔案被 `.gitignore` 排除，未提交至公開GitHub。Playwright 35項測試通過。
- 經驗 / 給下一位的提醒：正式公開版不可直接讀 `private-data/`；目前改由 Apps Script 驗證後從私有 Google Drive 讀取。

## 2026-07-16 ｜ Claude（新頁籤：KPI 達成與個績）
- 做了什麼：`index.html` 新增「🏆 KPI/個績」頁籤——上半：店點 KPI 達成進度條
  （區內均值/達標間數/公司排名，晚上 7 點後自動選 21:00）；下半：個績排行榜
  （主力四項 A999/A1399/好速/R1399＋合計＋個人KPI），可切「當日／月累計」。
  當日 21:00 記錄優先蓋 16:00；月累計逐日抓 `pread` 加總（7 天一批平行），
  KPI 取最新一筆、附回報天數。
- 結果：成功（Playwright 攔截 API 全流程驗證：排序/加總/天數/失敗提示皆正確）。
- 經驗 / 給下一位的提醒：過去日期的個人資料會快取進 localStorage（`perfDay_` 前綴），
  只有抓取成功（`ok`）才寫入，避免網路失敗把空資料存成永久快取；今天永遠重抓。
  月累計首次載入約 30~60 個 pread 請求，之後靠快取秒開。純前端改動，不用動 GAS。

## 2026-07-14 ｜ Claude（個人回報擴充 12 欄）
- 做了什麼：個人每日回報 6 欄 → 12 欄：新增 A1399/R1399（highlight＋badge）、
  提前續約、5G、手機保險（筆）、包膜保貼。R1399 納入 `PERSONAL_ITEMS` 未過關判定
  （對齊店點 21:00 零報攔截三項 A999/好速/R1399），其餘純記錄。
  今日卡片改 12 格；追蹤牆/督導卡/連續警示吃 `PERSONAL_ITEMS` 自動帶出。
- 結果：成功（Playwright：R1399=0 攔截、12 欄入庫、卡片/追蹤牆顯示、全過關放行）。
- 經驗 / 給下一位的提醒：`5g` 當物件 key 要用 `data['5g']` 取；個人回報資料
  全在 record JSON 內，加欄位不用動 GAS。舊記錄沒有新欄位會顯示 0，屬預期。

## 2026-07-14 ｜ Claude（個人未過關回報內容）
- 做了什麼：`index.html` 個人追蹤的未過關說明區新增必填欄位「① 未過關原因說明」
  「② 明日改善計畫」（空白擋下送出、每次開啟自動清空避免沿用舊文字）；
  個人今日卡片與督導端未過關卡片（`renderStorePersonalDetail`，彙整大盤＋日期回放共用）
  一併顯示新欄位，並補顯示先前有收集但沒顯示的「接客數、上線項目」。
- 結果：成功（Playwright 全流程驗證：攔截→必填擋下→儲存→個人卡＋督導卡顯示）。
- 經驗 / 給下一位的提醒：新欄位存在個人回報 record 的 `extra` JSON 內
  （`pwrite` 整包字串進「個人回報」工作表），**不用改 GAS FIELDS、不用重新部署**。

## 2026-07-14 ｜ Claude（週報改版＋修正）
- 做了什麼：週報 Excel 改為六分頁（巡店紀錄／未巡店／上下半月2-13／每月盤點14-17／
  雙月全盤18／知悉20日前19-33），逐分頁呈現與看板同語意的狀態（不再壓成單一✓✗）。
  修正：①GAS 店名比對加入營業點代碼（與前端 findRecordStore 對齊）
  ②`writePatrol` 去重改為「同鍵但 result/reason 有變→就地更新」——來源表事後補填
  「是否合格」重貼時不再被跳過（舊行為會讓雲端永遠留舊值）。
- 結果：成功（Node 模擬 GAS 環境驗證六分頁輸出全數正確；28 tests passed）。
- 經驗 / 給下一位的提醒：ptwrite 回傳多了 `updated` 欄位（doGet 有變，需重新部署）。
  驗證 GAS 純邏輯可用 Node stub（SpreadsheetApp/Utilities/MailApp…）直接 eval Code.gs 跑。

## 2026-07-14 ｜ Claude（巡店週報）
- 做了什麼：GAS 新增每週一 08:00 巡店週報——`sendWeeklyPatrolReport()` 產暫存試算表
  →匯出 xlsx（UrlFetchApp + OAuth token）→ MailApp 夾檔寄出 → 刪暫存。
  Excel 含「檢核總表」（每店×33題 ✓✗，判定邏輯 `ptItemDone()` 與前端看板一致）
  與「本月明細」。啟用：`setupWeeklyReport()`；試寄：`testWeeklyReport()`。
- 結果：成功（語法通過；GAS 端需 Liam 執行驗證）。
- 經驗 / 給下一位的提醒：xlsx 匯出用 UrlFetchApp 打 spreadsheets export URL 帶
  `ScriptApp.getOAuthToken()`，會新增 Drive/UrlFetch 授權範圍——**首次執行會再跳一次授權**。
  時間觸發器不需重新部署。

## 2026-07-14 ｜ Claude
- 做了什麼：巡店系統支援分享給其他督導——`gas/Code.gs` 新增 `PT_TITLE`/`PT_STORES` 設定，
  `ptread` 一併回傳；patrol.html 連線後套用該區標題與門市清單（沒回傳則用北一二B預設）；
  巡店網址改存獨立鍵 `bei12b_pt_gas_url`（相容回退舊的 `bei12b_gas_url`）。
- 結果：成功（28 tests passed）。
- 經驗 / 給下一位的提醒：**這次動了 `doGet`（ptread 回傳格式），Liam 的 GAS 要重新「部署新版本」
  才生效**。分享模式＝每位督導自建試算表＋GAS 部署（各改 SPREADSHEET_ID/PT_KEY/PT_TITLE/
  PT_STORES/NOTIFY_EMAIL），前端共用同一個 GitHub Pages 網址，資料實體隔離。

## 2026-07-13 ｜ Claude
- 做了什麼：建立跨 AI 協作機制——新增 `AGENTS.md`（Codex 會自動讀取）與本日誌檔；
  另開了 [Issue #11](https://github.com/lian852456-dot/liamlu/issues/11) 作為三方長期討論區（方向性討論到那裡，具體改動討論到各 PR）。
- 結果：成功。
- 經驗 / 給下一位的提醒：專案完整背景在 `CLAUDE.md`，別跳過「踩過的坑」章節。開工前掃一眼 Issue #11 的最近留言。

## 歷史經驗總結（2026-07 之前，由 Claude 整理）

### ⚠️ 台獎手機資料消失事件（三個問題疊加，詳見 CLAUDE.md）
1. 試算表標題列缺欄位時 GAS 寫入**無聲丟失**，不會報錯 → `getSheet()` 已加自動補欄位，但前端加欄位仍要同步 `gas/Code.gs` 的 `FIELDS`。
2. Google Sheets 把日期字串自動轉 Date 物件，字串比對永遠 false → 一律用 `toDateStr()` 轉換後再比。
3. GAS 編輯器「存檔」不等於「部署」——`doGet` 相關改動必須「管理部署作業 → 新版本」才生效；時間觸發器則相反，跑的是最新存檔、不需重新部署。

### 其他已驗證的做法
- 前端寫入走 JSONP（GAS CORS 限制）；巡店上傳每批依網址長度切分＋失敗自動重試（#6）。
- 巡店讀寫有通行碼 `PT_KEY`（#5），repo 只放佔位字。
- 未回報自動 Email 通知：`checkSegAndNotify()` 每天 16:20/21:20（#3）；知悉題月中提醒：`checkAwareAndNotify()` 每月 15 號（#10）。
- 開發環境 proxy 封鎖 script.google.com，GAS 端點只能請 Liam 用瀏覽器驗證。
- localStorage 有影子備份（`bei12b_shadow_*`），同裝置備援用，跨裝置仍靠 GAS。
