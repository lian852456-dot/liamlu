# 跨區免登入舊機回收價：獨立網域發布規範

## 授權與目標
- 2026-10-12 使用者確認：主管允許門市同仁透過「免登入」連結查正式回收價。
- **最重要的驗收條件：不能透過這個連結導覽到北一二B營運中心，也不能共用營運中心的網站 Origin、登入資料、私人程式檔案或路由。**
- 與原 `liamlu` GitHub 專案維持一份來源程式，在此管理 PR、差異和測試；公開部署到**另一個獨立網域的獨立靜態網站**，僅發布三個純查價檔案。

## 為什麼不能直接用同一個 GitHub Pages 站
同 GitHub 帳號的兩個專案 Pages 預設可能共用 `https://<owner>.github.io` 主機名稱，甚至網站同源 LocalStorage，雖然路徑不同，但只是隱藏管理入口，不是真正隔離。**禁止把 `liamlu` 原站的 `/tradein-price-share.html` 當作對外正式共用網址。**
建議另建 Vercel 靜態專案，使用其專屬 `*.vercel.app` 網域（或其他真正獨立的網域），且只部署以下三個檔案：
- `index.html`
- `style.css`
- `app.js`

執行 `node scripts/build-tradein-share.mjs` 產出 `dist/tradein-price-share`。CI 也驗證公開成品只有這三檔，沒有跨到 `home.html`、`tradein-progress.html`、管理腳本的依賴，沒有回管理端的連結。

## 權限與上傳維持原系統
- **主管本機上傳完全保留**：北一二B營運中心 → 督導專區 → 資料快速上傳；沿用原 GAS 管理者驗證、Excel 本機選檔、解析、差異預覽、確認發布、正式 active 回讀與版本回復。
- **公開查價唯讀**：只允許 `threec_snapshot_read`、`kind:'tradein'`、`includeChanges:false`；不查手機專案／3C、區店個人目標、保險、KPI、台獎、異動資料；不帶員編、裝置 ID、密碼，也不儲存 LocalStorage 或 SessionStorage。
- 兩端共用正式價格 active，主管更新一次即可；公開查價頁每次開啟或按重新讀取即重新向既有後端抓取價格，不另建一份資料庫。
- 回收商與 S/A/B/C（及來源未分級）只呈現確實有報價的值，0 元與缺價嚴格區別。讀取失敗或快照異常要清空結果。

## 建議 Vercel 部署設定
在 Vercel 建立新 Project，選取已授權 GitHub 倉庫 `lian852456-dot/liamlu`：
- Framework Preset: Other
- Root Directory: `./`
- Production Branch: 先用經審核的獨立版本／分支；正式可維護時再選定來源
- Build Command: `node scripts/build-tradein-share.mjs`
- Output Directory: `dist/tradein-price-share`
- 不需要管理員密碼或任何後端環境變數。
- 務必只發出 Build Output 的靜態三檔；Vercel 專案不可用完整 `liamlu` 來源根目錄作為公開靜態目錄。

驗收網址須使用 Vercel 專屬站點，不得和北一二B營運中心同主機名稱或同 origin。確認以下查詢情境：
1. 共用網址根目錄即查價、免登入，搜尋品牌／機款／容量及篩選回收商／SABC 等級正常。
2. 共用站的 `/home.html`、`/index.html`（前者不得存在，後者為查價首頁）、`/patrol.html`、`/tradein-progress.html`、`/gas/Code.gs`、`/assets` 不能提供北一二B頁面／私人程式；只有 `/index.html`、`/style.css`、`/app.js`。
3. 測試兩站 `location.origin` 不相同，獨立站不讀寫內部 LocalStorage／SessionStorage，不載入登入／管理頁。
4. Chrome 桌機及至少一支門市手機驗證正式回收價來源日期、機款、SABC 等級、不同回收商獨立報價。
5. 主管維持在原有 GAS 本機上傳頁做一次合法價格更新驗證，共用站重新整理讀到同一正式版；權限、回復功能不受影響。
6. 假資料或連線中斷時不繼續顯示舊價格。

## 安全邊界說明
獨立網域加純靜態部署，可以確保此**共用站點**沒有內部營運中心頁面或導覽途徑、不能沿用原站的網站儲存狀態。但使用者若另外已知道 `liamlu` 原公開站網址，仍可能自行開啟原站的公開首頁；因此原站的私有數據及管理寫入仍必須由原 GAS 在伺服器端驗證，不可單靠前端隱藏按鈕、難猜網址或 noindex 作權限保護。

## Release gate & 回復
- 新版仍是 PR #221 的候選，GitHub 自動測試通過不等於部署成功；原站的 main、後端 GAS 和管理者驗證均不更動。
- 只在取得獨立 Vercel 部署專案後開放共用網址。發布後分別驗證 isolated origin、404 路由、唯讀 API、手機操作及主管本機更新回讀。
- 若發現共用頁可導到或露出原營運中心，立即停止分享並回退獨立站部署；原管理端的 GAS 及價格資料不必回復。
