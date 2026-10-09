# 舊換新＋登入純碼交接（未部署）

WORK 整合基底：PR179 `4d9da62f62f5c3dab164cdbaf162ac0ac8180f9d`，已包含 main/PR181 `1c38ae08a2c637900c1e64b80491abf54fd2f334`。此交接 branch 從後者新建，僅提交本目錄列明的 allowlist；沒有本機登入 commit 歷史。不要將交接 branch 合併成正式發布。

## allowlist

- INTEGRATION.patch — 舊換新 UI／測試差異，只對指定 WORK 基底採用
- LOGIN-INTERFACE.md — e857c5f 最新 B/client 的去敏接口與未完成 gate
- GasBClient.js — 最新 client 原碼；不是完整 frontend shell
- owner-read-boundary.example.patch — owner-only 完整個績 read fence 示例，尚未套用
- README.md — 採用順序與狀態
- PRIVACY-REVIEW.md — 此提交逐檔檢查範圍與限制
- SHA256SUMS — 全部交接檔案 hash（不含自身）
- owner-code-20261009/ — 新增十一檔完整 A owner 套件：兩階段 patch、四個純碼模組、合成測試、採用／去敏文件与來源 manifest；不含 internal 或 ZIP

沒有上傳名冊、姓名、真實員編、個人績效、班表、真實 payload、密碼、token、salt/verifier、私有資源 ID、正式設定值、截图、輸出報表、原工作目錄或歷史 commit。

## 最小採用路徑

1. WORK owner 在自己的 fresh PR179 checkout 固定上述 head，下載 `INTEGRATION.patch`，先 `git apply --check`；head 移動則先檢查實際差異，避免覆蓋新 WORK／登入改動。此 task 已在獨立本機 checkout 完成套用，不需 WORK 讀本機絕對路徑。
2. patch 直接呈現手機價／舊換新回收價／個人績效，首頁與 APP 名稱一致，PR181 測試入口保持移除。價格 parser／來源 API／payload／管理快速上傳未改；新 B 不是公開查价依賴。
3. 公開價 UI 與原合法個績界線可先本機驗，不等待尚未正式啟用的 B。個績仍沿用 PR179 的合法權限；正式資料正向串接未驗時維持鎖定並列 blocker，不造數據。
4. 本輪範圍 Node 195 項：194 通過、1 跳過、0 失敗；跳過項需另外提供批准的完整來源快照。Chromium 126 個案例完成驗證：第一輪 125 通過、1 個舊頁籤狀態假設失敗，修正為跨頁後重新選卡片，該檔 9/9 重驗通過；分區 4/4（1280／390／320px）及合成個績 6/6（含實際 PNG/XLSX 下載）最後重驗通過。正式公開價格唯讀補驗：手機 14,976 筆／回收 620 筆、日期 2026-10-01，版本與來源 SHA 均與現行站相同；快速上傳登入頁可進入，未登入或上傳。所有個績 fixtures 僅合成，不能把本機通過寫成正式績效已驗收。
5. LOGIN-INTERFACE.md 與 [完整 owner 套件](owner-code-20261009/README.md) 分別審查。公開 base 依序套 01-native-owner-foundation.patch、02-work-full-read-fence.patch；完整 helper/store/provider 已帶全。舊 owner-read-boundary.example.patch 只留歷史參照，不能獨立使用或再疊到新套件。既有 owner 已有完整 foundation 者，只按 fresh 函式差異採用 read fence；不能把舊 GAS 全檔覆蓋 editor。
6. 本次只批准公開交接，未批准 merge、GAS/Pages 部署、真實 roster/grant/Properties 改動或私人資料公開。正式發布須以最終 source/hash、驗收／資料映射與回復點另確認；先完成公開價格的所有可行驗收，再精確列個績／登入 blocker。

31/32 個目標同仁分母、九店員編／職務映射與正式跨月取消樣本仍依 WORK 的私有來源證據核實；本目錄不提供真實名冊，沒有把候選 96 台或來源缺漏猜成正式月目標。

## patch 完整性與 CI

整合 patch 共 15 檔：首頁／APP／兩查價 HTML／共用 controller／分區 CSS／個績 HTML、七個測試檔及既有 homepage-ui workflow。已在乾淨 PR179 4d9da62 checkout 通過 `git apply --check`，套用後逐檔 bytes 與驗收候選完全一致。`tradein-progress.mjs`、績效／匯出計算、價格 parser／transport、GAS 個績與快速上傳、home.js 均逐檔比對未更動。價格狀態提示僅呈現當前查價類別，原两類 API read 與 payload 保留。

workflow 已備好分區／查價回歸 gate，但交接 branch 只存 patch，未套用 runtime；本次沒有把交接分支 CI 當成候選已執行 CI。WORK 採用後須對它最終實際 head 重新跑正常 CI。頁面保留「整合候選 · 尚未上線」供 review，正式切換需另核准並移除標記。不要把 archive dryrun 或另一登入 task 的正式改動帶入此包。

## 新增後端純碼交接（2026-10-09）

主線轉交使用者的明確 `ok`，批准逐檔去敏後將新增後端與權限驗證碼公開到同一交接分支，仍未批准 merge／正式部署。新套件採可公開取得的 PR179 `4d9da62`，不依賴本機 commit；文件給出套用順序及相對該 base 的兩份 patch。

UI owner 獨立在乾淨公開 base 重做兩階段 apply check，套用後完整 GS SHA-256 `2a74d015e527247950a0a9b14bf5dfef205bfafa192764623edc86a9a5001e43`；GS 語法、21 個新增必要 helper 存在、四個模組僅內嵌一次、26 個 helper 呼叫的依賴閉合均通過，沒有新增重複函式。16/16 合成測試另行重跑通過；兩個 WORK business body 字元保留，鎖涵蓋完整 read/projection。新增套件逐檔人工與掃描無阻擋；收據、實測資料、設定值、完整 GS 與 Git 歷史均沒有公開。

此套件提供 owner-local 的原 A 權限與 read fence。B 密碼後端／整套 frontend shell不在此包，B 仍不提供 WORK 權限、未正式啟用。peer WORK 需要另定完整 owner-executed read operation，不能只回 authorizer 後在 peer 讀私有 registry。正式 native state、其他專案 writer inventory、資料映射、grant／部署／runtime 正反向與回復 gate 仍待核，不能把本機通過當正式全過。
