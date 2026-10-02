# 店務簡報生成模組（自動續頁）

本候選建立於 `77b960aedc7f77d7f401faf10381dd8c2f7b464c`。既有 HTML、controller、data API 皆未修改；原基線整合差異另存於 `DEPARTMENT_STORE_PRESENTATION_INTEGRATION.patch`。已另對發布後 main `a4c54bc61e03d085b4e10e728e9b2218187e19ce` 完成唯讀語義檢查，整合請優先使用 `DEPARTMENT_STORE_PRESENTATION_INTEGRATION_MAIN_A4C54BC.patch`，保留發布後的讀取重試、分區篩選、storePanel 觀察與字體／捲動修正。若 main 再更新，請依 hook 語義整合，不以本候選覆蓋既有共用檔案。

## 輸入與規則

`department-store-presentation-core.js` 接收既有 `north12-scores-brief-v1` 的 `records`、`period`、`filters`，不重新查詢、同步或修改正式資料。

```js
const model = DepartmentStorePresentation.buildModel(currentBrief, {
  startMonth: '2026-02',
  endMonth: '2026-07',
  targetMonth: '2026-07',
  region: '',                 // 或北一二A/B/C/D
  store: ''                   // 或現有 normalized 店名
});
```

上例為日期範圍示例，repo 測試僅含合成門市。輸入成績須為 0–100 的 number 或 null；數字字串、同店同月重複資料會停止生成。已篩選的來源不能透過 options 擴大範圍。

- 平均：有效店月原 G 成績等權；缺值不補 0 或 100，numeric 0 保留。
- 當月滿分率：100 分店數 / 當月有效成績店數；缺資料另列，分母為 0 時顯示「—」。
- 連續未滿 100：逐月往前檢查，缺月、缺值或滿分即中斷；不要求同一缺失原因，期間之前未評估。
- 六月滿分資格：日期範圍正好連續六個月且每月有 100 分；不足六月顯示未評估。只列資料資格，SPE 核定仍由管理者確認。
- 原因 TOP：每類涉及的不同店數，同店可以屬於多類。原 F 扣分、分項數值、台日、頁次與查核分數保留各自單位，不將扣分轉成件數。
- 歷史以店舖為單位，未補入缺乏權威來源的歷任店長。

趨勢涵蓋最多六個月。資料量小時保留原兩頁；更多資料自動產生同版型續頁與頁碼，不縮字、不漏列：上排區域每頁九店、下排十店；未滿分每頁最多十一店，長原因會增加列高並提早續頁；原因每頁最多七類，六月滿分名單每頁六店。所有 KPI 保持整個篩選範圍的總數，未滿分序號跨頁延續。核心 `planPages` 同時供 browser PPT、print HTML 及本地 artifact generator 使用。

## 網站一鍵產生 PPT

依序載入 core 與 `department-store-presentation-browser.js`。PptxGenJS 4.0.1 bundle 位於 `assets/vendor/store-presentation/`，第一次按產生時才載入執行，不依賴 CDN；既有 SW shell 會預先快取公開靜態資產。保留同目錄全部 license、NOTICE 與 receipt。

```js
const exporter = DepartmentStorePresentationBrowser.createExporter({
  getBrief: () => ScoresCore.brief(currentMonths(), currentFilters()),
  isAuthorized: () => currentSupervisorSessionIsValid(),
  onStatus: message => showMessage(message)
});
await exporter.downloadPptx();       // 本機 Blob 下載，自動續頁的原生文字與表格
exporter.printPdf();                 // 開啟 HTML 預覽，由使用者列印／另存 PDF
exporter.invalidate();               // 登出、重新讀取、隱藏工作區時呼叫
```

`isAuthorized` 必須沿用現有驗證後狀態，不能以有 local/session storage 字串視為已驗證。整合 patch 以目前 server 驗證並已讀取資料的 session gate 為基礎，並每次即時檢查 signed session exp，不依賴十秒輪詢。產生前、vendor 載入後及 Blob 生成後都會再次檢查；`invalidate` 取消進行中的下載並關閉本模組建立的列印預覽。不新增權杖儲存、API、上傳或寄送。

整合 patch 僅涉及 department-ops.html、department-scores.js、service-worker.js 及 app.js 的 SW 註冊版本。SW 僅新增三個公開 shell assets（core / browser / vendor）、cache revision 和一致的註冊 query，沿用原有 network-first / ignoreSearch / activation 行為，不快取私有 API 或報表。

整合 patch 提供兩個按鈕 `scorePptx` / `scorePrintPdf`、既有 `C.brief(selectedMonths(), filters())` hook、現有督導驗證 gate、登出、reload、所有日期/區/店篩選清理 hook。直接監聽既有 portal-before-logout，真登出與跨 tab 登出會立即關閉本模組列印 popup；沒有擴張 session 或安全權限。印出 PDF 需要使用者完成瀏覽器列印對話框；按鈕明確標示「列印／另存PDF」，沒有把 HTML 或 PPTX 改副檔名冒充 PDF。

預設字型為 Heiti TC，可在獨立 `buildDeck(model, PptxGenJS, {fontFace})` 呼叫中替換。PowerPoint 桌面端及 Windows 字型替代仍須整合後驗證。

## 本地 shared Presentations 產物

`scripts/generate-department-store-presentation.mjs` 使用 shared Presentations 的 `@oai/artifact-tool` 與 `finalizePresentation`；沒有以瀏覽器 PptxGenJS 替代本地 artifact authoring。函式參數如下：

```js
await generateStorePresentation(privateBrief, filters, {
  workspaceDir: absoluteTaskDirectory,
  outputDir: privateOutputDirectory,   // 位於 task 內、repo 外
  skillDir: sharedPresentationsSkillDirectory,
  pythonExecutable: bundledPython,
  binDir: bundledBin,
  stem: '店務預覽',
  fontFamily: 'Heiti TC'
});
```

CLI：`RUNTIME_NODE scripts/generate-department-store-presentation.mjs PRIVATE_BRIEF_JSON PRIVATE_OUTPUT_DIR [OPTIONS_JSON]`。需要 `PRESENTATION_WORKSPACE`、`PRESENTATION_SKILL_DIR`、`RUNTIME_NODE_MODULES`、`RUNTIME_PYTHON`、`RUNTIME_BIN_DIR` 環境參數；可選 `PRESENTATION_STEM` / `PRESENTATION_FONT`。沿既有 bundled runtime 解析 `@oai/artifact-tool`、reportlab、pypdf，無額外安裝。不要將來源 JSON、原 XLSX、範例圖或預覽產物放入 repo。

PPTX 具有可編輯原生表格和文字。固定版面 PDF 使用最終 PPTX 重新匯入後的 2 倍解析度頁面 render，再由 `store-presentation-pdf.py` 建立真正 PDF，頁數與原生 PPTX 相同；PDF 不是可編輯文字版，也不宣稱文字可搜尋。本機 LibreOffice CJK 匯出未能可靠保留中文字，故未使用該路徑。

## 驗證

```sh
RUNTIME_NODE --test tests/department-store-presentation.test.cjs
STORE_TEST_CHROMIUM=ABSOLUTE_HEADLESS_CHROMIUM \
STORE_PRESENTATION_TEST_OUTPUT=PRIVATE_TEST_DIRECTORY \
RUNTIME_NODE tests/department-store-presentation-browser.cjs
git apply --check docs/DEPARTMENT_STORE_PRESENTATION_INTEGRATION.patch
```

Core 測試涵蓋均值、null/zero、缺月、六月資格、篩選、重複資料、原單位、四種自動續頁界線、長原因列高與 HTML escape。Browser 測試使用獨立 headless context 與合成資料，驗證實際下載的兩頁原生表格 PPTX、lazy/offline vendor、篩選、驗證失效、生成期間登出取消、列印入口及無正式／外部請求。超量合成 44 店 / 30 未滿分 / 15 原因 / 14 滿分名單逐一核對 native tables 和 editable name shapes。

`tests/department-store-presentation-integration.cjs SHADOW_ROOT PRIVATE_OUTPUT_DIR` 使用 latest-main 完整隔離 shadow、合成 backend 的實際 controller 登入、即時 expiry 與 async 終點、三種篩選變更、reload、真 PR149 登出、跨 tab popup 清除。另實際註冊受控 SW，驗證舊 cache 升級、新三資產 query 離線讀取與私有 POST 未快取。該測試需要 localhost / headless browser 權限，但不接觸正式登入或服務。

本候選未套用 integration patch，未做 production 發布或 PowerPoint app 驗收。須在最新 main 審查整合，驗證正式登入、下載與列印流程後，依主流程取得具體發布確認。
