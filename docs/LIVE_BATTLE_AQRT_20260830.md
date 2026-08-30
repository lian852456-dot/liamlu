# 行進間戰報 AQ／RT（2026-08-30）

## 狀態

- 分支：`feature/live-battle-aqrt-20260830`
- 基準：`origin/main` `0923a2f`
- 目前是正式部署候選；未合併、未部署 GitHub Pages、未呼叫 GAS 寫入，也未以 Liam 的真實 AQ／RT 原始檔做 Safari UAT。
- 正式入口預定放在 `home.html` 的「督導專區」，不取代「Liam 情報站」或「戰報快速更新」。

## 使用流程

1. 從智慧營運中心的督導專區進入「行進間戰報」。
2. 以既有員編／Approved Device 驗證；後端 `kpicalc_access` 必須回傳 `profile.isTrusted=true`。
3. 唯讀載入正式 KPI 的九店 `TTL AQ上線點數`、`RT上線點數` 月目標。
4. 在本機分別選擇 AQ、RT 原始檔；支援 CSV、TSV、XLSX、XLS 與 Big5／CP950。
5. 產出全區與九店實績／目標／達成率／尚缺數，排序前四個優先追進店點，生成可直接貼群組文字。

## 資料與權限邊界

- AQ／RT 原始檔只存在頁面記憶體；不轉 base64、不送往 GAS、不寫 localStorage／sessionStorage／IndexedDB／Cookie，重新整理或關閉頁面即清除。
- 唯一網路請求是既有唯讀 `private_access` 與 `kpicalc_access`；未新增 GAS action、Deployment、Sheet schema、Drive 檔案或 token。
- 達成率只以「本次本機檔 actual ÷ 正式 KPI target」計算；不混入正式前日 actual，也不回寫正式 KPI。
- AQ／RT 檔案分開做檔名／內容證據檢查；疑似選反即 fail closed。
- 只保留北一二B九店 canonical 名稱與正式 DNB code；其他區列忽略，不顯示任何個人明細、門號或案件編號。

## 解析規則

- 優先偵測門市／營業點／服務中心／DNB code 欄位；沒有明確表頭時才掃描列內 canonical 店名或正式 code。
- 找到「上線點數／計件點數／銷售點數／點數／件數／數量」欄時加總該欄；找不到時以唯一明細列計 1。
- 找到受理／申請書／交易／訂單／案件／用戶／門號欄時，以「店點＋案件 ID」去重；同一案件不重複計件。
- 沒出現在檔案中的店點保留為 0，讓戰報能顯示掛蛋與完整九店缺口。

## 驗證

- Node 全站契約：`331/331 PASS`。
- 新增專項：九店名稱、DNB code、點數加總、明細計件、案件去重、Big5／CP950、AQ／RT 選反、正式 target 缺漏、九店缺口與群組文案全部通過。
- Chromium E2E 已建立，但本次執行環境的瀏覽器程序因 `process_singleton socket Operation not permitted` 無法啟動；WebKit runtime 亦未安裝。因此不能把 Node PASS 當成 Safari 實機驗收。
- Google Drive 既有「業績報表」資料夾目前只有 KPI／台獎 Excel，未找到 AQ.csv／RT.csv；正式上線前仍需 Liam 提供當日真實 AQ、RT 各一份做欄位與結果對帳。

## 明確零變更

`app.html`、`app.js`、`app.css`、`index.html`、`kpi.html`、`patrol.html`、`gas/Code.gs`、稽核、快速上傳、KPI／台獎／每日回報、班表、巡店、半月檢查、里程、Approved Device schema 與任何正式資料檔均為 0 diff。

## 回退

- 合併前：關閉候選 PR／刪除 feature branch，不影響正式站。
- 若未來合併：revert 單一功能 commit，即可移除 `home.html` 新卡片、新頁、解析器與測試；不需操作 GAS 或任何正式資料。
