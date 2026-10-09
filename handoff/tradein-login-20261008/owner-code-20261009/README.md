# WORK owner 完整 read fence：純碼公開交接／未部署

此包補足原 `owner-read-boundary.example.patch` 缺少的可執行依賴。主線已取得新增後端碼逐檔去敏後發布至同一交接分支的直接批准；唯一 push owner 為 UI。登入 owner本輪僅本機整理，未公開／上傳／push；沒有 merge 或正式部署批准。

## 可攜 base 與採用順序

公開儲存庫：`https://github.com/lian852456-dot/liamlu`。精確 base 為 PR179 `4d9da62f62f5c3dab164cdbaf162ac0ac8180f9d` 的 `gas/Code.gs`，SHA256 `52e79ab8c25ed3ec9d1e51695aa9ef6140fdb93daac31d942bd1d4a8b0225aeb`，303791 字元。消費者不需要登入 task 的本機 commit、絕對路徑或原 evidence。

```sh
# 在自己的已取得 PR179 精確 base 工作副本操作；先保留自己的變更。
git apply --check /path/to/allowlist/01-native-owner-foundation.patch
git apply /path/to/allowlist/01-native-owner-foundation.patch
git apply --check /path/to/allowlist/02-work-full-read-fence.patch
git apply /path/to/allowlist/02-work-full-read-fence.patch
OWNER_FENCE_CODE_PATH="$PWD/gas/Code.gs" node --test /path/to/allowlist/tests/owner-fence.test.cjs
```

head 移動時先重新核對 function 差異，不使用 `--reject`、強制套用或整檔覆蓋。兩個 patch 已內嵌所有模組；`modules/` 只是可讀原碼，不能再重複貼入。不要再疊舊 example patch。

1. `01-native-owner-foundation.patch`：帶全原生 durable revoke／restore、reentrant ScriptLock、資格 generation／pending／deny 狀態、Users／Requests 寫入 guard、native mutation begin／complete、`privateDashboardAuthBoundaryEnabled_`、`privateDashboardRequireAuthOwner_`、`privateDashboardAuthProvider_`、store／provider 及 owner-local provider adapter。保留 gate=false，不加 B、RPC dispatch、peer transport 或自動初始化。原 native revoke candidate 的 admin restore action 也納入差異；這是須另核對批准的後端增量，不能說只有 UI wrapper。
2. `02-work-full-read-fence.patch`：同時包原 `tradeinPerformanceAuthorize_` 與完整 `tradeinPerformanceRead`，新增 host-only `privateDashboardTradeinReadBoundary_`。`withEligibility` capture 與 commit 各在 owner transaction；commit 重驗 native generation／pending／deny，並保持同一可重入 ScriptLock，直到 registry、snapshot、roster hash、原 self／supervisor projection 及回應建構完成。兩個 WORK 原函式 business body 與其他 bytes 保持原樣。
3. 本包只支援 WORK 落在選定 auth owner 的本機讀取。`OwnerLocalProvider.gs` 從既有 store/provider wiring 取最小 owner-only adapter，直接建立 store/provider，不牽入會建立 RPC 的完整 `GasAuthWiring.gs`。此 adapter 是本次新整合，已納入實際 patch 的合成測試。既有完整 native adapters 已在 fresh owner 裝妥者，僅需比對採用第 2 patch 的函式增量；不能再加重複 provider 或重複 const。

## 仍需 owner 持有的依賴與 gate

- `DASHBOARD_AUTH_OWNER_SCRIPT_ID` 必須為實際執行此 WORK 模組的同一 owner。值不在此包。peer 執行 read／raw roster 必須拒絕；本包不提供 peer WORK operation。
- 原 `privateDashboardProperties`、roster schema／cleaners／business helpers、`TradeinPerformanceCore`、私有月 registry／snapshot／projection 由指定公開 base 已帶入。正式來源／映射仍由 WORK 私有流程核對；本包不提供人員或績效資料。
- owner 的 `DASHBOARD_AUTH_NATIVE_V1` 必須經批准且有效，保留既有 generation／pending／deny。缺少／格式或 owner 不符即拒絕，不初始化或清空。store 原碼含 bounded nonce consumer，但 owner-local adapter 不使用 RPC nonce，未要求新增 16 bucket，不提供 provision 工具。
- 完整 native writer inventory 必須經核對，尤其其他專案仍可写同表時，單一 ScriptLock 無法替另一專案排他。此包對上述 base 的既有 native writers 補 hook，不能聲稱已完成所有外部 writer 盤點。
- 正式 grant、持久 state、部署位置、資料映射、完整 owner runtime 正反向／失敗回復及最終 source hash 尚需 gate；目前沒有正式啟用證據。

## 權限界線與 WORK 最小增量

WORK 保留既有 A approved-device／trusted 督導／九店／self 投影規則。新 fence 只令 native pending／deny／generation 對原讀取立即有效；不把 B 轉成 A。B 仍僅 dashboard/KPI，沒有 WORK 個績、手機、3C、admin 或發布權。不得新增 B `tradein_performance_read` 或將 bearer 當 WORK proof。

WORK 若放在 peer，需另定 owner 執行的「完整」WORK read operation、原 caller authority、輸入／輸出與資料範圍、容量及部署 gate；不可以只回 authorizer ID 再於 peer 讀私有 registry。本包沒有新增這個 operation，該路徑仍是阻擋。

## 本機驗證

已在精確 base 的乾淨副本依序 `git apply --check`、套用兩 patch，結果 bytes 與生成候選 SHA 完全一致；完整 GS 語法通過。新包 16 項測試通過：完整讀取持 lock 至 projection、既有 approved-device／trusted／self 規則、pending／deny、inactive／revoked、錯裝置／未知／重複身份、peer 拒絕、缺 state／config、generation ABA、非 host capture、async 拒絕、native revoke／失敗 pending／flush 收尾與 gate-off。只有合成服務與身份，沒有 Google 呼叫、POST 或 helper。

詳細逐檔 hashes、base／phase hashes 與 changed functions 見 `SOURCE-MANIFEST.json`。本機測試不等於正式登入或 WORK 個績已通過正式驗收。

## allowlist

只允許本包根目錄的兩個 patch、README、SOURCE-MANIFEST、PRIVACY-REVIEW、SHA256SUMS，以及 `modules/` 四件純碼與 `tests/owner-fence.test.cjs`。上層 `internal/`、完整原碼快照、原 evidence、實測收據／資料／設定／截图、其他本機工作樹與任何 Git history 都排除。新增純碼公開交接已明確批准；唯一 push owner 是 UI，正式啟用或權限擴充另須批准。
