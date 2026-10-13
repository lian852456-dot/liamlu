# 北一二B營運中心統一高速讀取架構｜第一階段候選

本 PR 從正式 `main` `11907891f218f0b3ee51b67373a8def474550e97` 建立，試點為 `department-ops.html` 的部區金牌月報與店務成績。2026-10-13 正式公開六項資產的 bytes／SHA-256 均與此基準一致。候選未合併、未部署；正式 GAS、Properties、OAuth、部署 ID、營運資料與其他系統均未寫入。正式頁已開啟，仍需本人完成督導登入；正式服務效能、真實資料對帳及實體 iPhone 驗收尚未執行。

## 現行讀取與瓶頸

金牌在既有 `ptauth` 恢復後讀取；成績在首次開啟店務頁籤時才讀取。月份、季度、四區與店點篩選原本就由前端計算，這部分保留。既有 `busy` 已能合併首次連續頁籤操作；不能把這項既有行為當成本 PR 新增的速度改善。

原成績返回流程會重新下載全部已保存月份。後端每次重新讀 manifest、取得各 active revision 的 Drive 檔案、檢查權限、解析與驗證月資料，沒有版本未變的短回應。這是程式可證實的重複工作；它不能單獨證明歷史慢請求的所有後端原因。

成績讀取仍維持最多三次、每次最多 45 秒、總期限 75 秒及 0.8／1.6 秒重試間隔。金牌仍維持原有有限重試。沒有加長 timeout，也沒有替寫入增加自動重試。`_request` 是每次傳輸的獨立識別；它與邏輯請求去重各有用途。

## 共用元件與隔離

`session-read-manager.js` 提供每個 consumer 自行建立的讀取管理器。每個 instance 有獨立 Map、版本、工作階段世代及 in-flight promise。它不建立全域資料快取，不使用 localStorage、sessionStorage、IndexedDB、Cache API 或 Service Worker 保存業務資料。現有登入 token 的儲存機制保留；新元件只在閉包中比對目前身分。

| Consumer | 記憶體 namespace | 資料版本 | 受保護來源 |
| --- | --- | --- | --- |
| 金牌月報 | `department-gold-monthly` | monthly revision + `readVersion` | 原 `department_ops_read` |
| 店務成績 | `department-scores` | generation + `readVersion` | 原 `department_scores_read` |

同 instance／同 resource／同登入世代的並行請求共用一個 promise。已完成資料在前景切換時留在目前已授權的記憶體工作階段。登入到期、登出、身分改變或明確授權拒絕時，兩個試點的資料、預覽、檔案選擇與進行中讀取都會清除；舊回應不能復活資料或改動新登入的忙碌狀態。

瀏覽器解碼 token 的期限只作本機到期上限；登入及授權仍由原後端決定。客戶端不延長 session。已知期限使用精確 timer，讀取及輸出邊界仍會再核對。伺服器撤權在後續後端檢查回報時清除，這不是伺服器推送的即時撤權機制。

## 返回與版本協定

實際背景／離頁時遮住私有畫面並取消背景前尚未完成的讀取，保留最後已驗證版本供下一次版本比對。返回時合併 `pageshow`、`focus`、`visibilitychange` 事件，只有可見資料域進行必要的後端查核；未完成查核前，私有工作區不可見且不可操作。已載入的另一個域若在背景期間未驗證，切回它時會先查核自己的版本。

請求可帶 `knownVersion`。候選後端先執行原 session、期限、撤權、owner／私有資料夾／各 active 檔案 ACL 檢查，再由 manifest／registry 狀態與 active 檔案修改時間產生 `readVersion`。版本相同才回傳：

```js
{
  status: 'ok',
  readContract: 'department-version-read/v1',
  readVersion: '<opaque version>',
  notModified: true,
  // 成績仍含 contract / generation；金牌仍含 monthly.revision。
}
```

前端要求協定與版本完全匹配，才接受 no-change 證明；缺快取、版本不符或協定不符都不使用舊資料。版本不同則完整下載、走原資料驗證與呈現。外部修改 active 檔案的時間也會令版本失效，重新走原內容完整性檢查。缺少可靠修改時間時使用完整讀取。

舊正式後端會忽略 `knownVersion` 並回傳完整資料，候選前端仍可讀取。**只發布前端不會得到後端省略全量下載的效果。** 後端版本回應在本 PR 僅為來源候選，不代表已套用正式 GAS。

短暫網路、HTTP 或格式失敗會停止使用該私有畫面並要求重新讀取核對，保留尚未被明確撤銷的登入；不以舊快取冒充已驗證資料。明確的授權／私有域拒絕才清除共用登入與全部試點資料。

## 業務保留與寫入邊界

原金牌與成績 core、資料來源、G/E/F/H 原值、季度按員編累計、跨店區歸屬、缺月 null、Q2 保留、缺失分析、上傳、差異預覽、明確選月、版本回復、Excel、PPT 與列印流程保留。沒有重算原始公式，也沒有改寫 `gas/Code.gs` 或 `patrol-gas/PatrolCode.gs`。

保存／回復前失效相應讀取快取；保存後仍強制完整下載並逐值對帳。金牌帶 operationId 的 receipt readback 永遠回傳完整資料。忙碌中的金牌重新讀取不會打斷保存；若此時返回，先查核 session，待原作業完整對帳後再查核資料版本。寫入不自動重送；回應不明時沿用原 receipt 查核。

門市規則提醒 sidecar 保持自己的授權與讀取生命週期，沒有併入金牌或成績快取。它仍可能在頁籤／返回時另發送必要請求，應與兩個資料域請求分別計數。

未啟用的 legacy `department-ops.js` history/review localStorage helpers 保留原狀；現行月報元件沒有掛接這些路徑。月報元件缺失時維持 fail closed，不回退至 legacy 快取。既有金牌 ACL helper 與成績 ACL helper 的 owner 綁定細節仍依原契約；本 PR 不擴大權限或統一權限模型。

## 量測與驗證

完整前後時間、API 次數與樣本方法見 [量測收據](DEPARTMENT_FAST_READ_PHASE1_MEASUREMENTS.md)，可機讀資料見 [合成效能 JSON](evidence/department-fast-read-phase1-20261013/performance.json)。數字是本機真實瀏覽器執行、合成資料及固定模擬網路延遲；不能稱為正式 GAS 或實體 iPhone 實測。

程式與測試涵蓋請求去重、跨域隔離、過期、撤權、身分替換、舊回應、背景前 flight 取消、忙碌期間返回、本機解析晚到、版本更新、ACL 修改、來源內容修改、完整寫入讀回與輸出。既有 baseline integration 有一項因提醒收合而點不到登出按鈕；候選測試先展開提醒再驗證登出，未改產品提醒功能。

本機重跑（所有 API 使用合成攔截）：

```sh
npm ci --ignore-scripts
npx playwright install chromium webkit
node --test tests/session-read-manager.test.cjs tests/department-version-read.test.cjs tests/department-ops.test.cjs tests/department-gold-monthly.test.cjs tests/department-scores.test.cjs tests/department-ops-integration.test.cjs tests/department-store-presentation.test.cjs
# 在另一個 terminal 開本機靜態 server。
python3 -m http.server 8772 --bind 127.0.0.1
```

```sh
TEST_BASE_URL=http://127.0.0.1:8772/ DEPARTMENT_GOLD_PREVIEW_URL=http://127.0.0.1:8772 npx playwright test tests/department-fast-read-lifecycle.spec.js tests/department-scores.spec.js tests/department-gold-monthly-ui.spec.js tests/department-ops-integration.spec.js tests/department-scores-denial.spec.js tests/department-display-recovery.spec.js tests/department-scores-on-demand.spec.js tests/department-scores-return-session.spec.js --workers=2
# 性能 profile 自行啟動靜態 server；輸出選在 repo 外。
PERF_VARIANT=candidate PERF_EVIDENCE_DIR=/tmp/department-read-evidence npx playwright test --config=playwright.department-fast-read.config.cjs
mkdir -p /tmp/department-read-baseline
git archive 11907891f218f0b3ee51b67373a8def474550e97 | tar -x -C /tmp/department-read-baseline
PERF_VARIANT=baseline PERF_APP_ROOT=/tmp/department-read-baseline PERF_EVIDENCE_DIR=/tmp/department-read-evidence npx playwright test --config=playwright.department-fast-read.config.cjs
```

## 正式驗收與後續整合

額外的 scoped CI workflow 候選已保留在本機驗收證據目錄，未加入 PR。現有 GitHub OAuth 推送授權不包含 workflow 寫入，GitHub 曾拒絕含該設定的首次推送；本 PR 使用獨立的新分支保留其餘程式／測試／收據，未擴大授權或重寫已發布歷史。既有 repo CI 與本文本機重跑方式可用；新增 workflow 若日後需要，再獨立處理。

第一階段維持 Draft PR，正式部署為 0。正式驗收前必須完成：

1. 由本人在既有正式頁登入，於同一電腦／手機／網路量測基準，記錄實際月份數、店數、人數、回應量、auth／資料／render 分段與 API 次數；不匯出 HAR、request body 或 credentials。
2. 以本 PR 固定版本作隔離候選驗收；對照正式來源逐值核對金牌月報、季度、四區店點、成績與缺失；驗證上傳差異、保存、回復、Excel／PPT 輸出仍正確。
3. 在可恢復的專用授權測試身分驗證 expiry／logout／switch／revoke 與返回。實體 iPhone Safari／安裝版返回、長背景與網路切換分別記錄，不以 WebKit viewport 代替。
4. 已載入資料切換目標為 0.5 秒內。首次正式載入目標待實際資料量與網路分段結果後訂定；合成 fixture 的首次讀取不能代替這個門檻。
5. Liam 確認資料、權限與速度後，才決定既有部署的精確模組發布範圍。保留 deployment／version／URL／ACL 身分、原來源備份與可回復點，模組增量更新並完整讀回；不得整份覆蓋正式 GAS。

回復時以 PR commit revert 還原前端；若後端另經核准發布，使用當次固定 deployment 的前版來源／版本回復。版本協定不改持久 schema，舊前後端仍接受完整讀取。這次不改 KPI、台獎、戰報、查價、Patrol 或門市店務檢查入口；未來每個模組需獨立 adapter、namespace、權限、版本及驗收。
