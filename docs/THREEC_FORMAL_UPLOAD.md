# 3C／舊換新正式上傳

正式入口為智慧營運中心的「資料快速上傳」，沿用既有可登入的 Apps Script 上傳 Deployment。

## 操作

1. 登入後，在「3C／舊換新資料更新」選擇來源 Excel。
2. 按解析，核對檔名版本日期、正式筆數、排除數／衝突數與來源 SHA-256。
3. 勾選核對確認，再按「確認發布私有快照」。只有通過後端授權及資料檢查的標準化 JSON 會寫入私有資料庫。
4. 同日期且來源雜湊相同不重複寫入；同日期且雜湊不同需要第二次明確確認。較舊來源日期不能覆蓋 active。
5. 回復上一版只交換該類資料的 active／previous 指標。

原始 Excel 在瀏覽器記憶體解析，不寫入 GitHub 或 Drive。換檔即清除預覽與確認；解析中的舊結果不能成為新檔預覽。發布與回復期間會鎖住相關控制項。

## 私有儲存

`THREEC_PRIVATE_FOLDER_ID` 僅由 Apps Script 的 Script Property 提供。後端須驗證資料夾名稱為「3C／舊換新資料庫（私有）」及分享狀態為 PRIVATE；讀回檔案必須屬於此資料夾。

不可變快照與不可變 registry 均完成讀回及雜湊驗證後，才更新 `THREEC_REGISTRY_FILE_ID`。發布失敗時既有 active 保留，孤立未啟用檔案不會被當成正式版本。

歷史首版 `2026-09-22` 的 3C 記錄為 2031 筆、排除 50 筆全空價格；`2026-09-16` 的舊換新記錄為 496 組、0 報價衝突。這些數字只供歷史查證；所有日期均依當次來源有效列與排除列驗證，沒有固定2031／496限制。零元有效；舊換新保留兩家回收商及 S／A／B／C，缺價維持空值。

## 部署範圍

本次以正式上傳 Deployment v70 的完整原始碼為基底，保留既有 KPI、台獎雙檔測試上傳、其他後端及 manifest；只追加 3C 儲存模組與解析器，並在同一份 ReportUpload 頁加入 3C 操作。沒有變更既有白名單、管理者驗證或 OAuth 權限。

`gas/ReportUpload.html` 保存與此次正式上傳頁相同的介面。共用 `gas/Code.gs` 的 3C 模組與正式上傳專案保持相同契約；不得用共用大檔整檔取代正式上傳專案最新版本。

部署後分別核對線上 UI、私有 registry 讀回及使用者實際選檔。資料夾已指定，但 registry 在第一次確認發布時才建立；啟用上傳不代表價格資料已發布或完成手機驗收。

## 2026-09-28 首次啟用 v72 交接證據

- Repo：`lian852456-dot/liamlu`；feature branch：`feat/threec-formal-upload-20260928`，基底 `aef43bf`。未合併 main、未 force push 或改寫 Work 歷史。
- 正式快速上傳沿用原 Deployment，現為 Apps Script **v72**；其他既有部署維持 HEAD／v67／v44。
- v71 線上讀回發現 raw JavaScript 被 HtmlService 當成 HTML 解析而拒絕；立即回復 v70，修正 include 後才部署 v72。依 [HtmlTemplate 官方 API](https://developers.google.com/apps-script/reference/html/html-template#getRawContent()) 使用 `getRawContent()`，並轉義 literal control characters，保留原解析器資產不變。
- v72 不可變原始碼重新 clone 讀回：9 個檔案與驗證過的部署來源逐一相同。完整舊程式碼仍為 v70 原始碼前綴；manifest、稽核與 HalfMedia 輔助檔均未變。
- v72 `程式碼.js` SHA-256：`c01b7d8e7e144f7753ae125980a25f711b92aad9d1621928b269db3ecee2415e`。
- 正式 `ReportUpload.html` SHA-256：`7821d18831b2e455f2696a9417825f58bb765ddbf33272cf0e1044cb3c1d58b7`，與 repo 頁面一致。
- 相關 Node 測試 **108/108 PASS**；瀏覽器 **43/43 PASS**，含真實 SheetJS／Work 解析器載入、中文 XLSX roundtrip、明確確認、換檔清除、過期解析隔離及同日期第二次確認。廣泛 Node baseline 的 20 個既有失敗未擴及修正，不宣稱全套測試通過。
- 正式 `/exec` 讀回啟用標記；兩個 file input 的 disabled 均為 false。此證據是在登入前檢查 DOM，不替代登入後實際選檔驗收。
- 私有資料夾 property 已保存並讀回匹配；Drive 重新列舉仍為空，未建立價格快照／registry、未上傳原始 Excel。登入後後端狀態與首筆真實發布讀回仍待本人操作。

後續請登入後選檔並解析，核對日期及筆數，再自行明確確認發布；第一筆成功發布後再核對 active／previous 與私有快照讀回。不得把上傳已啟用寫成價格資料已發布。

## 2026-09-28 千分位價格修正 v73

使用者完成舊換新首次發布後，3C 首次發布在專案價欄位被後端拒絕。原因是既有 Work 解析器使用 SheetJS `raw:false` 保留 Excel 千分位顯示字串，後端價格欄位只接受沒有逗號的非負數字。預覽成功不代表通過後端發布驗證。

本次只修改 `threecPriceField_`：純數字維持原值；完整的三位一組千分位字串才去除逗號。負數、文字、貨幣符號、科學記號及錯誤分組仍拒絕。沒有補零、略過錯誤資料、修改 Work 解析器、來源 Excel、授權、Script Properties、manifest 或其他部署。UI 增加「千分位價格修正版」標記，避免使用舊分頁。

- 相關 Node **112/112 PASS**、瀏覽器 **43/43 PASS**。新增真實 SheetJS 格式化 XLSX → Work 解析 → 後端正規化測試，以及異常價格零寫入、既有舊換新 active 保留測試。
- 先前交接檔唯讀重現相同欄位錯誤；修正後 2031 筆、排除 50 筆、37698 個千分位值可正規化，零元與空白維持，來源雜湊不變。交接檔 SHA 與使用者這次截圖不同，只是重現證據，不替代這次正式來源／發布驗收。
- 現有正式上傳 Deployment 切換至 **v73**；回復點為 v72。不可變 v73 重新 clone，9 檔逐一與候選相同；相較 v72 只變動程式碼價格函式及頁面版本標記。
- v73 `程式碼.js` SHA-256：`148dda2306af9a900887a4872e9bdc662a5cd2d169502399867ac18156438712`。
- v73 `ReportUpload.html` SHA-256：`ff027ffc13994125541697bf6ac8d91e2f8c5ca339c44362afbab1a602d94d3b`。
- 正式 `/exec` 新分頁讀回「千分位價格修正版 2026-09-28」。既有登入分頁再呼叫唯讀版本狀態：3C active／previous 尚無；舊換新 active `2026-09-16／496 筆`、previous 尚無，正式資料未變。
- 未代使用者發布任何價格。使用者須重新整理頁面、登入、選取當次來源並重新解析；首次 3C 發布仍需本人明確確認，成功後再正式讀回。


## 2026-10-01 正式查詢與更新契約

- 智慧營運中心「同仁大廳／門市作業」的「手機專案／3C＋舊換新」進入 `threec-query.html`；匯入測試頁保留。
- 查詢沿用 Pages 的 `north12b_private_dashboard_employee_id`／`north12b_private_dashboard_device_id` 及後端既有核准裝置授權。沒有管理者驗證碼／發布介面；未核准裝置無法讀取。
- 前端只向原快速上傳 Deployment POST `threec_snapshot_read`。上傳部署白名單僅增加這個已存在的唯讀路由；其他每日回報／巡店等路由維持隔離。
- 3C 下拉以無色機型、容量、品牌與來源工作表識別。同組完全相同價格矩陣合併，不同矩陣保留原始型號與條件；資費／合約／適用條件使用原始欄名。兩家回收商各自保留 S/A/B/C；零元與無報價分開。
- 顯示來源日期、SHA、發布時間及快照 hash。價格僅留在頁面記憶體；重新開啟／返回會重新讀取正式 active，登出、離頁、員編變更及讀取失敗會清除結果，過期非同步回應不能恢復結果。
- 大型資料先顯示前20組3C／50筆舊換新並明確提示篩選；下拉提供完整機款，選定後顯示該機款完整價格，沒有永久筆數限制。
- 更新仍為選檔→本機解析→逐價預覽（可搜尋）→來源／日期／筆數／SHA核對→勾選與明確確認發布→私有不可變快照／registry驗證→獨立 `threec_readback` 逐價比對預覽→門市重新讀取。
- 同日異檔仍需要第二次確認；舊日期不能覆蓋新 active；失敗保留原 active；回復只交換 active／previous。後端讀回額外檢查 registry 的來源版本、hash、kind與筆數吻合。
- `scripts/build-threec-upload-overlay.mjs` 從新鮮拉取的正式上傳專案建立部署候選，只更動3C模組、其讀取路由／白名單與ReportUpload介面。保留原245個函式、manifest、其他輔助檔及parser assets，不將共用Code.gs整份覆蓋。

### 本輪已核對及待辦

- 基底main `339a107`；Phase2分支與main差異為空，未重做解析器。
- 既有正式上傳v73與editor source的9檔一致，已私人備份；更新前回復點v73，同一Deployment ID／URL。
- 2026-10-01重新讀取正式registry：3C active／previous無；舊換新active 2026-09-16／496筆，previous無。真實來源SHA與active一致，724來源列解析為496組、3968報價欄位逐價相同，其中640缺價；未重新發布。
- 本案Node 121/121、相鄰首頁／庫存／金牌／部區Node42/42，部署候選後端runtime12/12；Chrome本案上傳／匯入11/11、查詢7/7、首頁36/36。真實價格寫入0。此為本機與唯讀來源證據，部署receipt／正式登入UI／Liam實機應另記。
- 3C來源尚未由Liam選定；新價格發布須本人選檔、核對當次日期／筆數／SHA並明確確認。禁止代替本人批准價格版本。
