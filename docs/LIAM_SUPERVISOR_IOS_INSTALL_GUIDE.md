# Liam 情報站 iPhone 安裝（最多 5 步）

1. 從 App Store 安裝完整 Xcode，開啟後登入 Liam 的 Apple ID；iPhone 以 USB 連到 Mac。
2. iPhone 依提示開啟「設定 → 隱私權與安全性 → 開發者模式」，重新啟動並確認信任此 Mac。
3. Xcode 開啟 `ios/LiamSupervisor/LiamSupervisor.xcodeproj`，Target `LiamSupervisor` → Signing & Capabilities 選 Liam 的 Personal Team。
4. 上方裝置選 Liam 的 iPhone，按 Run（▶）；若出現信任開發者提示，依 iPhone 畫面確認。
5. 主畫面點「Liam 情報站」，完成登入、KPI／台獎／回報／班表／巡店與重新整理 smoke test。

若 Xcode 顯示 bundle ID 已占用，只調整 Target 的 bundle identifier 為 Liam 帳號可簽署的唯一值；不得修改 Web OAuth、Cookie、Session 或 Approved Device 設定。
