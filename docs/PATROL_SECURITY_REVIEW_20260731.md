# 督導巡店追蹤系統資安檢查報告

檢查日期：2026-07-31（Asia/Taipei）

## 結論

- 高風險：0
- 會造成資料外洩或匿名竄改的中風險：0
- 剩餘低風險：有
- 是否可部署：可以；正式 GAS 已以既有 Deployment ID 建立新版本，GitHub Pages
  僅在本報告所列本機與正式負向契約通過後才可推送。

## 已修正

1. `read/write/pread/pwrite` 不再接受 GET／JSONP；匿名請求在後端資料讀寫前即拒絕。
2. `pread` 限督導短效 session；一般員工只能讀取核准裝置與名冊所屬店別。
3. `write/pwrite` 在任何 Sheet sink 前驗證 session 與店別範圍；前端角色或姓名不作授權依據。
4. session 有效期 1,800 秒、不可寫死、不放 URL、登出後由後端 CacheService 撤銷。
5. 姓名、員編、個人回報、改善內容與私有附件不再保存於 localStorage／sessionStorage。
6. 前端受保護 POST 固定使用正式 GAS URL，不接受 localStorage 端點覆寫。
7. `PT_KEY` 只由 Apps Script Script Properties 讀取，已完成輪替；repo、測試與文件無有效明碼。
8. 改善文字輸出已 HTML escaping；七分頁資料已防試算表公式注入，附件只接受 Google Drive／Docs HTTPS 連結。
9. Playwright 已更新至無已知 npm audit 漏洞版本。

## 正式驗證

| 測試 | 結果 |
|---|---|
| 匿名 `pread/read/pwrite/write` | `status:error`, `message:unauthorized`, `code:403`，無 `data` |
| 假 token | unauthorized，無資料 |
| 模擬過期（Cache miss）token | unauthorized，無資料 |
| 督導短效 token | 建立成功，64 字元，1,800 秒 |
| 督導 `pread` | 成功，僅確認狀態與筆數，未輸出個資 |
| 登出後重用 token | unauthorized |
| 匿名寫入 Sheet | 2099 隔離標記讀回 0 筆，無測試店別、無 marker |
| `ptread/ptwrite/sread/hread/hwrite` 空白或錯誤憑證 | 全部 unauthorized |
| 本機 GAS／前端契約 | 20/20 |
| Playwright 完整回歸 | 71/71 |
| npm audit | 0 vulnerabilities |

Apps Script `ContentService` 無法自訂外層 HTTP status，所以 Web App 的傳輸層仍回 HTTP
200；應用層以 `code:403` 表示拒絕。拒絕內容只有 `status/message/code`，不含資料欄位、
筆數、店別或姓名。

## 正式版本與備份

- 主 Script ID：`1SW9qr0CU9Xvy97XkVr3n51_4Dx_6GArnTXT8780t0HofIB74v9IDMkWf`
- 巡店 Deployment：第 21 版 → 第 22 版
- 每日回報 Deployment：第 15 版 → 第 22 版
- 七分頁 Script ID：`17XfhB1cYOIWIyIm0_1mO1a9-ba-H4QCBJHX56bYHiEX06XSSG05FWtlg`
- 七分頁 Deployment：第 19 版 → 第 20 版
- 備份：`private-backups/patrol-security-predeploy-20260731004841/`
- 觸發器：`check16`、`check21`、`checkAwareAndNotify`、
  `sendWeeklyPatrolReport`；未刪除、未重建。

## 剩餘低風險

1. Script ID、Deployment ID、Sheet ID 可從公開前端或原始碼取得；端點已後端驗證，
   單獨取得 ID 無法讀寫受保護資料。
2. Git 歷史曾包含已輪替的舊通行碼。該值目前無效；本次未重寫公開 Git 歷史，
   避免破壞協作分支。
3. 開發輔助腳本仍有以本機 PAT 執行推送的舊流程文件，但 repo 未發現實際 PAT；
   本次部署不使用該流程。
4. 公里數、店到店距離與 Y2606 報銷里程維持公開，依 Liam 明確判定為可接受內容。

## 回滾

1. GitHub Pages：將 `main` revert 至部署前 commit 後推送，不執行 force-push。
2. 主 GAS：在原兩個 Deployment ID 分別選回第 21 版與第 15 版。
3. 七分頁 GAS：在原 Deployment ID 選回第 19 版。
4. 若需還原七分頁 editor HEAD，只從備份套用最小差異；不得用 repo 六分頁整份覆蓋。
5. 四個觸發器維持原狀，不重建。
