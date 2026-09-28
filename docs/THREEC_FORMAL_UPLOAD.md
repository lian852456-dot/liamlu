# 3C／舊換新正式上傳

正式入口為智慧營運中心的「資料快速上傳」，沿用既有可登入的 Apps Script 上傳 Deployment。

## 操作

1. 登入後，在「3C／舊換新資料更新」選擇來源 Excel。
2. 按解析，核對檔名版本日期、正式筆數、排除數／衝突數與來源 SHA-256。
3. 勾選核對確認，再按「確認發布私有快照」。只有通過後端授權及資料檢查的標準化 JSON 會寫入私有資料庫。
4. 同日期且來源雜湊相同不重複寫入；同日期且雜湊不同需要第二次明確確認。較舊來源日期不能覆蓋 active。
5. 回復上一版只交換該類資料的 active／previous 指標。

原始 Excel 在瀏覽器記憶體解析，不寫入 GitHub 或 Drive。換檔即清除預覽與確認；解析中的舊結果不能成為新檔預覽。發布與回復期間會鎖住相關控制項。

## 私有儲存

`THREEC_PRIVATE_FOLDER_ID` 僅由 Apps Script 的 Script Property 提供。後端須驗證資料夾名稱為「3C／舊換新資料庫（私有）」及分享狀態為 PRIVATE；讀回檔案必須屬於此資料夾。

不可變快照與不可變 registry 均完成讀回及雜湊驗證後，才更新 `THREEC_REGISTRY_FILE_ID`。發布失敗時既有 active 保留，孤立未啟用檔案不會被當成正式版本。

已知首版 `2026-09-22` 的 3C 要求 2031 筆、排除 50 筆全空價格；`2026-09-16` 的舊換新要求 496 組、0 報價衝突。後續來源日期依當次有效資料筆數驗證，不沿用首版固定筆數。零元有效；舊換新保留兩家回收商及 S／A／B／C，缺價維持空值。

## 部署範圍

本次以正式上傳 Deployment v70 的完整原始碼為基底，保留既有 KPI、台獎雙檔測試上傳、其他後端及 manifest；只追加 3C 儲存模組與解析器，並在同一份 ReportUpload 頁加入 3C 操作。沒有變更既有白名單、管理者驗證或 OAuth 權限。

`gas/ReportUpload.html` 保存與此次正式上傳頁相同的介面。共用 `gas/Code.gs` 的 3C 模組與正式上傳專案保持相同契約；不得用共用大檔整檔取代正式上傳專案最新版本。

部署後分別核對線上 UI、私有 registry 讀回及使用者實際選檔。資料夾已指定，但 registry 在第一次確認發布時才建立；啟用上傳不代表價格資料已發布或完成手機驗收。

## 2026-09-28 交接證據

- Repo：`lian852456-dot/liamlu`；feature branch：`feat/threec-formal-upload-20260928`，基底 `aef43bf`。未合併 main、未 force push 或改寫 Work 歷史。
- 正式快速上傳沿用原 Deployment，現為 Apps Script **v72**；其他既有部署維持 HEAD／v67／v44。
- v71 線上讀回發現 raw JavaScript 被 HtmlService 當成 HTML 解析而拒絕；立即回復 v70，修正 include 後才部署 v72。依 [HtmlTemplate 官方 API](https://developers.google.com/apps-script/reference/html/html-template#getRawContent()) 使用 `getRawContent()`，並轉義 literal control characters，保留原解析器資產不變。
- v72 不可變原始碼重新 clone 讀回：9 個檔案與驗證過的部署來源逐一相同。完整舊程式碼仍為 v70 原始碼前綴；manifest、稽核與 HalfMedia 輔助檔均未變。
- v72 `程式碼.js` SHA-256：`c01b7d8e7e144f7753ae125980a25f711b92aad9d1621928b269db3ecee2415e`。
- 正式 `ReportUpload.html` SHA-256：`7821d18831b2e455f2696a9417825f58bb765ddbf33272cf0e1044cb3c1d58b7`，與 repo 頁面一致。
- 相關 Node 測試 **108/108 PASS**；瀏覽器 **43/43 PASS**，含真實 SheetJS／Work 解析器載入、中文 XLSX roundtrip、明確確認、換檔清除、過期解析隔離及同日期第二次確認。廣泛 Node baseline 的 20 個既有失敗未擴及修正，不宣稱全套測試通過。
- 正式 `/exec` 讀回啟用標記；兩個 file input 的 disabled 均為 false。此證據是在登入前檢查 DOM，不替代登入後實際選檔驗收。
- 私有資料夾 property 已保存並讀回匹配；Drive 重新列舉仍為空，未建立價格快照／registry、未上傳原始 Excel。登入後後端狀態與首筆真實發布讀回仍待本人操作。

後續請登入後選檔並解析，核對日期及筆數，再自行明確確認發布；第一筆成功發布後再核對 active／previous 與私有快照讀回。不得把上傳已啟用寫成價格資料已發布。
