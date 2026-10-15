# 北一二B 唯讀儀表板候選

這是既有 liamlu 的五頁入口，尚未發布。`home.html` 督導專區新增同源 `readonly-dashboard.html` 連結，既有入口保留。頁面需先在情報站完成原業務登入；部門巡店 passcode session 不能當作業務登入。

KPI、台獎、個績重用原 KPI 轉換器、已核實補充與台獎守門器，保留原始總進度／公司排名、機款與角色規則。門市是同一個共享篩選，每頁分別顯示來源、資料截止、戰報日期及版本，沒有把介面更新日當成資料日。

締結率與來客數讀取受保護私有快照的可選 `conversionBattle` 元件。正式來源目前尚未接入，因此缺少元件時顯示「尚未匯入」，不放示意數值，不由 KPI 推算來客。來客一律用每日／累計趨勢線；AQ 來客與符合 RT 續約資格的來客分列。率由所選分子母合計重算，零分母顯示 —，未觀測日期不補零。來源只有上月同期總量，所以只展示整段同期卡，不繪上月逐日線。

## 登入與資料範圍

- 指定密碼通道只恢復原 `GasBClient` session，呼叫原 bundled read；拒絕後不回退到另一通道。
- 原員編核准裝置通道保留 `private_access`、`kpicalc_access` 順序；使用者、裝置與可讀資料仍由原後端決定。
- 不建立登入表單、密碼、token、角色或權限；不讀寫任何正式資料。頁面只在記憶體保存這次成功讀回的資料；背景／離頁、逾時、登出與拒絕時清空，返回重新驗權讀取。
- HTML、repo 與 service worker 不含真實業績、原 Excel、人名清單或敏感明文包。個績使用既有來源提供的遮罩姓名，不增加揭露。
- 單檔可由 `node scripts/build-readonly-dashboard.mjs /absolute/output.html` 建置。公開內容只有介面與程式；`file://` 入口維持鎖定，需要在原站同源部署後沿用原登入。這不是離線加密報表，不宣稱可撤銷的離線金鑰已完成。

## 來源準備與私有更新候選

本機準備指令：

```sh
node scripts/prepare-readonly-conversion.mjs /absolute/來源.xlsx /absolute/private/new.json /absolute/private/prior.json
```

最後一個舊版 JSON 可省略。輸出必須在公開 repo 外，且不可覆寫現有版本。只解析 AQ締結率、RT每日、RT締結率、樞紐四張已核實表，核對九店／逐日／TTL／分子母／同期文字及截止。原始檔不改動，也不經網路送出。重複檔不累加；店日鍵衝突、缺店、倒退截止、異月合併、移除既有鍵或截止後非零衝突都停止。現只接受已核實的 31 天來源欄位版型，其他月份需先核對來源版型。

`gas/ReadonlyConversion.gs` 已實作私有元件的預覽／確認發布／狀態／回復。四個公開函式都先呼叫原 `reportUploadAuthorize_`（既有管理者驗證碼＋員編白名單），不接受業務 B session 代替主管上傳權限。`readonly-conversion-upload.html` 是原站的獨立更新頁，以受控 POST 呼叫原戰情 owner；不增加 HtmlService 公開介面，也不修改目前 3C／舊換新上傳部署或價格資料。公開空殼仍沒有原始 Excel 或業績資料。

預覽只將嚴格標準化的九店店日彙總放入30分鐘的伺服器暫存，不新增正式檔。確認時在原 script lock 內核對預覽操作者、期限、active revision 及 hash，先建立私有不可變 JSON 並完整讀回，再切換專用 `READONLY_CONVERSION_STATE_V1` 資料指標。該屬性只存檔案 ID／hash／版本／操作時間，並非憑證或授權設定。相同來源不累加，舊預覽不能覆寫較新版本；讀回失敗維持原指標。首版可回復到原本無元件狀態，既有版本檔不刪除。

原 `privateDashboardSnapshot()` 只增加可選元件讀取；不寫入或重組原 KPI／台獎檔。新檔必須仍在原私有資料夾、維持私有分享狀態且 owner 相符。元件損壞時，KPI／台獎保留原讀取結果，締結率明確顯示不可用，不回退為零或舊資料。原 A／B 驗權、RPC 邊界、角色、會話期限與資料來源規則均不變。原站更新頁僅提供空介面；狀態及寫入仍須原主管驗權，沒有 Google cookie 或 B token 代替管理者驗證的路徑。

GAS 最小候選範圍：`Code.gs` 的一行可選 reader hook 與四個受原主管驗權的 POST 路由；只新增 `ReadonlyConversion.gs`、`ReadonlyDashboardCore.gs` 兩個 GAS 模組。更新 UI 是原站 HTML／JS，SheetJS 沿用原站資產。`node scripts/build-readonly-conversion-assets.mjs` 從單一核心重建 GAS 核心資產。不得把 repo 的整份 `Code.gs` 覆蓋正式工作副本。

此流程已在隔離環境連通真 XLSX 解析器、實際 doPost 解析／原管理者驗權、候選 GAS runtime 與 POST 更新 UI，驗證預覽／發布／完整讀回／重複匯入／版本衝突／回復。正式 owner 已於2026-10-15台灣10:18更新為第69版，沿用原部署 ID、執行身分、存取設定與六個 OAuth 範圍，可回復第68版。套用前先比對兩個原驗權函式，並只替換 UI 選取的 POST／snapshot 函式片段；版本歷史原八處週報差異保留，僅多兩處掛接及兩個新增模組。四個新路由正式匿名檢查均由原管理者驗權拒絕，未回傳私有內容。真來源尚未正式匯入，前端仍待必要正式驗收，不能將部署或隔離通過當作流程已完成。

## 發布門檻

先完成原業務登入，核對四端最新正式資料（主代理指定來源批次 10/14，不能由 10/15 頁首推斷）。以各原來源對帳九店、個績可見範圍、台獎、截止、排名與篩選；確認新增締結率元件逐鍵與 Excel 一致且 10/12 後占位不作零。再驗撤權、實體 iPhone、資料更新與回復，才發布正式入口。

本機通過不代表上述正式門檻已完成；相關隔離測試皆使用合成業務資料。真來源只在私有本機解析核對，沒有嵌入產物。

同網域驗收入口已由 PR236 提供：`review-20261015/readonly-dashboard.html` 與 `review-20261015/readonly-conversion-upload.html`。它們是可開啟的受保護候選，無業績資料嵌入；正式原登入／鎖定畫面已核對，合法登入後的資料與角色驗收仍待執行。
