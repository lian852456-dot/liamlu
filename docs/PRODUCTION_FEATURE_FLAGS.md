# Production Feature Flags / Kill Switch Design

狀態：**DESIGN + TEST ONLY / NOT WIRED TO PRODUCTION**

## 預設設定

```json
{
  "configVersion": "post-incident-hardening-v1",
  "autoDeviceAuth": false,
  "yesterdayFollowUp": false,
  "managerStoreSemantics": false,
  "halfMonthWrite": false,
  "halfMonthMedia": false
}
```

## 安全規則

1. 所有未知 flag 視為 `false`。
2. config 缺失、非 HTTPS、非 JSON、schema 不符、版本不支援或讀取逾時，一律使用 bundled `false` defaults。
3. config 不得包含 endpoint、token、passcode、employeeId、deviceId、cookie、OAuth credential 或 secret。
4. flag 只控制已 dark-deploy 且通過 legacy/new-route smoke 的程式路徑。
5. flag 不得改變舊 action semantics，不得繞過 backend authorization。
6. 每次 production 只允許開啟一個 flag；關閉 flag 必須立即回到既有流程。
7. `halfMonthWrite` 與 `halfMonthMedia` 分開；媒體不得因文字寫入開啟而自動開啟。

## 啟用 Gate

```text
dark deploy backend
→ legacy production smoke PASS
→ new route smoke PASS
→ Pages deploy PASS
→ canary device PASS
→ enable one flag
→ Liam device acceptance PASS
```

任一步失敗即將該 flag 保持／恢復 `false`，不 rollback 其他已 PASS 模組。

## App 1.3 重新導入順序

1. `managerStoreSemantics`
2. `yesterdayFollowUp`
3. Remote Config infrastructure（只讀 config，endpoint 不切換）
4. `autoDeviceAuth`

每一步都必須有獨立 manifest、獨立 commit、獨立 canary 與 Liam Device PASS。禁止打包重上。

`halfMonthWrite`、`halfMonthMedia` 不在 App 1.3 recovery 序列內，兩者持續 `false`。

## Kill switch 行為

| Flag | `false` 時必須維持的流程 |
|---|---|
| `autoDeviceAuth` | Native 與網站沿用目前既有 unlock／`ptauth` 流程 |
| `yesterdayFollowUp` | 不發起昨日資料 request，不顯示入口 |
| `managerStoreSemantics` | 使用 recovery stable 個績呈現 |
| `halfMonthWrite` | 半月只讀；沒有儲存 CTA、沒有 `hwrite` request |
| `halfMonthMedia` | 沒有 upload CTA、沒有 `half_media_upload` request |
