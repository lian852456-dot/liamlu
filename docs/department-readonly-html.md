# 部區店務／金牌 HTML 唯讀快照

`department-ops.html` 的「下載 HTML 唯讀版」沿用既有短效督導工作階段，只讀已保存店務與金牌月報。尚未載入的店務會先依原 API 讀取；任何領域未完成版本／權限核對、正在讀取或寫入、背景返回待核對、登出或到期時停止匯出。

單檔包含原版型、兩個 tab、月／季／部區／店點及金牌人員篩選。店務維持原 G／E／F 值；金牌沿現有月報彙總，跨店調動保留整季、缺月不補零、Q2 封存且不重算，三月皆 final 才標示季度已結算。來源截止、保存時間、版本、原檔 hash 與匯出時間分開列示。

資料在匯出邊界重新投影。僅包含現有顯示欄位及原姓名遮罩，排除 token、密碼、私有 API URL、原始 bundle、來源活動欄、receipt、歷史版本與 registry。沒有上傳、保存、回復、登入、表單或營運回寫能力。CSS／核心／呈現碼全部內嵌，CSP 禁止連線與表單提交。此檔由本人離線保管，持有人可複製，並非可撤銷的權限連結；不自動更新。

更新顯示元件後執行 `npm run build:department-readonly-export`。既有已核對回應也可用 `node scripts/export-department-readonly.mjs --scores /private/scores-response.json --gold /private/gold-response.json --out /private/output.html` 產生檔案。可省略其中一個來源，缺少的 tab 明示未包含，不能用測試值或每日金牌代替。私有檔、原始回應與真實資料截圖都放 repo 外；不提交 PR 或 Pages。

驗證：`node --test tests/department-readonly.test.cjs`；`npx playwright test tests/department-readonly.spec.js --config=playwright.department-gold.config.cjs --workers=1`。瀏覽器使用合成資料，覆蓋離線、雙 tab、部區／店點篩選、缺月／跨店、封存、桌機／手機、無網路／無寫入控制、一鍵下載與登出後阻擋。

## 品管課單月原檔

上傳同時接受既有月份頁籤與「店務管理月報 疏失總表」單月工作簿。單月月份只採 `MAIL` 缺失總數後的當期成績欄 Y年月，並與「服務查核」月份核對；不從檔名、後方歷史成績欄或輔助趨勢表猜月份。輔助「近6個月缺失數」標頭不同時，保留明確來源提示；主來源月份衝突、年度不符或兩種模板混合時停止。

沿用原 G／E／F 快取值、A–D 控制店數、來源定位及正式保存契約；解析不重算公式，不讀寫人員名單分頁。上傳卡片就近顯示進度、停止原因與結果。預覽不寫入，勾選確認後仍只保存選定月份；未選月份、歷史及金牌資料保留。前端解析支援不需要變更正式後端驗證、儲存或權限。
