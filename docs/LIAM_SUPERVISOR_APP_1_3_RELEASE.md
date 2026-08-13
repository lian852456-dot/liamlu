# Liam Supervisor App 1.3｜Phase 1 Release Gate

範圍只含四項 Recovery Stable 改善：

1. Native Approved Device 自動取得既有短效巡店 session；一般網站通行碼流程不變。
2. 同源、no-store、固定 host allowlist 的 `app-runtime-config.json`。
3. 獨立讀取台北昨日 21:00 的未過關與門市請益原文。
4. 店點個績的店長改以正式店績＋個人 AQ actual 呈現；副店／業代語意不變。

安全邊界：`hwrite` 持續停用，`half_media_upload` 為 0；不修改巡店 canonical、ptvisit、KPI／台獎公式、Daily Report write、Approved Device registry、Native signing 或 Bundle ID。Phase 2 媒體功能未開始。

部署前，private 與 patrol 兩個 Apps Script project 必須各自設定同一個至少 32 bytes 的 `PATROL_DEVICE_ASSERTION_SECRET` Script Property。此值不得寫入 Git、URL、log 或前端設定。任一 project 未設定時，device bridge 固定拒絕。

正式 Gate 必須另外完成：Approved／revoked／random／mismatch／expired／replay、昨日 21:00 parity、390×844、Chromium、WebKit、console、overflow、audit、secret scan，以及網站 `ptauth` 不變的回歸驗證。完成後只進入 Liam Device Review，不建立 final pilot tag。
