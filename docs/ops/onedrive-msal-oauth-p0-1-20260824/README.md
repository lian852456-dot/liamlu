# 2026-08-24 P0.1：OneDrive Graph renewable OAuth

## Scope

在既有 v34 Cloud-first resolver 前新增 delegated OAuth credential manager；沒有修改 `onedrive_cloud_source.mjs`、UI、Approved Device、authentication／TTL、KPI component 或 awards freshness gate。

## Design

- Production 預設 `ONEDRIVE_GRAPH_AUTH_MODE=renewable-oauth`。
- Microsoft Graph delegated scope 固定為 `Files.Read`；MSAL 的預設 OIDC scopes 包含 `offline_access`。
- MSAL serialized cache／refresh credential 只保存於 macOS Keychain service `North12BOneDriveGraphMsalCache`。
- runtime 以 `acquireTokenSilent()` 取得或 refresh 短期 access token；access token、refresh credential 與 serialized cache不進 Git、logs、stdout、manifest、argv 或 staging。
- 只有沒有 cached account 或 Microsoft 明確要求互動時回 `AUTH_RECONSENT_REQUIRED`；網路、Keychain、client config 錯誤保留各自 fail-closed 狀態。
- 既有 Keychain service `North12BOneDriveGraphAccessToken` direct token 僅保留明確 `ONEDRIVE_GRAPH_AUTH_MODE=direct-token` 的人工 UAT／緊急測試。
- Graph auth 失敗不 fallback 到本機 CloudStorage。

## Runtime integration

- `preflight_onedrive_cloud_sources.mjs` 與 `run_daily_north12b_report.mjs` 改由 `onedrive_graph_auth.mjs` 取得 in-memory access token。
- production b-2 automation prompt 已先備份，再明確加入 renewable OAuth、Keychain cache、re-consent 與 explicit direct-token 契約；Git 只保存不含私人 automation 全文與憑證的機械 migration helper。
- `@azure/msal-node` 固定於 runtime package dependency；本次安裝版本為 5.6.0。

## Regression evidence before consent

- OAuth／Cloud-first focused tests：12/12 passed。
- runtime Node：72/74 passed；兩項既有 `award_v15_frontend_contract` UI failures 與本次 auth 變更無關，且 UI 不在授權範圍。
- 使用真實 MSAL `PublicClientApplication`、空的測試 Keychain service 執行 status，精準回 `AUTH_RECONSENT_REQUIRED: no cached Microsoft account`，未呼叫 Graph、未 fallback 本機。
- `npm audit`：0 vulnerabilities。

## Consent boundary

Microsoft app registration、`Files.Read` delegated consent 與首次持久 Keychain cache 寫入必須在 Liam 操作點確認後執行。完成前不得把 preflight、awards build/publish 或 Website/App readback 標為 PASS。

## Rollback

1. 將 b-2 automation prompt 還原為本次備份；仍須保留 Cloud-first 與 no-local-fallback 契約。
2. runtime 將 preflight／runner access-token import 還原到 v34 direct-token loader，並移除 MSAL auth module；不得回退 v34 resolver、component-level publish、KPI cutoff 或 awards freshness gate。
3. Keychain cache 若需撤銷，應由 Liam 明確授權後移除 `North12BOneDriveGraphMsalCache` 並在 Microsoft account 撤銷 app consent；不得以刪除 cache 冒充雲端撤權。
