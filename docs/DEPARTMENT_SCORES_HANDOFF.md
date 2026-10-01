# 北一二部店務成績：候選整合交接

成績功能以各月原始門市明細為歷史主表。登入後讀取持久版本；需要更正時選本機 XLSX、核對差異、勾選月份與確認後保存，重新登入即可查看。沒有改善紀錄或個案文字時不推定改善與因果。簡報範例尚未提供，目前只有 Excel 與 `north12-scores-brief-v1` JSON 資料匯出介面，沒有完成 PPT 自動產製。

## 精確基準與模組隔離

- 基準 main：`0b862fc7eab15f05049ea53c52ee324a3a1cfcd0`。
- 候選分支：`codex/department-ops-scores-persistent-20261002`。
- 共用 HTML 只替換 `#storePanel` 與增加成績 CSS/core/controller。保留金牌資產版本、原金牌頁籤及控制器；新增 `#storeRulesMount[data-department-rules-mount]` 供規則提醒模組語義掛接。父任務整合其他分支時只合併此區塊／資產，不覆蓋整份 HTML。
- 此 PR 不修改 `department-ops.js`、`department-ops-core.js`、`department-ops.css`、`gas/Code.gs`、現存 Patrol bundle 或其他工作樹。
- 新增獨立 `department-scores-core.js`、`department-scores.js`、`department-scores.css`、`gas/DepartmentScores.gs`、`gas/DepartmentScoresCore.gs`、合成測試、原檔本機 QA 腳本及整合腳本。

## 父任務共同部署掛接

精確基準掛接 patch 為 `docs/DEPARTMENT_SCORES_INTEGRATION.patch`，已通過 `git apply --check`；父任務若已合併鄰近金牌／提醒路由，改用語義腳本保留其差異。父任務完成金牌／提醒分支語義合併後，先對最新共同分支執行 `node scripts/integrate-department-scores.mjs`。它只檢查現行 anchor 與列出差異。確認後執行 `node scripts/integrate-department-scores.mjs --apply`，再 `npm run build:patrol-gas`。

精確掛接點：`gas/Code.gs` 與 `scripts/build-patrol-gas-bundle.mjs` 的既有 doPost 路由：

```js
else if (action === 'department_ops_read') result = departmentOpsRead(payload);
// 在此行後加入：
else if (['department_scores_read','department_scores_history_read','department_scores_publish','department_scores_restore'].indexOf(action) >= 0) result = departmentScoresDispatch_(payload);
```

Builder 最後另複製兩個獨立 GAS 模組到 `patrol-gas`。每個成績 handler 在讀資料／寫入前都驗證既有 `ptRequireSession_`；不加入 GET、金牌同仁公開 action 或新 Deployment。這是既有督導資料域內的受保護 POST 路由擴充，不新增匿名資料 API，不變更權限或 scope。

不要把本候選的舊 GAS 大檔貼到正式編輯器。正式部署用父任務整合後最新 11+模組的完整受控版本，沿現有 Deployment／URL；先備份 editor 與版本，逐檔核對後再部署。存檔不能代替部署。候選缺少掛接時頁面會明確顯示服務尚未就緒，不退回本機成績快取。

## 私有儲存與正式初始化 scope

- 僅沿既有 `departmentOpsFolder_()` 解析出的原 owner 私有資料夾；owner 必須與既有私有 Spreadsheet 的 owner 一致（沿用 Drive 授權，不引入 Session／userinfo.email consent）、分享為 PRIVATE、沒有 editors/viewers。`Liam勿動` 名稱直接拒絕。若任一條件未通過，先報父任務，不建新資料夾、不移動／共享檔案、不繞到其他資料域。
- 首次初始化僅新增成績 manifest `north12-department-store-scores-v2.json` 與所選月的 immutable revision JSON。既有金牌 latest、規則、巡店、媒體、名冊及其他資料檔不修改。原 XLSX 不上傳。
- 選月多月交易先建立並讀回所有 revision，最後在 ScriptLock 中一次切换 manifest generation。每月留 revision history。未上傳月份保留；相同 canonical hash 不增 revision。原檔 SHA 與月內容 SHA 分開；requestId 防重與 generation 防止舊預覽覆寫新資料。
- 若建立 revision 中途失敗，active manifest 不變；已建立但未採用的 revision仍在私有資料域，保留不刪除。timeout／503 等不自動重送任何寫入，先讀回判斷是否已提交，再重新預覽。
- 回復需先讀取歷史 revision、核對差異并明確確認；建立新的 active revision，保留被替換版本。
- 正式初始化 payload／原檔／實際 QA 報告留在本機 repo 外 `../private-source/`，不提交公開 repo。父任務須取得該既有私有資料域與部署 readback，再以 freshly read `generation`、新的 requestId、既有有效 token、`confirm:true` 初始化。候選 payload 預設 `confirm:false`，不含 token。
- 完成初始化後必須受保護 `department_scores_read` 讀回並逐月 canonical hash 對帳，驗證重開／重新登入沒有選原檔也有資料。再驗匿名沒有任何成績／人員內容及新版錯誤處理。這些正式驗收尚未完成。

## 解析與計算契約

多層表頭按語義辨識預警／final／CSMO／回收的三版欄位，允許門市明細行及變段欄位位移。四區控制店數只校驗 completeness，主管與全區總計不當成門市。原表 G 快取成績、E 總缺失、F 扣分、H 全國名次分開；部內排名同分同名次另算。原資料缺失總數不含舊機回收、扣分卻可能包含，不以 E=0 判無扣分。缺值／NA／錯誤／0 區分，核心 G 無有效快取阻擋該月，子排名錯誤只警告，外部公式不重算。月份頁籤及原年度優先，子表頭舊月份不覆蓋。近半年的人員移店參照不混入門市歷史。

部與各區使用門市平均分；不同店數按門市等權加權。季度與近半年明確標完整性；不同原表單位的分項不混合成案件數。門市逐項顯示分類、原值、缺資料狀態、單位與工作表／儲存格定位。

## 測試與證據

- Node 成績／原部區測試：18/18 通過。`node --test tests/department-scores.test.cjs tests/department-ops.test.cjs`。
- Chrome 合成 E2E：8/8 通過。`tests/department-scores.spec.js`；1440px／390px、匿名、登入持久讀取、reload、確認前0寫入、去重、錯檔／缺列／核心錯誤、子排名缺資料、source定位、寫入ack遺失後只讀復原、同月更正、歷史回復與JSON匯出。
- 全庫 Node 616項：593通過、22失敗、1 skipped。未修改基準main 606項：583通過、相同22失敗、1 skipped；逐一failure identity一致，沒有本次新增失敗。既有KPI／PWA／價格路由等歷史測試問題詳見 `DEPARTMENT_SCORES_REGRESSION.json`，未跨範圍修正。
- 本機正式原檔 QA：`scripts/qa-department-scores-source.mjs`；六個月／222 店月、1554 個核心來源儲存格、10952 個子項來源儲存格逐格對帳通過，2553 個外部公式快取被直接保留，重新計算為0。各月控制數與既有分析一致。真實店分數、人名及原檔只留本機私有報告，不放測試fixture或此公開文件。
- 截圖為合成測試，留 `test-results/scores-1440.png` 與 `scores-390.png`（ignored）。

程式與本機驗證、草稿 PR、正式部署、正式資料初始化／讀回、Liam實機驗收分別回報。此交接不宣稱正式部署或使用者驗收完成。外部 AI協作中心文件只有讀取，因不在本任務 writable scope，未直接同步；父任務完成共同部署後補正式交接與进度。
