# TWM每日戰報 OneDrive Cloud-first 讀取與產出流程

## 固定正式來源

- Production 唯一預設來源為 Microsoft Graph 直接讀取 OneDrive `TWM每日戰報` 雲端資料夾。
- KPI 精準取 report run date 的 `MMDD.xlsx`；台獎精準取 canonical `01-08-03...店點達成率、排名及獎金.xlsx` 與 `01-08-04...個人達成率、排名及獎金.xlsx`。
- 每份檔案先記錄 cloud item ID、name、`lastModifiedDateTime`、`eTag`、size，再下載 bytes、計算 SHA-256 並放入含 run ID／item ID 或 hash 的 run-scoped staging。staged SHA 必須與下載 SHA 相同。
- 禁止 silent fallback 到本機 CloudStorage、Google Drive、staging、outputs 或 cache。本機 OneDrive 只有明確人工 emergency 模式，預設 OFF。

## Production Graph OAuth

- b-2 固定使用 `ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth`。Microsoft Graph delegated permission 只取 `Files.Read`，MSAL 預設 OIDC scopes 包含 `offline_access`。
- Liam 首次以 `node report-automation/work/onedrive_graph_auth.mjs login` 完成互動登入；後續 runtime 以 `acquireTokenSilent()` 從 Keychain cache 取得或 refresh access token。
- MSAL serialized cache／refresh credential 只保存於 macOS Keychain service `North12BOneDriveGraphMsalCache`，不得進 Git、logs、stdout、manifest 或 staging。
- 只有無 cached account 或 Microsoft 明確要求互動時回 `AUTH_RECONSENT_REQUIRED`；網路、Keychain 或 client 設定錯誤保留各自 fail-closed 狀態。
- `North12BOneDriveGraphAccessToken` direct token 只保留人工 UAT／緊急測試，必須明確指定 `ONEDRIVE_GRAPH_AUTH_MODE=direct-token`；production 不自動選用。

## 固定本機輸出資料夾
- 每日戰報輸出路徑：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/`
- 使用方式：每日戰報從 Graph 下載後的 run-scoped staging 讀取，成品固定存到本機專案輸出資料夾。
- 寄送附件：使用英文檔名副本 `TWM_North12B_Daily_Report_YYYY-MM-DD.xlsx`、`TWM_North12B_Main_KPI_YYYY-MM-DD.png`、`TWM_North12B_Addon_Score_YYYY-MM-DD.png`，避免中文或全形檔名在郵件端打不開。
- Outlook 寄送注意：`attachment_files` 需使用陣列格式，且每日戰報需一次附齊 Excel、主力KPI截圖、加掛得分截圖，例如 `["/Users/liamlu/Downloads/liam-agent/report-automation/outputs/TWM_North12B_Daily_Report_YYYY-MM-DD.xlsx", "/Users/liamlu/Downloads/liam-agent/report-automation/outputs/TWM_North12B_Main_KPI_YYYY-MM-DD.png", "/Users/liamlu/Downloads/liam-agent/report-automation/outputs/TWM_North12B_Addon_Score_YYYY-MM-DD.png"]`。
- 2026-06-25 實測補強：Outlook connector 的 `attachment_files` 要傳實際 list/array，不可傳 JSON 字串，也不可傳單一路徑字串。預設必須直接附上 Excel 與 PNG 截圖，讓郵件端可直接看到圖片附件。若多附件上傳不穩，ZIP 只能作為臨時備援；使用 ZIP 後需補寄一封直接 PNG 截圖附件版，或在回報中明確說明截圖在 ZIP 內而不是獨立附件。

## 預期檔案
- `AQ.csv`：每日 AQ 新申裝明細，Big5/CP950 編碼。
- `RT.csv`：每日 RT 續約明細，Big5/CP950 編碼。
- `【密】即時戰報_YYYYMM.xlsx`：即時戰報 Excel 模板，包含 `AQ明細`、`RT明細`、`全國`、`全國 (2)` 等頁籤。
- `MMDD.xlsx` 或其他每日 KPI 檔：例如 `0615.xlsx`，用於北一二B每日戰報、主力KPI、加掛得分等彙整。
- 其他輔助檔：例如手機價格異動清單、KPI調整簡報，除非任務需要，不作為每日即時戰報必要來源。

## 讀取規則
1. 先用 Graph 列出雲端資料夾並精準比對 canonical name；不得用 Finder duplicate suffix 或 filesystem mtime 當 identity。
2. 若使用者指定日期，優先使用指定日期；若未指定，使用今天日期。
3. `AQ.csv` 與 `RT.csv` 以檔名固定抓取最新內容。
4. 即時戰報模板優先抓 `【密】即時戰報_YYYYMM.xlsx`，其中 `YYYYMM` 對應指定日期月份；若同月多份，先列出候選檔再確認，不任意覆蓋。
5. KPI 只接受 `MMDD.xlsx`；台獎只接受兩份 canonical basename。Graph 缺檔、下載失敗或 identity 不完整即 blocked。
6. 下載後解析 Excel period／snapshotDay；KPI、店點與個人的 `source_data_date` 必須一致。不得用 mail date、run date 或 filename 推導 cutoff。
7. 台獎 freshness 以 cloud item ID＋`eTag`＋`lastModifiedDateTime` 判斷；任一份沒更新即 blocked。
8. 來源 blocked 時不得發布昨日資料；KPI 與 awards 採 component-level gate，stale awards 不得阻擋 fresh KPI。

## Emergency fallback
- Production 不再使用 Google Drive 或本機 CloudStorage 自動備援。若 Graph 失敗，即維持 BLOCKED。
- 本機 OneDrive emergency 必須由人工明確設定 `REPORT_SOURCE_MODE=local-emergency`＋`REPORT_LOCAL_EMERGENCY_ENABLED=1`；台獎另需 `PHONE_AWARDS_SOURCE_MODE=local-emergency`＋`PHONE_AWARDS_LOCAL_EMERGENCY_ENABLED=1`。這些旗標預設均為 OFF。
- Emergency 模式也必須保留完整來源 path、SHA-256 與 Excel 日期 lineage，且不得把 local identity 標成 `provider=onedrive-cloud`。

## 即時戰報產出規則
- 將 `AQ.csv` 匯入即時戰報副本的 `AQ明細`。
- 將 `RT.csv` 匯入即時戰報副本的 `RT明細`。
- 保留原始 OneDrive 檔案不動，輸出副本固定存到本機專案輸出資料夾。
- 依 `全國 (2)` 公式口徑重算並輸出圖片。
- 圖片固定呈現：
  - 左側 AQ，藍色主題。
  - 右側 RT，綠色主題。
  - 北一二 A/B/C/D 用不同顏色標示。
  - 合計列保留強調色，百分比欄保留熱區色塊。

## 固定輸出
- 更新後 Excel：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/即時戰報_YYYYMMDD_AQRT更新.xlsx`
- 全國 (2) 圖片：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/全國(2)_AQRT更新_YYYYMMDD_北一二ABCD標色.jpg`
- 北一二B每日戰報：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/北一二Ｂ每日戰報＿YYYY-MM-DD.xlsx`
- 北一二B每日戰報主力KPI圖片：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/北一二Ｂ每日戰報＿YYYY-MM-DD＿主力KPI.png`
- 北一二B每日戰報加掛得分圖片：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/北一二Ｂ每日戰報＿YYYY-MM-DD＿加掛得分.png`
- 北一二B每日戰報郵件附件：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/TWM_North12B_Daily_Report_YYYY-MM-DD.xlsx`
- 北一二B每日戰報郵件主力KPI附件：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/TWM_North12B_Main_KPI_YYYY-MM-DD.png`
- 北一二B每日戰報郵件加掛得分附件：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/TWM_North12B_Addon_Score_YYYY-MM-DD.png`
- 北一二B個績戰報店長圖片：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/北一二Ｂ個績戰報＿YYYY-MM-DD＿店長.png`
- 北一二B個績戰報副店圖片：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/北一二Ｂ個績戰報＿YYYY-MM-DD＿副店.png`
- 北一二B個績戰報業代圖片：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/北一二Ｂ個績戰報＿YYYY-MM-DD＿業代.png`
- 北一二B個績戰報郵件店長附件：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/TWM_North12B_Personal_Manager_YYYY-MM-DD.png`
- 北一二B個績戰報郵件副店附件：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/TWM_North12B_Personal_Deputy_YYYY-MM-DD.png`
- 北一二B個績戰報郵件業代附件：`/Users/liamlu/Downloads/liam-agent/report-automation/outputs/TWM_North12B_Personal_Sales_YYYY-MM-DD.png`
- 寄送前檢查：執行 `REPORT_DATE_ISO=YYYY-MM-DD node /Users/liamlu/Downloads/liam-agent/report-automation/work/prepare_send_payloads.mjs`，產出每日戰報與台獎郵件內文。每日戰報與台獎需獨立判定：每日戰報只要日期正確、8 個附件存在且單檔小於 3MB，即可寄送；台獎需另外依 active 月設定確認 `phone_items`、`store_rows` 與 6 個附件都通過才可寄送。若台獎 blocked，不可阻擋每日戰報寄出。
- AQ高資：自 2026-08-22 起正式取消固定產出與固定附件，不列入每日戰報頁籤、PNG、preflight 或 Outlook 附件清單；除非使用者明確要求恢復，否則不得因來源缺少 AQ-Voice AQ 而阻擋每日戰報。
- M+ 傳送清單：同一個寄送前檢查會另外產出 `/Users/liamlu/Downloads/liam-agent/report-automation/outputs/mplus_delivery_YYYY-MM-DD.json`。此檔是 M+「滷蛋公務」的標準交付 manifest，會分成 `daily` 與 `phone_awards` package，並列出每包訊息文字、Excel/Markdown 檔案與 PNG 圖片附件。
- M+ 傳送規則：Outlook 兩封信寄出並完成 `寄件備份` 驗證後，需再把同日業績戰報與台獎報表傳到 M+ 群組 `滷蛋公務`。傳送內容使用 `mplus_delivery_YYYY-MM-DD.json`，每日戰報 package 附上每日戰報 Excel、主力KPI PNG、加掛得分 PNG、店長個績 PNG、副店個績 PNG、業代個績 PNG；台獎 package 附上 Y26 更新 Excel、店點台獎更新 Excel、個人台獎更新 Excel、台獎機款 PNG、個人台獎 PNG、店點進度點名 Markdown。
- M+ 驗證規則：使用 Chrome / M+ Web 既有登入狀態開啟 `https://web.mplusapp.com/chat.do`，搜尋並選取 `滷蛋公務`，逐一貼上 package 文字並上傳對應檔案與圖片；每個 package 送出後，需確認對話尾端顯示 `已傳送`。若遇到 M+「帳號已在其他地方登入」重複登入提示，使用者已授權可直接按 `確認`，再重新選取目標對話。若 Chrome、M+ 登入或附件上傳被擋，需回報 M+ 傳送 blocked，但不得回頭改動已完成的 Outlook 寄件結果。
- Codex 直接交付規則：每日戰報與台獎兩封 Outlook 郵件完成寄送及 `寄件備份` 驗證後，回報中必須直接附上本機 outputs 的全部 12 個交付檔案連結；其中 7 張 PNG 圖片需用絕對路徑直接顯示，5 個 Excel/Markdown 檔案需提供可點擊的絕對路徑連結。M+ blocked 不得阻擋這項 Codex 直接交付。
- 私有網站雙發布：僅在每日戰報與台獎兩封 Outlook 郵件皆完成 `寄件備份` 驗證後，才可執行。先以 `build_github_pages_data.py --report-run-date <執行／寄信日> --data-cutoff-date <source_date_range 最後一日>` 建立本機快照，確認 KPI／台獎 `report_run_date` 等於執行／寄信日，`report_date` 與 KPI `data_as_of_date` 等於資料截止日；不得從 `MMDD.xlsx`、郵件或附件檔名推導正式資料日。再執行 `REPORT_UPLOAD_EMPLOYEE_ID=<受權員編> REPORT_RUN_DATE_ISO=<執行／寄信日> REPORT_DATA_CUTOFF_DATE=<資料截止日> zsh /Users/liamlu/Downloads/liam-agent/report-automation/work/publish_formal_website_with_keychain.sh`。流程固定先更新既有 `north12b-kpicalc-private-latest.json`，再更新既有 `north12b-dashboard-private-latest.json`；不得修改網站、重新部署 GAS 或變更 JSON 結構。快速上傳解析後必須把 `meta.sourceFile` 校正為原始 `MMDD.xlsx`，不可保留 `report-upload-temp-*` 暫存檔名。manifest 檔名仍以執行日定位，但正式 publication/readback 的 `reportDate` 必須等於資料截止日；任一日期或來源不一致都維持 blocked。
- 私有網站完成閘門：上述腳本必須再從正式 `kpicalc_access`、`private_access` 與 `private_admin_snapshot_status` 讀回，確認 KPI／台獎戰報日都是同日、kpicalc 與 snapshot 的資料截止日一致、來源檔一致、kpicalc 為 9 店／40 人／25 KPI、台獎符合 active 月 `phone_items`／`store_rows`，且 owner=`lian852456@gmail.com`、sharing=`PRIVATE`。只有 `run-manifest-YYYYMMDD.json` 的 `websiteResult=published-verified` 且 `datesAligned=true`、`sourcesAligned=true` 才可回報「網站更新完成」；任何一條發布或讀回失敗都必須標示 `blocked`，不可只以 dashboard snapshot 成功、HTTP 200 或頁面可開啟冒充完成。
- KPI 圖片格式規則：`主力KPI` 與 `加掛得分` 圖片的長表頭必須完整換行不可截斷；表格內容水平與垂直置中；所有標題、表頭與數值使用粗體 `Microsoft YaHei`。此規則必須由 `build_today_report.mjs` 共用產圖函式套用，確保每日自動化重跑後仍一致。
- 備援 ZIP 附件：若 Outlook 多附件寄送不穩，可建立 `North12B_Daily_Report_YYYY-MM-DD_Attachments.zip` 與 `North12B_Phone_Awards_YYYY-MM-DD_Attachments.zip`，再分別以單一 ZIP 附件寄送；但這不是標準交付，因截圖不會直接出現在郵件附件預覽。標準交付仍需直接附 PNG。

## 個績戰報
- 每日戰報 runner 會從同日 KPI 來源檔的 `上線數KPI_個人達成率_明細` 頁籤抽北一二B人員個績。
- 職稱分成三類提醒：`店長（含代理）`、`副店`、`業代（含銷售人員）`。
- 圖片分成三張：店長一張、副店一張、業代一張。
- 欄位固定呈現 `AQ`、`A999`、`A1399`、`RT`、`R999`、`R1399`、`好速`；每個 KPI 都顯示 `實際數`、`達成率`、`差異`。
- `差異` 以 100% 目標數為基準，計算方式為 `實際數 - 目標數`；負數代表尚缺，需用紅字或淡紅底提醒。
- 店長（含代理）達成率欄不使用底色提醒，避免和 AQ 低於 10 點的提醒混淆。
- 店長（含代理）右側 `提醒` 欄只提醒 `AQ` 實際點數低於 10 點的人員，且 `AQ` 實際數低於 10 點時需用紅字或淡紅底標示。
- 副店與業代（含銷售人員）在各自區塊內依總達成率由高到低排序；總達成與各 KPI 達成率需用顏色呈現表現好壞，右側 `提醒` 欄列出該人前三個主要缺口，方便主管快速點名。
- 副店與業代（含銷售人員）兩張圖都需加入 `DOD` 欄，使用前日同來源頁籤以員編優先對照，計算 `今日總達成率 - 前日總達成率`；提升用綠色、衰退用紅色、持平或無前日資料用中性色。

## 前日比較欄位
- 每日北一二B戰報 runner 會自動嘗試抓取前一日日期檔作為比較基準。
- 若前日檔存在，`主力KPI` 頁籤新增：`前日公司排名`、`排名變化`、`前日KPI`、`KPI增減`。
- 若前日檔存在，`加掛得分` 頁籤新增：`前日加掛得分`、`加掛得分增減`。
- `排名變化` 計算方式為 `前日排名 - 今日排名`，正數代表排名進步，負數代表退步。
- `KPI增減` 與 `加掛得分增減` 計算方式為 `今日 - 前日`，正數代表成長，負數代表衰退。
- 若前日檔不存在，仍產出今日報表，但不加入比較欄位，並在回報中說明缺少前日比較基準。

## Y26 台獎機款來源與截圖
- 每天先以 `preflight_onedrive_cloud_sources.mjs` 從 Graph 精準下載兩份 canonical 來源；不接受 `*.xlsx` glob、Finder duplicate suffix 或昨日 staging。
- preflight 必須確認兩份 cloud version 都更新、下載／staging SHA 相同，且兩份 Excel cutoff 都與 KPI cutoff 相同；任一失敗只維持台獎 BLOCKED。
- 正確流程是以最新 01-08-03/04 更新 `Y26重點台獎手機_台獎更新.xlsx`，再產出 `台獎機款.png` 與 `個人台獎.png`；不可只讀舊的 Y26 完成版頁籤。
- `台獎機款` 追 active 月設定的 13 個 canonical models。達成率與標色固定用 `實際數 ÷ 目標數`；店點台獎 Excel、HTML 與 PNG 需呈現實際、目標、達成、店獎與督獎。
- 寄送台獎機款郵件前，需確認 `phone_awards_update_summary.json` 的 `phone_items` 等於 active config 的 `expectedPhoneItems`，並確認附件完整。台獎未通過時只阻擋台獎信與 awards component，不阻擋每日戰報或 KPI component。
- 2026-06-25 實測補強：`update_phone_awards.py` 需使用 Codex bundled Python 執行，因系統 `python3` 可能缺 Pillow；可用 `/Users/liamlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12 /Users/liamlu/Downloads/liam-agent/report-automation/work/update_phone_awards.py`。

## 建議指令
```text
請用 Microsoft Graph 直接讀取 OneDrive 的 TWM每日戰報雲端資料夾；Graph 缺檔或下載失敗就 BLOCKED，不要 fallback 本機或 Google Drive。使用今天的 AQ.csv、RT.csv 與當月即時戰報 Excel，
把 AQ / RT 明細帶入即時戰報，更新全國 (2)，
用左右雙表呈現：左邊 AQ 藍底、右邊 RT 綠底，
北一二 A/B/C/D 用不同顏色標出來，
輸出更新後 Excel 與全國 (2) 圖片給我。
```

指定日期時：
```text
請用 2026/06/15 的資料出 TWM 每日戰報。
```
