# LiamSupervisor Native iOS Shell

- Display name: `Liam 情報站`
- Bundle ID: `com.liamlu.liamsupervisor`
- Version/build: `1.0 (1)`
- Deployment target: iOS 16.0
- Web origin: `https://lian852456-dot.github.io/liamlu/app.html`

本 target 僅提供 Native shell，不複製正式資料、不含 credential、不新增寫入能力。`WKWebsiteDataStore.default()` 保留既有 HttpOnly Cookie 與網站儲存邊界；Navigation Policy 只允許正式 App origin 及明列的 Google OAuth host 留在 WebView。

## Build

```sh
xcodebuild -project LiamSupervisor.xcodeproj -scheme LiamSupervisor -sdk iphonesimulator -configuration Debug build
```

實機安裝需在 Xcode 選擇 Liam 的 Apple Development Team 與已開啟 Developer Mode 的 iPhone。
