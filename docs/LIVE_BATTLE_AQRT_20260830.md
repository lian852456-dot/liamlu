# 行進間戰報 AQ／RT（2026-08-30）

## 狀態

- 正式提交：`63c93f2`
- 基準：`origin/main` `0923a2f`
- 已由 GitHub Pages run #33322556767 成功部署；未呼叫 GAS 寫入，也未以 Liam 的真實 AQ／RT 原始檔做 Safari UAT。
- 正式入口已放在 `home.html` 的「督導專區」，不取代「Liam 情報站」或「戰報快速更新」。
- 第二階段候選：`feature/live-battle-upload-first-dynamic-20260830`，改為先選檔、正式目標選用、動態今日追缺與安全辨識資訊；尚未重新部署。
- 第三階段候選：`feature/live-battle-metrics-products-gifts-20260831`，主畫面改為五項戰情、實際商品矩陣與影音漏搭；尚未部署。

## 使用流程

1. 從智慧營運中心的督導專區進入「行進間戰報」。
2. 先在本機分別選擇 AQ、RT 原始檔；支援 CSV、TSV、XLSX、XLS 與 Big5／CP950，不需驗證即可先做本機辨識。
3. 兩檔辨識完成即產出全區與九店 A999、A1399、R999、R1399、好速目前上線，並顯示實際商品矩陣與 RT 影音漏搭；辨識不足時才顯示不含客戶資料的安全診斷。
4. 若需要今日追缺，再以既有員編／Approved Device 驗證；`kpicalc_access` 必須回傳 `profile.isTrusted=true`。
5. 唯讀載入九店五項月目標與截至昨日實績，依含今天的剩餘天數動態分配今日目標，追加目前尚缺與群組文字。

## 資料與權限邊界

- AQ／RT 原始檔只存在頁面記憶體；不轉 base64、不送往 GAS、不寫 localStorage／sessionStorage／IndexedDB／Cookie，重新整理或關閉頁面即清除。
- 唯一網路請求是既有唯讀 `private_access` 與 `kpicalc_access`；未新增 GAS action、Deployment、Sheet schema、Drive 檔案或 token。
- 今日達成只以「本次本機檔 actual ÷ 動態今日目標」計算；正式前日 actual 只用來分配今日目標，不混入當日上線，也不回寫正式 KPI。
- 今日動態目標以「月目標－截至昨日正式累積實績」除以含今天的剩餘天數後無條件進位；正式截止不是昨日即 fail closed。當日 actual 仍只取本次本機 AQ／RT 檔。
- 安全診斷只取工作表列欄數、候選表頭，以及資費／方案、商品／機款、合約／促案代碼、企客標示等業務分類值；不取姓名、門號、案件編號或受理明細。
- AQ／RT 檔案分開做檔名／內容證據檢查；疑似選反即 fail closed。
- 只保留北一二B九店 canonical 名稱與正式 DNB code；其他區列忽略，不顯示任何個人明細、門號或案件編號。

## 解析規則

- 優先偵測門市／營業點／服務中心／DNB code 欄位；沒有明確表頭時才掃描列內 canonical 店名或正式 code。
- 找到「上線點數／計件點數／銷售點數／點數／件數／數量」欄時加總該欄；找不到時以唯一明細列計 1。
- 找到受理／申請書／交易／訂單／案件／用戶／門號欄時，以「店點＋案件 ID」去重；同一案件不重複計件。
- 沒出現在檔案中的店點保留為 0，讓戰報能顯示掛蛋與完整九店缺口。
- A999／A1399 與 R999／R1399 優先取「變更資費、異動後資費、申辦資費」等欄位；計件前先依店點＋門號／案件去重。
- 上線商品優先取「商品型號」等欄位，只顯示本次檔案實際有上線的機款。
- RT 漏搭以同一門號／案件的全部列判讀；5G 599 型（含）以上、提前續約適用，企客排除，KKBOX／MyVideo 任一缺少即列出遮罩明細。

## 驗證

- Node 全站契約：第三階段候選 `339/339 PASS`。
- 新增專項：九店名稱、DNB code、點數加總、明細計件、案件去重、Big5／CP950、AQ／RT 選反、正式 target 缺漏、九店缺口與群組文案全部通過。
- 第二階段新增：無目標先解析、店碼載入後自動重試、動態今日目標、昨日截止門檻、已完成目標為 0、安全診斷不含姓名／門號全部通過。
- Chromium E2E 已建立，但本次執行環境的瀏覽器程序因 `process_singleton socket Operation not permitted` 無法啟動；WebKit runtime 亦未安裝。因此不能把 Node PASS 當成 Safari 實機驗收。
- Google Drive 既有「業績報表」資料夾目前只有 KPI／台獎 Excel，未找到 AQ.csv／RT.csv；功能雖已上線，仍需 Liam 提供當日真實 AQ、RT 各一份做欄位與結果對帳。

## 明確零變更

`app.html`、`app.js`、`app.css`、`index.html`、`kpi.html`、`patrol.html`、`gas/Code.gs`、稽核、快速上傳、KPI／台獎／每日回報、班表、巡店、半月檢查、里程、Approved Device schema 與任何正式資料檔均為 0 diff。

## 回退

- 部署前完整回復分支：`rollback/live-battle-aqrt-predeploy-20260830`（`0923a2f`）。
- Revert 功能提交即可移除 `home.html` 新卡片、新頁、解析器與測試；不需操作 GAS 或任何正式資料。
