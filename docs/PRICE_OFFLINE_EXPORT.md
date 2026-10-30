# 手機與舊換新離線 HTML

在既有 repo 執行：

```sh
node scripts/export-price-offline.mjs --out /absolute/private/門市查價_YYYYMMDD_v1.html
```

需要 Node.js 20 以上及網路。輸出位置須在 repo 外，檔名不得已存在。這是給資料維護者使用的匯出指令；門市只需收到 HTML，不需安裝 Node.js 或連網。每次完成既有正式資料更新後重新執行，核對產出檔所示的兩個來源日期與版本，再自行轉寄新版。匯出不會寄信、發佈、更新正式資料或改登入權限。

若已有同次正式公開讀取的完整回應，可重現同一批價格：

```sh
node scripts/export-price-offline.mjs --shopping /private/shopping.json --tradein /private/tradein.json --out /private/new-version.html
```

新建 HTML 與同名 `.receipt.json` 記錄產出時間、公開來源中繼資料、讀取時間、資料指紋與檔案 SHA-256。價格日期是正式來源檔版本日期，不代表即時或當日終日價格；兩類來源可以有不同日期。不會以讀取日冒充來源日。

v2 沿目前主線的企業／複合月租條件顯示與篩選，且在主要畫面明示「版本日期不等於生效日期；未到適用日請依公司公告」。提前發布的未來版本不能因匯出日而視為已生效。

此實作重用 `tradein-query.html`、`threec-query-ui.js`、`threec-query-core.js`、`threec-comparison-core.js`、`price-model-view.js`、既有回收商／廠牌篩選與緊湊價格版面。原有獨立查價頁原本提供異動 JSON／CSV 下載，沒有價格離線 HTML；其他看板的門市 HTML 匯出是業績資料，故沒有拿來混入本檔。手機保留一般、企業、原表條件、月租、期數、版本、容量、橫向／卡片與分頁；舊換新保留原廠牌／機款／回收商／等級及缺價規則，新增清除篩選。本檔僅包含當版價格，歷史調價紀錄不在這份離線檔內。

產出時僅以既有免登入 `threec_snapshot_read` 公開讀取動作取得快照，正式服務先驗證 active 版本及來源；本機再驗證 schema、筆數、日期、版本一致、兩家原回收商與等級完整，白名單投影商品、價格與來源資料。保留來源另有的愛鋒派；不加價、不補價、不把回收價加進手機專案價。不載入舊換新個人績效、員工或客戶明細。登入受阻、回應不完整或版本不符即停止，不以快取或測試資料替代。

HTML 內嵌全部 CSS、JS 與價格，移除雲端讀取、管理／寫入／登入／儲存路徑、外部連結和歷史異動下載。CSP 禁止連線與表單送出。重新讀取按鈕只整理本檔內嵌資料，不向雲端取新版。HTML 唯讀不等於加密或存取控制。

## 驗證

```sh
node --test tests/export-price-offline.test.mjs tests/threec-price-transport.test.cjs tests/price-model-view.test.cjs
```

另外應將每次取得的正式來源列與 HTML `price-data` 解碼後逐值比較，檢查桌機／手機查詢、清除、兩分區反覆切換及零外部請求。產出的本機準備時間是該裝置當次實測，不能由此宣稱普遍速度提升倍數。

此版本只新增離線產出器、測試、說明與 npm 入口；未合併、部署或修改正式資料。對既有查詢原始碼採檢查錨點的轉換；將來來源程式結構變動會停止匯出，請先檢查相容性。

## 上傳管理頁下載入口

使用者已確認既有管理碼僅本人持有。`gas/ReportUpload.html` 的「下載唯讀版（HTML）」位於發布收據及正式讀回結果下方，只有 `published`／`already_current` 且讀回核對完成後顯示；只有預覽、發布失敗、未確認發布回應、兩類 active 未齊備時不會提供下載。選換檔、回復、離頁會使進行中匯出回應失效。

每次按下載，新的同源 `google.script.run` 方法 `threec_export_readonly` 先呼叫原有 `reportUploadAuthorize_`，仍由後端比對原管理碼與原員編白名單。這保障持有既有管理碼且符合既有白名單才能觸發，不是新增強身分驗證。沒有新密碼、session、憑證、權限、Script Property 或 OAuth scope；原有驗證碼不設 session 有效期，本功能也不宣稱新增過期機制。缺碼、錯碼、錯員編及直接呼叫都走同一後端拒絕。

後端只接受前端版本錨點，不接受來源預覽。持有 script lock 讀取同一 registry 下的兩類 active，沿既有快照／來源雜湊驗證及公開商品欄位投影，組裝完整雙頁籤 HTML。錨點過期、未發布、不完整或驗證失敗即停止。匯出無 Drive／Properties／cache 寫入，管理碼及操作者資訊不傳入組裝器。既有公開查價與 JSON／CSV 異動下載保持原樣，沒有增加公開 POST action。

GAS 與 CLI 共用 `threec-price-offline-core.js` 及由原查價畫面生成的模板，避免另造價格或排版邏輯。執行 `npm run build:price-offline-assets` 產生 `gas/ThreecPriceOfflineCore.gs` 和 `gas/ThreecPriceOfflineAssets.gs`。

正式部署仍需批准；不要將共用 `gas/Code.gs` 整份推到正式上傳專案。從目前正式上傳專案重新拉取私有來源後，執行：

```sh
node scripts/prepare-price-offline-upload.mjs /private/fresh-upload-source /private/new-upload-candidate
```

候選只修改 `ReportUpload.html`，新增 `ThreecPriceOfflineCore.gs`、`ThreecPriceOfflineAssets.gs`、`ThreecPriceOfflineExport.gs`。其他原檔、manifest、驗證函式與設定保持逐檔一致。產出器會在既有上傳頁／授權／正式讀取契約不同時停止，禁止以舊版覆蓋其他人的改動。部署批准後應先保存回復版本，再發布同一 upload Deployment，讀回不可變來源並完成本人登入後下載驗收；本機測試不是已上線證據。
