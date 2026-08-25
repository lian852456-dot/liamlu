# Patrol 正式頁本機選檔入口（2026-08-25）

## 狀態

- 分支：`feature/patrol-local-file-import-20260825`
- Base：`origin/main` `bda6e4af93df34ce172954fc4de7a5682917bec5`
- 僅為 Draft PR 候選；未合併、未部署、未執行正式 GAS 寫入／readback、未完成 Liam UAT。
- PR #95 的督導 Lite 版維持暫停；最新 `main` 既有的 standalone import 檔案也未搬入或改寫正式 `patrol.html` 流程。

## 最小變更

- `patrol.html` 的既有「貼上巡店紀錄」區塊只增加選檔按鈕、隱藏 file input、解析狀態與兩個本機 script 引用。
- `patrol-local-import.js` 僅在瀏覽器記憶體解析 `.xlsx`、`.xls`、`.csv`、`.tsv`，輸出既有十二欄資料列。
- SheetJS `0.18.5` 固定版本存於 `assets/vendor/`，附 Apache-2.0 License；runtime 不載入第三方 CDN。
- 本機解析通過後，沿用既有 `patrolServerPreflight`、`pendingPatrolWrite`、`cloudWrite`／`ptwrite`、`ptdetail` readback、`cloudLoad` 與 `MI.open`。未建立第二套雲端寫入、去重或 readback route。
- 原貼上、JSON 匯入／匯出、看板、里程、登入與 Session 邏輯保留。

## Fail-closed 規則

- 必須找到完整正式表頭；填表時間、非空到／離店時間必須可解析，題號限 1–33，店點不可空白。
- 唯一鍵沿用正式前端 canonical key：`fillTime + store + item`。
- 檔內同鍵同內容只保留一筆；同鍵異內容整批封鎖。
- 必須完成既有 `ptdetail` Server Preflight；雲端同鍵異內容整批封鎖。
- 使用者確認前不呼叫 `ptwrite`；readback 失敗時保留檔案、pending 與重試按鈕，不修改 `rawDetails`。

## 驗證紀錄

- Patrol Node parser／contract／auth／read-model／里程：`91/91` 通過。
- 正式 `patrol.html` + auth Chromium（單 worker）：`79/79` 通過。
- 本機選檔 Chromium：`6/6` 通過。
- 本機選檔 WebKit（含 390×844）：`6/6` 通過。
- 全站 Chromium：`184/191`；其中本分支造成的原貼上文案回歸已修正並重跑通過。剩餘 6 案位於本分支零 diff 的 Supervisor App 班表／半月正式讀取範圍，序列重跑仍為既有失敗，不在本 Draft PR 修改。

## 明確零變更

`patrol-gas/PatrolCode.gs`、`gas/Code.gs`、`patrol-read-model.js`、GAS route／部署、Sheet schema、auth／session／token／TTL／通行碼、看板判定、里程模組與距離表、班表、半月檢查、大盤、媒體、稽核、JSON 儲存格式、localStorage key、頁籤順序與登入流程均未修改。

## Rollback

合併前直接關閉 Draft PR；若未來合併，revert 本次單一 commit 即可完整移除選檔入口、parser、vendor bundle 與測試，回復 base `main` 行為。不得以 rollback 為理由操作 GAS 或正式資料。
