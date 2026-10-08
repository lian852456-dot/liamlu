# 最新登入介面契約（公開去敏版本）

來源為登入 task 最新本機 commit `e857c5f980441d93c1ca1377217d13ef498fa7bd` 的完整 B/client 候選；不是僅引用歷史 `468f3f2`。此處只交付原始碼介面、最新 transport 與 WORK owner read 示例；不包含完整後端候選、真實名冊、資格差異、Script/Sheet/Drive IDs、Properties 值或證據資料。

**正式狀態：frontend、native owner、password B 三 gate 均未正式啟用；真實 GAS isolated 全部驗收尚未通過。此交接不是 production-ready。** 最新 local client 原來源 manifest SHA 核對相同。登入 task 報告的 147 項本機回歸、14 browser 及獨立覆核是合成測試；本交接沒有重跑完整登入任務，不能代替真實 GAS 驗收。

## A / B 與舊換新邊界

A 為原員編／核准裝置入口；B 為指定密碼、owner 首次單裝置綁定與 30 分鐘記憶體 bearer。B profile 固定 employee、isTrusted=false；只允許原 dashboard/KPI 私有 reader。APP 原個績不等於 WORK 舊換新績效；B **沒有** `tradein_performance_read`、WORK、手機、3C、admin 或發布權限。不得把 B login 成功轉成 A 核准裝置，不可用 client role/store 或 bearer 擴權。

公開回收價仍使用原公開唯讀價格 API，不依賴新 B 登入。WORK 個績保留原合法權限及鎖定；完整 WORK 正式整合仍須 owner read fence、部署位置及正向授權驗收。

## B 六個 POST actions

由固定、owner 核對的 exact exec URL 接受 text/plain JSON POST；URL 透過既有安全設定提供，不由頁面使用者或 payload 改寫。沒有 GET/JSONP、未知 action、重複 key 或任意 method/file/role/store/admin selector。request 最多 16384 字元、depth20，錯誤只回 B_AUTH_DENIED。

| action | action 以外的接受欄位 | 行為 |
| --- | --- | --- |
| employee_status | 無 | off 回 enabled=false/passwordAvailable=false；on 先驗 schema／authority 有效期，不回 verifier／資格表 |
| employee_login | employeeId, deviceId, track=password-bound, password, sessionNonce, idempotencyKey | 核 native 身份、單裝置與真正 PBKDF2-HMAC-SHA256 600000 verifier；成功回 token/expiresAt/trustSource=password-bound |
| employee_session | deviceId, token | 核原裝置、TTL、binding/password epoch/authority/native generation/資格；subject 不由 client 選 |
| employee_logout | deviceId, token | 匹配 session 持久失效、保留 tombstone；即使 authority 已變仍能原 proof 登出 |
| employee_private_read | deviceId, token | 原完整 dashboard 私有 snapshot 與 employee profile；不是舊換新 transaction |
| employee_kpi_read | deviceId, token | 原完整 KPI 私有 data 與 employee profile |

employeeId canonical 5–12 位大寫英數，deviceId 16–128 位原識別。password UTF-8 最多 1024 bytes，不改 Unicode/NUL；nonce 由 WebCrypto 32 bytes 產生，idempotencyKey 20–80 位英數/_/-。此文件不提供真實 proof、verifier、token 或會員表。

登入 capture→鎖外 KDF→同 owner commit；grant 前重核時效、native pending/deny/generation、authority fingerprint、單裝置及容量。B 不建 Users、不補名冊、不覆写 A binding/trusted；未知、inactive、pending、revoked、重複或不符來源均拒絕。

## 最新 client 使用

`GasBClient.js` 原樣取自 e857c5f，SHA-256 `0e37fa41b09d772a9380792b9a747fc6ccaa9107e477820d1888af00761a93a6`。只有 memory session、90 秒單次 POST、AbortController 與 generation fencing，沒有 retry 或 proof persistence。`clear()` 中止請求與清 proof；讀取失敗會清 session。登出先清本機，再用先前 proof 送一次 logout；若服務端未確認，UI 須標示撤銷未確認。關頁丟失 bearer 不等於服務端撤銷；仍受原 30 分鐘 TTL 限制。

上層 e857c5f frontend shell 負責 A/B 切換、頁面恢復重驗、逾時／晚回應清空與完整資料來源批次核對。此處 transport 不是整套 frontend shell 的替代品；不能只貼此檔就宣稱登入接線完成。

## WORK owner read 示例

`owner-read-boundary.example.patch` 保留 WORK 原 business body，包住 Authorize **及完整 Read**：off 原樣；enabled 僅容許當前 auth owner，在同 ScriptLock/withEligibility transaction 保持 native fence，直到 registry/snapshot/readback/角色投影完成。callback 由 host code 提供，不能由 JSON/RPC 指定。

示例需 owner 在 fresh source 核對 `privateDashboardAuthBoundaryEnabled_`、`privateDashboardRequireAuthOwner_`、`privateDashboardAuthProvider_().withEligibility` 已完整接入且經測試；不是 standalone 後端。WORK 若部署於 peer，不能繞過 raw roster guard；需另定完整 owner-executed read operation，這份示例不新增該 RPC。

## 尚未完成的 gate

正式 native 名冊／生效日／映射、完整 writer inventory、最新部署來源／回復點、指定 settings/grants、persistent state 與容量、真 GAS KDF/ScriptLock/revoke/deny/expiry/redirect/讀取正反向仍須登入 owner 的精確證據。保留當前 gate-off；不得初始化真實 Properties、重設 deny/session、授予新權限或部署。孤立測試進度由登入 task 更新，本文件不能當作完成收據。
