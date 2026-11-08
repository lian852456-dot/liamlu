# 北一二B每日戰報與台獎固定報表契約

更新日：2026-08-27

本契約是 b-2 自動化的正式執行依據。每日程式、月設定工具、preflight 與交接文件都應以此為準；不得把固定報表結構只留在對話或單次重跑紀錄。

## 1. 正式執行入口

排程入口為 `/Users/liamlu/.codex/automations/b-2/automation.toml`，每日 09:45 Asia/Taipei 執行，cwd 為 `/Users/liamlu/Downloads/liam-agent`。

### P0 credential / environment preflight

任何 cloud source、產報、寄信、publish 或 readback 之前，09:45 runtime 的第一個執行 gate 固定為：

`/usr/bin/env -i HOME="$HOME" USER="$USER" PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin" /bin/zsh /Users/liamlu/Downloads/liam-agent/report-automation/work/automation_environment_preflight_with_keychain.sh`

- `REPORT_UPLOAD_EMPLOYEE_ID` 固定由 macOS Login Keychain service `North12BReportUploadEmployeeId` 在 runtime 載入，只存在於 preflight／publisher 子程序記憶體；不得寫入 automation TOML、prompt、Git、JSON/JSONL、manifest、stdout、argv 或 shell history。
- preflight 驗證員編存在且符合 `^[A-Z0-9]{5,12}$`，並驗證 `North12BPrivateDashboardAdminSecret`、Node、curl 與固定 publish/readback endpoints；通過後才可用 read-only 操作確認 Google Drive／Outlook connector auth。
- missing／invalid credential、Keychain 或 connector auth 失敗都屬 configuration failure，`retryable=false`，必須在 source/build/mail 前 fail-fast；不得套用 HTTP retry。此時 source、build、send、publish、readback invocation count 都必須是 0。
- preflight log 只准記錄 PASS/BLOCKED、failure class、retryable 與檢查名稱，不得包含實際員編或任何 credential value。

正式鏈路：

1. 先通過上述 credential/environment 與 connector auth preflight；未通過即 BLOCKED，不得讀 source 或寄信。
2. 透過 Microsoft Graph 直接列出 OneDrive `TWM每日戰報` 雲端資料夾，精準選取同日 KPI 與兩份 canonical 台獎來源，下載 bytes 到 run-scoped staging 並驗證 SHA-256。Production auth 固定為 `ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth`，先以 MSAL silent acquire／refresh 從 macOS Keychain 取得短期 access token。
3. `ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth REPORT_DATE_ISO=YYYY-MM-DD node report-automation/work/run_daily_north12b_report.mjs`；production 預設 `REPORT_SOURCE_MODE=onedrive-cloud`，KPI component 只要求自己的 canonical source/date gate，不被 stale awards 阻擋。
4. 先執行 `ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth REPORT_DATE_ISO=YYYY-MM-DD REPORT_DATA_CUTOFF_DATE=YYYY-MM-DD node report-automation/work/preflight_onedrive_cloud_sources.mjs`。只有 KPI／店點／個人三份 Excel 截止日相同且兩份台獎 cloud version 都 fresh 時，才以同一 run manifest 執行 `python3.12 report-automation/work/update_phone_awards.py`。
5. `REPORT_DATE_ISO=YYYY-MM-DD node report-automation/work/prepare_send_payloads.mjs`。
6. Outlook 先寄每日戰報，再寄台獎信，兩封都必須查 `寄件備份`。
7. 兩封都驗證完成後，先以獨立、best-effort 的 M+ 後送把當日 KPI 戰報 Excel、主力 KPI 圖、加掛項加減分圖、台獎圖片傳到 `滷蛋`；成功或失敗都只更新 `mplusDelivery` 狀態，不得改動郵件成功狀態，也不得成為網站 dependency。
8. M+ 嘗試結束後一律繼續執行 `python3.12 report-automation/work/build_github_pages_data.py`。
9. 最後才可執行 `zsh report-automation/work/publish_private_dashboard_with_keychain.sh` 與正式 readback；M+ 未登入、上傳失敗或待人工確認都不得阻擋此步驟。

Graph OAuth 契約：

- delegated permission 固定為 `Files.Read`；MSAL 預設 OIDC scopes 支援 `offline_access`。
- MSAL serialized token cache／refresh credential 保存於 macOS Keychain service `North12BOneDriveGraphMsalCache`，不得寫入 Git、logs、stdout、manifest、argv 或 staging。
- runtime 每次先 `acquireTokenSilent()`；只有無 cached account 或 Microsoft 明確要求互動時回 `AUTH_RECONSENT_REQUIRED`。
- 既有 `North12BOneDriveGraphAccessToken` direct token 僅可用於明確 `ONEDRIVE_GRAPH_AUTH_MODE=direct-token` 的人工 UAT／緊急測試；production 不自動選用。
- 任一 auth 失敗都 fail-closed，不得 fallback 到本機 CloudStorage。

## 2. 固定來源報表

每日戰報：

- 正式來源唯一預設為 Microsoft Graph／OneDrive cloud 的 `TWM每日戰報`；依 Asia/Taipei report run date 精準找 `MMDD.xlsx`。
- production 禁止 silent fallback 到本機 CloudStorage、Google Drive、staging、outputs 或 cache。Graph 列檔、下載或驗證失敗即 blocked。
- 每次必須保存 `provider=onedrive-cloud`、OneDrive item ID、name／canonical basename、`lastModifiedDateTime`、`eTag`、size、下載 SHA-256、Excel period／snapshotDay、`source_data_date` 與 run ID。
- 本機 OneDrive 只可作明確人工 emergency fallback；必須同時設定 `REPORT_SOURCE_MODE=local-emergency` 與 `REPORT_LOCAL_EMERGENCY_ENABLED=1`，預設 OFF，且 fallback 狀態不得冒充 cloud identity。

台獎：

- Graph 必須精準抓 canonical `01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx` 與 `01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx`；Finder duplicate suffix（例如 ` 6.xlsx`）不得作正式 identity。
- 版本 identity 以 cloud item ID、`eTag`、`lastModifiedDateTime` 為準，下載後再算 SHA-256；不以 filesystem mtime 判斷新舊。
- 兩份來源的 Excel `source_data_date` 都必須等於目前 KPI cutoff：店點錨點 `上線數KPI_店點達成率_明細!H6`、個人錨點 `手機競賽_個人達成率!D6`。
- 若任一台獎標題錨點是公式、公式層／cached 值／顯示值不同、資料期間格式錯誤，或同一資料日有不同 SHA-256 的候選，必須 blocked；不得以 mtime 任選。
- Y26 來源：`Y26重點台獎手機.xlsx`，先更新 `台獎機款`、`個人台獎` 頁籤，再從更新後頁籤重產圖片。

### 同批來源契約

- KPI `MMDD.xlsx`、店點 `01-08-03`、個人 `01-08-04` 的商業資料區間最後一日必須完全相同；此日期是正式 `data_cutoff_date`，不得由檔名、寄信日、run date 或本機 mtime 推導。KPI 顯示錨點為 `上線數KPI_達成率!D6/C10/C57`，三格必須一致。
- 每份來源必須記錄完整 cloud identity、SHA-256、商業資料區間、固定工作表／儲存格、formula 原文、cached 值與 Excel 顯示值。staging filename 必須含 run ID 與 cloud item ID 或 hash，且 staged SHA 必須等於 cloud download SHA。
- 同批來源紀錄必須包含 schema version、report run date、資料截止日、KPI／兩份台獎的檔名、資料區間、上述日期 lineage、hash、staging hash 與 deterministic batch id，寫入 preflight manifest 後才可寄送或發布。
- KPI 與 awards 使用 component-level gate：awards 任一份缺失、版本未更新、截止日不同、下載失敗、cloud／staging hash 不同或同批紀錄缺失時，只阻擋 Y26／台獎 Mail／`awardsBattle` 發布，不得阻擋已通過自己 gate 的 KPI component。不得退回沿用前日台獎，也不得以 top-level container `publishedAt` 冒充 awards fresh。

## 3. 固定工作表與別名

每日戰報：

- 主力店績：`上線數KPI_店點達成率_明細`，可接受相同語意含 `店點達成率`、`明細`。
- 個人：`上線數KPI_個人達成率_明細`，可接受相同語意含 `個人達成率`、`明細`。
- 補充頁籤依既有 runner 支援：手機保險、QIS。AQ-Voice AQ / AQ高資自 2026-08-22 起正式取消固定產出，除非使用者明確要求恢復，否則不得納入固定頁籤、固定 PNG、preflight 或 Outlook 附件；缺少 AQ-Voice AQ 不得阻擋每日戰報。臨時恢復需設定 `REPORT_AQ_HIGH_VALUE_ENABLED=1`。
- `好速上線明細` 只呈現 report run date 前一日的逐筆資料；例如 `0825.xlsx` 固定只取 `2026-08-24`。不得因該日零筆而退回顯示更早日期。零筆時保留頁籤並註記 `YYYY-MM-DD 當日無上線`，明細列直接略過。
- 好速加碼自 `2026-08-27` 戰報（來源資料日 `2026-08-26`）起，認列的 `500M`、`1G`、`1.2G/1G+` 逐筆另加 `0.5` 戰報點數。來源 `業績認列` 已含 36M 的 `+0.5`，因此 36M 僅分欄稽核，不得再加第二次；戰報總點數固定為 `來源認列點數 + 1G/500M 戰報加碼`。剔除列一律不加碼。

台獎：

- 店點：`上線數KPI_店點達成率_明細`。
- 個人：`手機競賽_個人達成率`。
- Y26：`台獎機款`、`個人台獎`。

缺少必要工作表必須 blocked。

## 4. 固定欄位與別名

欄位必須依名稱辨識，不可只依固定欄號。

店點／個人共同欄位：

- 機款群組欄：`上線數_*` 或 `空機數_*`。
- 實際數：`實際數`。
- 目標數：包含 `目標數`。
- 達成率：包含 `達成率`，可包含 `推估達成率`、`店推估達成率`。
- 實際獎金：`實際總獎金`、`實際獎金`。
- 推估獎金：`推估原始總獎金`、`推估獎金`、`預估獎金`。
- 排名：`排名`、`名次`。
- 是否領獎：`領獎與否`、`是否領獎`、`領獎`。

今日 2026-08-05 回歸欄位：

- 店點獎金摘要可能在第 16 列，實際欄位可能超過 `KF`，例如 `KH:KK`。
- 個人獎金摘要可在 `KF:KI`。
- parser 必須掃描實際最右欄並支援多列摘要偵測。

## 5. 資料辨識

- 北一二B整體列可用 `北一二B`、空店名加總列或固定彙總列辨識，輸出統一為 `北一二B整體`。
- 九間門市必須完整：酒泉、萬大、大稻埕、復興南、三創、杭州南、永吉、通化、六張犁。
- 個人以員編優先辨識；姓名只作顯示。
- 職務分組：店長含代理店長；副店含副店長；業代含業務代表、業代、銷售人員。

## 6. 排名、達成率、領獎與缺口計算

- 排名：優先讀來源報表排名欄；不得由使用者手動提供。
- 達成率：`實際數 / 目標數` 為回歸驗算基準；若來源有推估達成率，可顯示來源推估欄，但 preflight 必須確認分子、分母存在。
- 是否領獎：優先讀來源 `領獎與否`；preflight 必須可由獎金、門檻與達成結果重新驗算，不得手填。
- 整體缺口台數：`ceil(目標數 * 0.8) - 實際數`，小於 0 記 0。
- 店點缺口台數：`ceil(目標數 * 0.5) - 實際數`，小於 0 記 0。
- 北一二B整體風險門檻固定 80%；各店風險門檻固定 50%。

## 7. 機款與獎金設定

每月變動內容只放在 `report-automation/config/award-config-YYYY-MM.json`，正式 active 指標為 `report-automation/config/award-config-active.json`。

設定檔包含：

- `selectedModels`：使用者指定當月追蹤機款。
- `modelAliases`：處理 `/`、`＆`、全形半形、空格、不同命名。
- `modelGroups`：同系列合併。
- `rewardRules`：當月獎金、門檻與獎階。
- `expectedStoreRows`、`expectedPhoneItems`。

主程式不得為每個月散落硬寫機款或獎金。更換月份時只新增月設定，主程式不應變更。

## 8. 信件、圖卡與附件格式

寄送順序固定：

1. `北一二B每日戰報 YYYY-MM-DD`。
2. `北一二B台獎機款進度 YYYY-MM-DD`。

每日戰報 8 個直接附件：

- Daily Report Excel
- Main KPI PNG
- Addon Score PNG
- Personal Manager PNG
- Personal Deputy PNG
- Personal Sales PNG
- Insurance PNG
- QIS PNG

台獎 6 個直接附件：

- `Y26重點台獎手機_台獎更新.xlsx`
- `01-08-03_手機競賽日報_店點達成率_台獎機款更新.xlsx`
- `01-08-04_手機競賽日報_個人達成率_個人台獎更新.xlsx`
- `台獎機款.png`
- `個人台獎.png`
- `台獎機款_店點進度點名.md`

ZIP 只能作為 Outlook 多附件失敗的緊急備援，且需明確回報。

## 9. 寄出前硬性阻擋

下列 gate 以 component 分別 fail-closed；KPI 失敗只阻擋 KPI，awards 失敗只阻擋台獎，兩者不得互相冒充 fresh：

- Graph 雲端 canonical 來源不存在、下載失敗或 cloud identity 不完整。
- 來源不是 xlsx zip，或今日檔與前日 hash 相同。
- 資料日期、統計區間或郵件日期不符。
- awards 兩份 cloud source 未同時更新，或未通過與 KPI cutoff 相同的資料截止日／SHA-256／batch id 驗證。
- 當月設定月份與資料月份不一致。
- 獎金報表 hash 與 active 設定不一致。
- `phone_items` 不等於 active config 的 `expectedPhoneItems`。
- `store_rows` 不等於 active config 的 `expectedStoreRows`。
- 九間門市加整體不完整。
- 排名空白、重複或全部為 0。
- 達成率分子或分母缺失。
- 領獎欄無法由來源欄位或獎金結果交叉驗證。
- 正文、圖片、Excel、Markdown 不是同一次 run 產物。
- 附件缺失、超過 3MB、或沿用昨天／上一次錯誤產物。
- 2026-08-05 回歸欄位 `KH:KK` / row 16 類型再次漏讀。

## 10. Run ID、log 與冪等性

每日應產生：

- `report-automation/logs/run-manifest-YYYYMMDD.json`
- `report-automation/logs/preflight-YYYYMMDD.md`

manifest 至少包含 `runId`、`startedAt`、`sourceFiles`、`sourceHashes`、`sourceBatch`、`configVersion`、`gitCommit`、`reportDate`、`validation`、`mailSubjects`、`mailIds`、`drivePublishedAt`、`result`。

同一天重跑必須標記 supersedes、原因與新舊差異。正確重跑不得再次寄出第一次錯誤產物。

## 11. 網站發布規則

KPI 與 awards 可分別發布 component。KPI 已通過時，stale awards 不得阻擋 `kpiBattle`；awards fresh run 通過時，使用 `private_publish_awards_component` 只替換 `awardsBattle` 並逐值保留 KPI payload/component。私有發布必須使用既有受保護憑證路徑，不得顯示、記錄或寫入秘密；發布目的地限定既有私有 Google Drive 檔。任何 consumer 都不得以 top-level `publishedAt` 判斷 component 資料日期。

## 12. 發布 retry、續跑與完成 gate

KPI 與 awards 各自依序通過：`source → build → Outlook Sent Items verified → component publish → Website readback → Supervisor App readback`。只有六段全部通過才是該 component 的正式成功；郵件寄出、Drive 更新或 HTTP 200 都不是 UI readback。awards BLOCKED 不得阻擋 KPI 的 publish/readback，也不得把 KPI 狀態回退。

publish 與 Website/Supervisor App readback 僅對 HTTP `404/429/500/502/503/504`、network exception、timeout 做最多三次有限重試，等待順序為 2 秒、5 秒。`400/401/403/409/422`、驗證/授權錯誤、來源日期或 hash 不一致、schema 錯誤、單邊 awards 更新及任何 business validation failure 都不重試並立即 fail-closed。

若 source、build 與 Outlook 驗證已通過但發布未完成，必須先核對 artifact 的 `reportDate/cutoff/runId/SHA-256`，再從未完成的 `publish → readback` 續跑。禁止重新下載或解析來源、重新產 Excel/PNG、重新寄信。已是 fresh 且 readback 精確吻合的 component 必須 idempotent skip。

每次失敗/重試只可寫入 mode `0600` 的 `publication-attempts-YYYYMMDD.jsonl`，欄位限制為 timestamp、report_date、cutoff、run_id、component、action、attempt、HTTP status、移除 query/hash 的 response URL、redirected、Content-Type、exception type、retrying、retry_succeeded。不得寫入員編、bootstrap code、device/session token、管理者密碼、OAuth token、POST body 或私有 KPI 明細。

正式 readback 必須分別確認 Website KPI、Website awards、Supervisor App KPI、Supervisor App awards 的資料日期/截止日、run identity 與實際內容；KPI 至少確認九店、40 人與 25 KPI，awards 至少確認 13 機款、10 rows 與九店。受保護頁未登入或僅顯示登入畫面時必須維持 BLOCKED。
