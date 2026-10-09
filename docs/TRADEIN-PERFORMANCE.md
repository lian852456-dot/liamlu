# 個人舊換新月進度

延續原任務 `01a11491-a27a-77f6-84af-a7347684f024` 的原型、視覺排版與複製／PNG／Excel 匯出。候選入口為 `tradein-progress.html`；首頁同仁大廳與 APP「我的」提供連結。

## 已核定口徑與待核實項目

- 每位有目標同仁每個日曆月3台；副店長、資深業務代表列同仁。店長、代理店長目標及尚缺為 null，保留實績。
- SAR74 單銷、RT、AQNP 均計入。每個回收碼計1台，同碼去重；同張銷貨單不同回收碼分別計數。衝突資料拒絕整批。
- 正式員編映射尚未核實。PR179 原候選以來源員編前加55計算，這是未核實的實作假設，不能作為正式映射規則或上線依據；目前仍阻擋發布，待取得權威對照後替換。不得以尾碼或姓名模糊比對代替正式確認。未知員編或跨店不符保留門市台數、列人員待核；不歸給其他人。
- 已取消交易排除，跨月取消回沖原成交月。歷史月重傳原月完整報表後更新原月，當月不另扣。
- 來源必須自選定月1日起且涵蓋完整九店、所有人員與專案。上傳者須明確勾選完整範圍；僅符合格式並不足以證明完整範圍。
- 報表查詢截止為日期精度，不聲稱當日終日。取消核對日期另採列印日，介面、提醒與Excel均標示。
- 已核完整涵蓋且無有效回收才是0。來源缺漏、身份衝突、職務未知或未發布月份保留未知；超標不抵其他人尚缺。

| SAR74店碼 | 店點 |
| --- | --- |
| DNB10062 | 酒泉 |
| DNB10082 | 永吉 |
| DNB10094 | 復興南 |
| DNB10146 | 杭州南 |
| DNB10168 | 萬大 |
| DNB10059 | 通化 |
| DNB10284 | 大稻埕 |
| DNB10307 | 三創 |
| DNB10440 | 六張犁 |

此表僅用於SAR74，不覆蓋其他模組的門市ID。

## 私有資料與登入

`tradein_performance_read` 已依 owner 公開交接的 01／02 修補接入完整讀取 fence；不疊加舊 example。`tradeinPerformanceAuthorize_` 與完整 `tradeinPerformanceRead` 共用 host-only `privateDashboardTradeinReadBoundary_`，capture／commit 重驗 native generation、pending／deny 及撤銷，commit 持有同一可重入 ScriptLock 至 registry、snapshot、roster hash、投影與回應完成。release gate 仍為 false，正式環境尚未啟用此 fence；本機合成驗證不能代替正式驗收。

一般同仁、店長與代理仍只回傳本人；只有原 A trusted 身份且名冊職務為督導者才回傳九店。原核准裝置規則保持，前端 role 或範圍不能擴權。未引入 B 登入、bearer proof、WORK RPC、peer transport 或自動 state 初始化。此交接只支援 WORK 與 auth owner 在同一 GAS 專案；peer 執行完整 read 或 raw roster 在 gate 啟用後拒絕。

讀取投影不包含員編、回收碼、銷貨單號、顧客資訊、來源檔案或私有Drive識別。正式資料不提交GitHub，不保存localStorage／IndexedDB；只沿用既有員編及裝置識別，登出／頁面離開清除本頁資料與匯出預覽。

`tradein_performance_preview`／`publish`／`rollback` 沿用既有 `reportUploadAuthorize_` 管理者密碼及員編白名單。CSV在瀏覽器解析，只送計數所需欄位至既有私有API；原始顧客欄位不傳送。密碼只留記憶體，預覽失敗、發布後或登出清除。

私有資料使用既有 `DASHBOARD_PRIVATE_FOLDER_ID`，獨立 `north12b-tradein-performance-registry.json`。只保存遮罩的人員月彙總與九店彙總，原交易識別僅用於當次計算、不寫入快照。資料夾必須PRIVATE／NONE；讀回快照須屬於此資料夾且雜湊相符。

本月名冊異動時暫停讀取，要求管理者重傳完整來源並重新預覽。歷史月凍結已核名冊，避免現在的人員異動改寫歷史目標；沒有舊月名冊基線時不以現在名冊回填。

## 更新與回復

1. 已登入督導選SAR74、勾選完整九店範圍並輸入既有管理者密碼。
2. 預覽核對來源期間、取消日期、已對應／待核、重複、取消與目標台數。
3. 確認同步：後端重新計算並核對名冊、預覽雜湊及原active版本。保存新快照、驗證讀回後切換該月active；完整同月取代，不累加。同來源同結果為no-op。
4. 回復只交換該月active／previous，核對預期版本與保存後回讀。歷史檔案保留，其他月份不變；不自動重送寫入。

跨月沖回须重新匯出原成交月完整九店SAR74。若來源未包含已取消交易狀態，本系統不能從其他月份猜測取消。

## 部署與驗收狀態（2026-10-08候選）

基準主分支 `b172872457878cd27e5240c54c240e14b3f5cb4d`。正式GAS與Pages尚未部署；沒有寫入正式快照或修改登入名冊。

- 受影響Node契約／權限／發布／既有查價及登入重試測試：59/59通過。
- JavaScript、整合Code.gs語法、模組重建冪等、`git diff --check`：通過。
- 擴大檢查 `private-dashboard-publish` 有7項失敗，未修改主分支以同測試重現相同7項（缺少harness函式），屬既有基準失敗。
- 原候選對照115/10/01–115/10/07九店SAR74與登入名冊，算得總15台、候選對應14台、待核1台；31位目標同仁共93台、候選逐人尚缺80台、6店有實績。因名冊與映射尚未核實，這些個人對應、分母及缺口不能標為正式核定值。真實員工、交易與來源原檔未提交repo。
- 跨月取消使用合成資料契約驗證；現有正式SAR74沒有取消列，尚未完成正式取消樣本驗收。
- 畫面／剪貼簿／PNG／Excel下載實際瀏覽器驗收尚未完成：雲端瀏覽器不能連線scratch HTTP預覽，安全政策禁止開啟本機檔案。
- 正式GAS專案尚無登入，部署及正式登入正向讀取未驗證。

正式採用前先備份當下 GAS editor 與部署版本，核對 owner runtime、既有 native writers、已批准持久 state 及最新函式差異，再採用本候選增量；禁止以 repo 全檔覆蓋正式 editor。01 另含 durable revoke／restore 與 restore action，須列入批准範圍，不能稱作只有個績 UI wrapper。`gas/Code.gs` 已內嵌核心、API 及 owner 模組，不再重複貼入 `gas/TradeinPerformance.gs` 或交接 `modules/`。正式 gate／state／部署及權限須完成驗收後由 Liam 確認，本次不執行。

首次正式同步須先核實名冊生效日、員編映射及台數，不能以先前候選對應數字作為驗收基準，再由既有管理入口發布、讀回版本及逐值比對。完成督導九店、一般同仁本人、店長／代理免目標、未核准裝置拒絕、未知月份、登出清除、複製、PNG與Excel，以及可用的正式取消樣本後，才可列正式驗收完成。

## 2026-10-08 接續整合查核

PR179 接續分支已合併 `main` 的 `1c38ae08a2c637900c1e64b80491abf54fd2f334`，保留 PR181 移除首頁測試入口的結果；測試頁、共用解析器與快速上傳均保留。首頁契約逐一核對現有連結，加入 PR179 個績入口並移除測試入口，不以未更新的舊卡片數通過 CI。這是現有畫面查核，尚非未取得 UI patch 的最終畫面。

候選取得狀態：

- UI 任務 `01a11abf-eeb9-77e6-a495-7aafd90ca0ca`：未取得 `integration-candidate.patch`、其整合方案與基準 commit；可讀檔案只有較早的原型方案，不能視為這項候選。未重製 UI 原型，入口改名與實際查價畫面整合仍待該交接。
- 登入任務 `01a11a84-0e71-753e-b161-0342656790cb`：本機 `468f3f2` 尚無可讀 GitHub commit；缺 owner 的完整介面契約、示例 patch 與可取得分支／bundle。未修改正式登入、權限或功能開關。

名冊來源已辨識為 Drive 的 `1008.xlsx`，2026-10-08 01:28:36 UTC 上傳，`上線數KPI_個人達成率_明細` 查詢期間為 2026-10-01–2026-10-07。檔案 SHA-256 `03be5744760e115e5ca3be4bd5d5c20bba3fa42da6cb9df32efc64f97df9ef12`。與 PR179 先前私下取得的登入名冊對照如下；公開文件不記錄員編或人名。

| 來源 | 九店人數 | 店長 | 代理店長 | 目標同仁候選 | 候選月目標 |
| --- | ---: | ---: | ---: | ---: | ---: |
| PR179 先前取得的 active 登入名冊 | 40 | 8 | 1 | 31 | 93 |
| 10/8 業績報表（截至 10/7） | 41 | 7 | 2 | 32 | 96 |

差異不是單純增加一人：杭州南、六張犁各有一人未列先前登入名冊；通化一人列登入名冊但未列當日 KPI；一人由杭州南業務代表改列大稻埕代理，一人由大稻埕店長改列三創資深業務代表。三創完整名稱與簡稱已用現有 storeName 正規化核對，不能將完整名稱誤當九店以外排除。程式本次補上資深業務代表的同仁分類，並用合成資料驗證每月3台；未將正式人員名單寫入 GitHub 或變更登入名冊。

兩份名冊的生效日、調店歸屬及正式員編映射仍須由權威來源確認。96台只代表該 KPI 名單套用已核目標規則的候選分母；不得直接替換為正式月目標。原 SAR74 沒有取消列，正式取消／跨月沖回樣本仍缺；合成取消測試不代表正式驗收。

快速上傳的入口、API、payload、價格資料、權限規則未因本次查核修改。尚未取得新查價位置，因此「更新後新舊位置讀到同一版本」仍未驗證，不能以舊查價回歸或入口測試代替。

本次接續查核驗證：170項 Node 契約／回歸測試，169通過、1略過、0失敗；略過的是未設定正式大型價格快照路徑的 transport 體積比較，不能列為正式價格驗收。首頁、既有查價／搜尋／分頁 Chromium 測試74項通過；沿用個績的合成 API 投影測試6項通過，包含1280px／390px無水平溢出、本人匯出限制、店長與代理實績免目標、九店督導篩選、未知月份清空與被拒讀取維持鎖定。PNG／XLSX 實際下載成功；合成 Excel 另以獨立讀取器確認實績1／目標3／尚缺2為數字且未含員編，手機／桌面與PNG已視覺檢查。剪貼簿只驗證拒絕時的手動複製退路，尚未驗證正常複製；未驗證 Safari／實機、登入候選 pending／deny／撤銷的後端行為或正式資料正向讀取。新增合成個績測試已接入現有首頁 CI，所有外部 browser request 均攔截，不發正式登入或資料寫入。

正式發布候選範圍仍待完成：首頁／APP／查價入口、共用回收價 view、個績前端與 GAS 增量模組；登入契約接線、名冊／映射與取消樣本核實均是發布前阻擋。完成後須列出精確 Pages commit、GAS 新舊版本及回復點，由 Liam 確認正式發布與任何登入權限變更。本次只有 PR 候選更新，沒有正式發布或資料寫入。

## 2026-10-09 owner 01／02 接續

已取得 [owner 公開交接 README](https://github.com/lian852456-dot/liamlu/blob/7373d7deb2bb8556b6efd2f41ec833f4930874ff/handoff/tradein-login-20261008/owner-code-20261009/README.md) 與同目錄完整 allowlist，SHA256SUMS 十項均吻合。最新 main 仍為 `1c38ae0`，PR179 基準為 `4d9da62`，交接指定 `gas/Code.gs` base SHA-256 `52e79ab8c25ed3ec9d1e51695aa9ef6140fdb93daac31d942bd1d4a8b0225aeb` 完全吻合。依序 check／套用 01 foundation、02 full read fence；未套用上層 INTEGRATION.patch 或 owner-read-boundary.example.patch，也未重貼模組。

| 階段 | Code.gs SHA-256 |
| --- | --- |
| 01 套用後 | `ace0ff55d51d26d7367f6ec6c6944037bc3abc9319443cbbd3bbb2413dfb9479` |
| 02 套用後及同步生成來源後 | `2a74d015e527247950a0a9b14bf5dfef205bfafa192764623edc86a9a5001e43` |

兩階段均與 owner SOURCE-MANIFEST 一致。`gas/TradeinPerformance.gs` 同步兩個 wrapper；執行 `scripts/build-tradein-gas.mjs` 後 bytes／hash 不變，未改 business body。新增 `tests/tradein-owner-fence.test.cjs` 沿用 owner 原附 16 項，僅增加預設本 checkout 路徑及七項整合檢查：生成來源／唯一函式、restore 後重核裝置、同步／setup 不清除 revoked、重複名冊在寫入前拒絕、capture 後 pending／deny、格式或 owner 不符 state 不重設。舊個績與手機庫存測試載入實際 gate-off boundary，未以 mock 跳過新 wrapper。CI 已加入 GAS 語法、owner fence、手機庫存與查價後端回歸。

本輪 Node 217項：216通過、1略過、0失敗；略過仍為缺少正式大型價格快照的體積比較。另擴查發布／上傳契約86項，78通過、8失敗；在未修改 `4d9da62` 乾淨基準重現完全相同八項：七項 private-dashboard 發布 harness 缺 `privateDashboardLatestSnapshotFile_`，一項 report-upload 路由預期漏既有 `threec_changes_read`。保留證據，不改無關程式或放寬測試。這些既有失敗未列為通過。手機／桌面、本人／免目標／九店與 PNG／XLSX 沿用合成瀏覽器回歸，不代表正式 GAS 正向登入。

登入 owner 介面與可執行依賴已取得，10/8 的「缺 owner patch」阻擋已解除；以下仍阻擋正式啟用：同一實際 owner 部署位置、`DASHBOARD_AUTH_OWNER_SCRIPT_ID` 核對、經批准的 `DASHBOARD_AUTH_NATIVE_V1` 與既有 generation／pending／deny 保存、所有會寫 Users／Requests 的專案盤點、owner runtime 正反向與失敗恢復、最終 editor source hash。不得初始化／清空 state 或自行把 gate 改為 true。新增 restore action 仍須明確批准；B 權限沒有擴張。

UI 任務 integration-candidate.patch 仍未取得；首頁／APP 改名、實際新回收查價 view 及價格更新後新舊位置同版本尚未完成。名冊生效日、正式員編映射及取消／跨月沖回實例仍待核實。上述 owner 純碼包未提供這些資料，不以 auth 修補視為整個儀表板已完成或上線。

程式回復為 GAS 切回發布前版本、Pages 回復發布前 commit；資料回復使用選定月前一版，不刪除資料檔案。gate 啟用後的 auth state 必須保留 deny／generation，失敗恢復不能清空資格狀態。正式發布時補記 GAS 版本、Pages commit、state 恢復計畫及線上驗證證據。
