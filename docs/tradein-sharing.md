# 舊換新同仁分享

`tradein-progress.html` 的個人進度右側新增「同仁分享」。進度維持免登入，分享獨立使用既有同仁專區的指定密碼／裝置短效 session；沒有 session 時導向 `home.html`，不新增帳密或裝置註冊機制。

## 資料與權限

- 作者與門市由 B owner 已驗證的現職名冊取得，不接受前端指定作者。列表只回傳隱碼姓名與可編輯旗標，不回傳員編、裝置或 session。
- 同仁可看案例並編輯自己的內容。只有既有 primary trusted 員編且正式角色為「督導」，才能編輯他人、隱藏／恢復及標記優良案例。密碼通道的裝置豁免不代表管理權限。
- 月份與進度頁月份連動。案例類型為成功成交、未成交、改善心得，情境／話術／心得必填。依更新時間由新到舊，提供門市、同仁及類型篩選。
- 使用既有私有資料夾，檔名 `north12b-tradein-sharing-YYYY-MM.json`；不更改資料夾分享設定，不使用公開 JSON 或 localStorage 儲存案例。每月最多 500 則，單月序列化上限 8,000,000 字元。
- 選填一張 PNG／JPEG／WebP，最多 800 KB；圖片只在按「查看圖片」後透過已驗證 session 讀取，不建立公開圖片網址。圖片隨案例存在私有檔案；版本檢查避免舊編輯覆寫。
- 所有寫入在既有 B owner session transaction／lock 內執行，不自動重送。新增使用穩定 UUID；連線結果不確定時先重新讀取，同 ID／舊版本再次提交會遭拒。
- 隱藏、登出、月份變更與登入到期會清除畫面內私有資料；每次回覆採用前重新核對原 session 與月份。

## 程式與發布

`gas/TradeinSharing.gs` 透過 `node scripts/build-tradein-gas.mjs` 同步至 `gas/Code.gs`。B action allowlist、session dispatch 及 body 上限另有小範圍變更：只有 `employee_tradein_sharing_save` 可接受較大的圖片 body，其餘動作維持 16,384 字元上限。

發布順序為 B owner 後端、再前端。先取得正式 owner 的最新程式及部署版本，核對分支差異；保留正式專案的 owner 設定與 release gates，勿以 repo 佔位設定覆蓋正式設定。GAS 必須發布新 Web App 版本。前端以 PR 合併後的 Pages workflow 發布。

上線需用實際同仁／督導登入驗證：新增及跨裝置讀取、只能修改本人案例、督導標記與隱藏、圖片、月份切換、登出清除，以及既有進度與匯出。另檢查桌機與手機四個頁籤及表單版面。自動測試使用合成資料，不表示已驗證正式登入、資料寫入或畫面。

回復可先還原前端 commit，再將 B owner Web App 指回原部署版本；私有分享檔保留，不刪除正式資料。

## 2026-10-19 部署核對

- 正式 B owner Script ID `17XfhB1cYOIWIyIm0_1mO1a9-ba-H4QCBJHX56bYHiEX06XSSG05FWtlg`，既有 Deployment `AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6`，由 v70 更新為 v71；URL、執行身分、存取設定不變，rollback v70。
- B owner v70 沒有舊換新進度模組；進度與管理者更新使用另一個後端。本次只將 PR 的 B allowlist／dispatch／body limit 四個差異區塊套入 fresh formal source，追加分享模組，以及原有 `tradeinPerformanceFolder_`／`tradeinPerformanceFile_` 兩個 helper。沒有整份覆蓋 repo Code.gs，也沒有部署完整進度／匯入模組至 B owner。
- 正式 owner 設定、release gates 與其餘程式保留；其他九個 GAS 檔案未變。v71 immutable 與 editor 逐位元讀回一致。正式候選覆疊測試 20/20 通過；list／detail／save／moderate 未登入請求均拒絕。
- 自動測試與上述讀回不代表正式案例新增、圖片、跨同仁／跨裝置、督導操作或實體 iPhone 驗收。Chrome 正式登入到期，仍需本人登入及另一位同仁提供各自已登入的驗收環境；不更改密碼或裝置綁定來替代。
- 原 `homepage-ui` 失敗為 generated bundle 契約漏列 `TradeinSharing.gs`，已在同一 PR 修正。Cloudflare `twm-tradein-price` build 在正式 main 也失敗，需 Cloudflare 登入才能讀取其完整日誌；GitHub Pages 發布另外核對。
