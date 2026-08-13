# Liam Supervisor App 1.3 Production Incident — 2026-08-13

## 事故摘要

- 影響版本：Web `c218843f73092d787df9ec89a261100fce1dc9d3`
- 影響部署：Private GAS v30、Patrol GAS v56
- 症狀：KPI／台獎／每日回報正式摘要無法正常讀取；巡店／班表授權或讀取異常；Native App 與既有網站同時受影響。
- 資料完整性：Google Sheet 原始資料仍存在；本次復原沒有修改、刪除或重寫任何 Sheet row。
- 復原點：Private GAS v29、Patrol GAS v53、Web `94070e0becd289287dae76fb461d719a898cb8d5` 語意。
- 寫入狀態：`hwrite` 停用；`half_media_upload` 停用。

## 1. 失效的 App 1.3 GAS 差異

事故不是 KPI、台獎或巡店 canonical 計算單一公式造成，而是 App 1.3 將跨後端的 Approved Device 自動授權橋接併入同一份 `gas/Code.gs`，並把完整檔案分別部署到兩個原本獨立的 Apps Script 專案。

Private v30 與 Patrol v56 新增的關鍵路徑包括：

- `ptauth_device`
- `private_patrol_assertion`
- `PATROL_DEVICE_ASSERTION_*`
- `ptAuthenticateDevicePayload()`
- `privateDashboardPatrolAssertion()`
- 共用的巡店 session mint／replay cache

Private v30 同時帶入 Patrol 專用 route／summary 程式；Patrol v56 同時帶入 Private Approved Device registry 語意。這破壞了原本「Private 與 Patrol 各自部署、各自設定、各自授權」的邊界，導致正式環境出現 backend/frontend version skew 與授權狀態不一致。回退到 Private v29、Patrol v53 後，既有健康檢查與 fail-closed 路由恢復。

## 2. 自動測試未抓到的原因

部署前測試主要覆蓋：

- 本機／fixture mapping
- route 存在
- 未授權拒絕
- 模擬的 assertion、replay 與前端 UI
- Chromium／WebKit 靜態與 mock smoke

缺少的正式相容性 Gate：

- 兩個實際 Apps Script project 的 Script Properties／CacheService／Approved Device registry 差異
- 既有 KPI、台獎、每日回報、patrol.html、班表在「backend 已更新、Pages 尚未更新」期間的正向 authenticated read
- legacy website 與 Native App 共用正式 deployment ID 的完整回歸
- backend deploy 後、Pages deploy 前的明確 stop-the-line Gate

因此 negative smoke 可以通過，但沒有證明既有 Approved Device 正向讀取與所有 legacy read action 仍相容。

## 3. 兩個 backend 先部署、Pages 尚未完成的原因

原部署流程採「先 GAS、再 Pages」的分階段作業，但缺少原子化 release manifest 與相容版本矩陣。兩個 GAS deployment 已切到新版本時，Pages 仍可能載入上一個 frontend，形成：

- 舊 frontend × 新 Private backend
- 舊 frontend × 新 Patrol backend
- 新 frontend × 兩個不同設定狀態的 backend

未在每一次 backend 切換後先完成既有網站 authenticated read Gate，是本次擴大影響面的流程缺陷。

## 4. Approved Device 在 Private 與 Patrol 狀態不同的原因

Private 與 Patrol 是兩個獨立 Apps Script project，具有不同的：

- Script Properties
- CacheService namespace
- deployment version
- 授權資料來源與 runtime state

Private backend 可以確認某個 employee/device 已核准，不代表 Patrol backend 可以直接讀到同一 registry。App 1.3 以短效 assertion 串接兩者，但正式環境若 assertion secret、registry、deployment 或 cache 任一側不同步，Private 會顯示 approved，Patrol 仍會拒絕或無法 mint session。Client 傳入的 approved 狀態不能作為信任來源。

## 5. 防止再次發生 backend/frontend version skew

後續正式部署必須加入以下 Gate：

1. Private、Patrol、Pages 使用同一份 release manifest，明列相容版本。
2. 每個 backend 部署後，先執行既有網站的正向 authenticated read；通過才可切下一層。
3. Remote config 或 Native startup query 不得先於 compatible backend 全部就緒。
4. Private 與 Patrol 不再部署同一份未隔離的 monolithic `Code.gs`；跨後端 bridge 必須以明確 contract 與獨立設定驗證。
5. 測試必須包含 real deployment 的 approved／revoked／legacy website 相容性，不以未授權拒絕取代正向讀取。
6. 任一階段失敗立即回退該層，不用前端空值或 cache 掩蓋 transport/auth failure。
7. 所有正式 transport failure 必須 fail-closed，不能映射為 `0/9`、`0%` 或「無資料」。

## 復原與 Rollback

- Private GAS：v30 → v29
- Patrol GAS：v56 → v53
- Web：以 `94070e0becd289287dae76fb461d719a898cb8d5` 恢復 App production semantics，另使用新的 emergency cache name 與 asset cache-bust。
- App 1.3：保留 branch／commit 作事故分析，不在 production 疊加熱修。
- Sheet：未修改。

