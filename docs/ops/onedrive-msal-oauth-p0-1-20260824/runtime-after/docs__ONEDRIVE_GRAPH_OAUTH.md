# North12B OneDrive Graph delegated OAuth

## Production contract

- Production 預設 `ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth`，以 Microsoft Graph delegated OAuth 讀取 Liam 的 OneDrive。
- 權限固定為 delegated `Files.Read`。MSAL 的預設 OIDC scopes 包含 `offline_access`，refresh credential 只存在 MSAL serialized cache。
- serialized MSAL cache 保存於 macOS Keychain generic password：service `North12BOneDriveGraphMsalCache`，account 預設為目前 macOS 使用者。
- runtime 先以 `acquireTokenSilent()` 從 cache 取得 access token；接近到期時由 MSAL 使用 cache 內 refresh credential 更新。
- access token／refresh credential／serialized cache 不可寫入 Git、log、stdout、manifest、命令列參數或 staging。
- Graph auth、listing、download 任一步失敗都 fail-closed；production 不 fallback 到本機 CloudStorage、Google Drive、staging、outputs 或 cache。

## Microsoft app registration

使用 public client app，不建立 client secret：

1. Supported account types 選 personal Microsoft accounts，或包含 personal Microsoft accounts 的 account type。
2. Authentication 加入 Mobile and desktop applications，system-browser redirect URI 使用 `http://localhost`。
3. 啟用 public client flow。
4. Microsoft Graph delegated permission 只加入 `Files.Read`。
5. 將 Application (client) ID 寫入 `report-automation/config/onedrive-graph-oauth.json`；client ID 不是 credential，檔案不得包含 client secret 或 token。

設定檔格式：

```json
{
  "clientId": "00000000-0000-4000-8000-000000000000",
  "authority": "https://login.microsoftonline.com/consumers",
  "cacheService": "North12BOneDriveGraphMsalCache"
}
```

## First consent and runtime

首次互動登入：

```sh
node report-automation/work/onedrive_graph_auth.mjs login
```

完成 Microsoft 登入與 `Files.Read` consent 後，MSAL cache 由 Keychain plugin 直接寫入 Keychain。CLI 只回報 authenticated／scope／到期時間，不輸出 token。

唯讀 credential health check：

```sh
node report-automation/work/onedrive_graph_auth.mjs status
```

正式 preflight：

```sh
ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth \
REPORT_DATE_ISO=2026-08-24 \
REPORT_DATA_CUTOFF_DATE=2026-08-23 \
node report-automation/work/preflight_onedrive_cloud_sources.mjs
```

沒有 cached account 或 Microsoft 明確要求重新互動時，狀態為 `AUTH_RECONSENT_REQUIRED`。網路、Keychain、client ID 或 Graph 錯誤保留各自錯誤碼，不得全部誤判為 re-consent。

## Explicit direct-token UAT

既有 Keychain service `North12BOneDriveGraphAccessToken` 僅保留一次性 UAT／緊急測試。必須明確設定：

```sh
ONEDRIVE_GRAPH_AUTH_MODE=direct-token node report-automation/work/preflight_onedrive_cloud_sources.mjs
```

production b-2 不設定此模式，也不會因 direct token 存在而自動選用。
