# 舊換新＋登入純碼交接（未部署）

WORK 整合基底：PR179 `4d9da62f62f5c3dab164cdbaf162ac0ac8180f9d`，已包含 main/PR181 `1c38ae08a2c637900c1e64b80491abf54fd2f334`。此交接 branch 從後者新建，僅提交本目錄 allowlist；沒有本機登入 commit 歷史。不要將交接 branch 合併成正式發布。

## allowlist

- INTEGRATION.patch — 舊換新 UI／測試差異，只對指定 WORK 基底採用
- LOGIN-INTERFACE.md — e857c5f 最新 B/client 的去敏接口與未完成 gate
- GasBClient.js — 最新 client 原碼；不是完整 frontend shell
- owner-read-boundary.example.patch — owner-only 完整個績 read fence 示例，尚未套用
- README.md — 採用順序與狀態
- PRIVACY-REVIEW.md — 此提交逐檔檢查範圍與限制
- SHA256SUMS — 上述檔案 hash（不含自身）

沒有上傳名冊、姓名、真實員編、個人績效、班表、真實 payload、密碼、token、salt/verifier、私有資源 ID、正式設定值、截图、輸出報表、原工作目錄或歷史 commit。

## 最小採用路徑

1. WORK owner 在自己的 fresh PR179 checkout 固定上述 head，下載 `INTEGRATION.patch`，先 `git apply --check`；head 移動則先檢查實際差異，避免覆蓋新 WORK／登入改動。此 task 已在獨立本機 checkout 完成套用，不需 WORK 讀本機絕對路徑。
2. patch 直接呈現手機價／舊換新回收價／個人績效，首頁與 APP 名稱一致，PR181 測試入口保持移除。價格 parser／來源 API／payload／管理快速上傳未改；新 B 不是公開查价依賴。
3. 公開價 UI 與原合法個績界線可先本機驗，不等待尚未正式啟用的 B。個績仍沿用 PR179 的合法權限；正式資料正向串接未驗時維持鎖定並列 blocker，不造數據。
4. 先跑首頁／價格／WORK Node 契約，再跑首頁、價格、分區與合成個績 Chromium 桌面/手機／匯出。初版交接 Node 71/71 已通過；本輪完整 browser／live read 補驗還在進行，後續會更新驗證結果與 patch。所有 fixtures 僅合成，不能把本機通過寫成正式績效已驗收。
5. LOGIN-INTERFACE.md 与 owner 示例獨立審查。只把必要 helper/read fence 增量納入 fresh owner；不能把舊 GAS 全檔覆蓋 editor，也不能將 B 當新 WORK 授權。
6. 本次只批准公開交接，未批准 merge、GAS/Pages 部署、真實 roster/grant/Properties 改動或私人資料公開。正式發布須以最終 source/hash、驗收／資料映射與回復點另確認；先完成公開價格的所有可行驗收，再精確列個績／登入 blocker。

31/32 個目標同仁分母、九店員編／職務映射與正式跨月取消樣本仍依 WORK 的私有來源證據核實；本目錄不提供真實名冊，沒有把候選 96 台或來源缺漏猜成正式月目標。
