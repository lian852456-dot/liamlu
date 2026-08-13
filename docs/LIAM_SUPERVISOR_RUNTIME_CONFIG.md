# Liam Supervisor App Runtime Config

`app-runtime-config.json` 是 App 1.3 的同源唯讀端點設定，只允許三個欄位：

- `configVersion`
- `privateApi`
- `patrolApi`

兩個 API 都必須是 `https://script.google.com/macros/s/.../exec`。設定不得包含 token、通行碼、員編、Device ID、secret 或 OAuth credential；格式或來源不合法時，App 會 fail-closed 回退至程式內已知穩定端點，不接受任意網域。

## App endpoint 何時更新

Pages 發布新的 `app-runtime-config.json` 後，App 會在下一次 cold launch 或使用者按右上角 Refresh 時，以 `cache: no-store` 重新讀取設定。Service Worker 不預快取、不保存這個檔案，因此只更新 GAS endpoint 不需要修改 Native `AppConfig`、重新 Xcode Run 或重裝 App。

Native shell 本身、startup origin 或 navigation policy 有變更時，才需要新的 Native build。
