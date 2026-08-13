# Approved Device Canonical Design

狀態：**DESIGN + TEST ONLY / NOT DEPLOYED**

## 目的

Private 與 Patrol 不得再各自推論同一台裝置是否 approved。唯一允許的 canonical decision 是：

```text
isApprovedDevice(employeeId, deviceId)
```

本輪只固定 contract、狀態語意與測試 Gate；不部署 auto device auth，不更動 registry、`private_access`、`ptauth` 或 Patrol session。

## 名詞邊界

| 名詞 | 意義 | 不代表 |
|---|---|---|
| trusted employee | 員工存在且可使用指定服務 | 裝置已核准 |
| Approved Device | canonical registry 中 employeeId + deviceId 配對為 approved 且未撤銷 | 已取得 Private 或 Patrol session |
| private access | Private backend 對本次請求核發的唯讀授權結果 | Patrol 已核發 session |
| patrol session | Patrol backend 驗證 canonical decision 後核發的短效 session | 永久 approved、可繞過撤銷 |

## Canonical authority

1. Approved Device registry 只能有一個 authoritative owner：現有 Private Approved Device registry。
2. `employeeId` 與 `deviceId` 都是 business key；不可只驗其中一個。
3. device 必須為 `approved`、未 revoked、employee 綁定一致。
4. 任何欄位缺失、registry 無法讀取、版本不明或 transport error 一律 fail-closed。
5. Client 傳入的 `approved=true`、Native mode、User-Agent 或 iPhone 身分皆不是信任證據。

## Canonical response

```json
{
  "status": "approved | rejected | error",
  "employeeIdHash": "de-identified stable reference",
  "deviceIdHash": "de-identified stable reference",
  "registryVersion": "opaque version",
  "decidedAt": "server timestamp",
  "reason": "approved | revoked | mismatch | unknown_device | unavailable"
}
```

正式 log 不得包含原始 employeeId、deviceId、token、cookie 或 assertion。

## 未來跨 service 驗證方式

若 Patrol 不能直接呼叫同一 authoritative registry，只允許 versioned server-to-server assertion：

- Private 在成功執行 `isApprovedDevice()` 後簽發。
- audience 固定為 Patrol deployment。
- 綁定 employee hash、device hash、registry version、nonce、issuedAt、expiresAt。
- TTL 短效（設計上限 60 秒）。
- nonce 單次消耗；replay 必須拒絕。
- assertion secret／key version 僅存在 server-side。
- Patrol 不再保有第二份可獨立得出 approved 的 registry。
- Patrol mint session 前必須重驗 audience、expiry、nonce、pair binding 與 registry version。

## 一致性 Gate

同一 employee/device 若出現下列任何結果，release 必須 FAIL：

- Private = approved，Patrol = rejected／unknown
- Private = rejected，Patrol = approved
- 兩側 registry version 不同卻仍 mint session
- Private transport error，但 Patrol 接受 client 的 approved 狀態

只有 canonical decision 為 approved 且 Patrol 驗證同一 decision proof，才可 mint patrol session。

## 撤銷語意

1. registry revoke 後，下一次 canonical check 必須 rejected。
2. 新 patrol session 不得核發。
3. 既有短效 session 的處理沿用現行安全規則；下一次驗證必須清除 App 端 patrol session。
4. 不得用 cache 延長 revoked device 的有效期。

## 本輪明確未做

- 沒有新增 `ptauth_device`。
- 沒有部署 assertion route。
- 沒有同步或修改 Approved Device registry。
- 沒有讓 Native App 自動取得 Patrol session。
- 網站 `patrol.html` 的通行碼流程完全不變。
