# 督導到店檢查 HTML 唯讀匯出

`patrol.html` 的到店檢查頁新增匯出月份、門市與「匯出 HTML 唯讀儀表板（含照片）」。資料僅取雲端已儲存的督導檢查；不包含本機草稿，不改寫 Sheet、照片或分享權限。

檔案提供整體／各店概況、門市及結果篩選、關鍵字、逐題結果、缺失與改善說明、照片放大、展開／收合與列印。2026/09 起每次 9 題，較早日期每次 18 題；已建立檢查的缺題以待填表示，無紀錄門市明示無紀錄。改善說明不代表複查結案。

## 匯出契約

- `half_export_snapshot`：POST，沿既有短效巡店 session 驗證；伺服器只允許目前 `PT_STORES`，先按月份與所選店點裁切再投影欄位。現行巡店 session 是督導共用的全九店授權，沒有另行發明角色或擴張帳號權限。
- `half_export_photo`：POST，每張重新驗證 session、範圍及 snapshot revision。必須是已儲存題目所引用的附件，且檔案位於現行 `HALF_MEDIA_FOLDER_ID` 子樹；拒絕任意 Drive ID、跨店、跨月及垃圾桶附件。讀取不建立資料夾、不調整分享權限。
- 匯出前後比對 revision；任一張照片失敗、資料改變或登入狀態改變就停止下載，不產出看似完整的檔案。只讀請求沿用既有有限重試。
- 支援 JPEG、PNG、WebP、GIF 原圖；其他照片格式若 Drive 有可用縮圖則內嵌縮圖，否則要求改為 JPG／PNG。單張上限 25 MiB、內嵌 data URL 總長上限 80 MiB，超量請分店匯出。影片及其他附件保留私有連結並標明需網路與權限。
- HTML 只含展示欄位、內嵌樣式及唯讀互動，不包含 token、密碼、GAS URL、原始回應及圖片 Drive ID；照片直接內嵌為 data URL。CSP 阻擋連線、表單、iframe 與外部資源。持有檔案即可查看，這是離線快照，無法撤回，也不會自動更新。

## 部署與驗收

1. 先執行 `node scripts/build-patrol-gas-bundle.mjs` 產生獨立 Patrol bundle。加入 `patrol-gas/PatrolInspectionExport.gs`，並同步該目錄的 `PatrolCode.gs` 至**既有正式 Patrol Apps Script 專案**。不更換部署網址、Script Properties 或 audience；不部署至 Audit、KPI 或回報服務。
2. 更新現有 Patrol Web App 的部署版本；只儲存原始碼不足以生效。確認未登入不能呼叫兩個新 route。
3. 正式部署成功後發布前端 `patrol.html` 與 `patrol-inspection-export.js`。若後端仍為舊版本，前端會顯示尚未部署訊息而停止匯出，不退回快取或未驗證資料。
4. 使用既有督導登入，挑選月份與單店，核對雲端紀錄、題數與照片；再測全店。下載後離線開啟，檢查篩選、照片放大及列印，確認沒有對 GAS 的請求。
5. 回復方式：前端回到部署前 commit，正式 GAS 部署切回原版本；新 route 無資料寫入，不需重建或刪除正式資料。

自動驗證：`node --test tests/patrol-inspection-export.test.cjs tests/patrol-gas-isolation.test.cjs tests/patrol-gas-auth-contract.test.cjs tests/patrol-gas-dependency-closure.test.cjs`。

合成示範檔、照片及真實資料驗收輸出只留 repo 外，不提交至 GitHub Pages。
