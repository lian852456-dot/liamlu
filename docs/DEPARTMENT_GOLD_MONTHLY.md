# 部區金牌月報自助更新契約（候選）

`department-ops.html` 登入後透過既有 `department_ops_read` 讀取已保存月份。選檔只用於更新；本機預覽、伺服器差異預覽與明確確認完成後，`department_ops_publish` 才替代指定月份。程式候選與本機測試不代表正式部署或資料初始化完成。

## 來源與統計

- 只讀包含「全員」的工作表。辨識員編、姓名、督導區、店碼、店名、職稱及上方「資料日期」；主「金牌」需唯一符合上層總計模板，並與相鄰「SPE加分總計」區別。欄位移動可以辨識；模糊模板停止匯入。
- 以主金牌欄的數值淨結果為準，逐人加總須符合主表部區總計。不另加 PK、SPE、活動欄，不重算扣牌，不累加右側金牌副本。主牌公式、非數字、同月重複員編、跨月日期、員編不完整均停止保存。
- 員編保持字串，包含英數及前導零；遮罩姓名只供顯示。未知活動欄以來源欄碼、標題路徑及值保留在私有月版本，不參與計算。
- 季度以員編合併，呈現每月淨牌、合計、來源月數與每月店區。沒有來源是 `null`／「無來源」，不補零。區／店篩選列出曾在該區／店任職者，仍顯示其完整季度；四區總計依各月當時歸屬。
- 每份新檔預設 `provisional`。截止日到月底不會自動結算；操作者須勾選「助理最終結算版」才可保存 `final`。季度僅在三個月份齊全且皆 `final` 時標示已結算。
- 2026 Q2 與更早月份鎖定，只保留既有來源，不重新累計資格或覆盖。月報不讀寫北一二B每日接龍 ledger。

## 私有儲存

沿用 `departmentOpsFolder_()`：現行營運試算表所在的既有私有 Drive 資料夾。沒有新增共享權限、資料夾設定或驗證方式；資料夾／檔案若非 private、另有編輯者／讀者，或版本檔不在該資料域，停止讀寫。

既有 `north12-department-ops-private-latest.json` 保持原檔不變。首次保存時將其 `months` 原樣留於 registry 的 `baseMonths`，由月份 active 指標覆蓋新版。讀取 legacy 月份只添加顯示 metadata；其結算狀態未知時為暫定，已呈報月份為封存。

- `north12-department-gold-monthly-registry-v2.json`：revision、baseMonths、activeByMonth、historyByMonth、operation receipts。
- `north12-department-gold-month-v2-<uuid>.json`：不可變月版本及內容 hash。
- `north12-department-gold-registry-backup-<uuid>.json`：每次正式指標更新前的備份。

GitHub Pages 只保存程式和合成測試。助理原檔、姓名員編、解析 JSON、私有版本檔、通行碼與權杖不得提交到 repo；前端不將月報寫入 localStorage／IndexedDB。登出或離開頁面清除人員列、篩選選項與預覽。新版元件未載入時停止月報操作。

## 保存、去重與回復

寫入契約為 `north12-monthly-write/v2`；沿用現有短效督導 session。先 `plan`，後 `commit`；回復先 `restore-plan`，後 `restore`。每次要求 operationId 和 expectedRevision。十分鐘簽名預覽收據綁定 session、revision、操作及候選內容；修改內容、過期或其他人先更新時須重新預覽。

後端在 ScriptLock 中核對，先保存月版本並讀回，再保存 registry 指標並讀回。失敗時恢復前一個 registry 並核對恢復值；不刪版本檔。相同檔案識別卻不同內容會拒絕；相同內容與結算狀態不建立重複版本。同一 operationId 的相同請求可讀回收據，不會追加。較早截止日或已結算改暫定需要額外明確勾選。

每月只有一個 active；同月替代不追加人月。回復只切換該月指標，完整保留歷史。瀏覽器確認保存後另呼叫 read，逐值核對當月內容與狀態；網路結果不明時以 operation receipt 和當前 revision 核對，不自動重送寫入。

## 驗證與整合預覽

```sh
node scripts/build-patrol-gas-bundle.mjs
node --test tests/department-gold-monthly.test.cjs tests/department-ops.test.cjs tests/gold-daily.test.cjs tests/patrol-gas-isolation.test.cjs tests/patrol-gas-dependency-closure.test.cjs
npx playwright test tests/department-gold-monthly-ui.spec.js --config=playwright.department-gold.config.cjs --workers=1
```

瀏覽器測試會自啟本機 HTTP server，所有 GAS 請求由合成替身接收；可透過 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 指定 Chrome，`DEPARTMENT_GOLD_SCREENSHOT_DIR` 保存桌機與手機合成預覽。測試涵蓋首次保存、自動載入、同月替代、真正跨版本回復、缺月匯出、Q2 保留、登出清除及缺失元件保護。後端測試涵蓋權限、鎖定月份、過期／異動預覽、去重、衝突、回復及讀回失敗復原。

正式整合時，先合併金牌、店務、規則各自的模組，再以合併後最新版重建 GAS bundle。此月報沿用既有 dispatcher 的 `department_ops_read/publish`；共用 `Code.gs` 僅將兩個 wrapper 委派至新模組並增加 legacy 私有檔檢查。不以本分支的整包覆蓋其他模組。前端與 GAS 新版需協調發布，然後以既有 session 初始化月報、逐值讀回並確認 Q2 與其他月份沒有變更；現行 Web App 版本與回復點應在該整合階段記錄。

發獎狀輸出目前保留全員的月值／季合計，不套用既有 80／100／120／180 門檻。後續需確認獎階門檻、每人最高階一張或各階多張、任職／缺月資格，以及正式獎狀姓名來源，才能產生獎狀數量；這些口徑不阻擋月報保存與統計。
