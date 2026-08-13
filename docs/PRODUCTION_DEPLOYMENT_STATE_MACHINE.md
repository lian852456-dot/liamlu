# Production Deployment State Machine

狀態：**MANDATORY PROCESS CONTRACT**

```text
PREPARED
  → A_BACKEND_DARK_DEPLOYED
  → B_LEGACY_SMOKE_PASSED
  → C_NEW_ROUTE_SMOKE_PASSED
  → D_PAGES_DEPLOYED
  → E_CANARY_DEVICE_PASSED
  → F_ONE_FLAG_ENABLED
  → G_LIAM_DEVICE_ACCEPTED
  → RELEASED
```

## 狀態 Gate

| 階段 | 必要證據 | 失敗行為 |
|---|---|---|
| A. Dark deploy backend | 新 version/deployment 可測，但舊 production semantics 未切換 | STOP；移除／忽略 candidate |
| B. 舊網站 production smoke | KPI、台獎、回報、patrol、班表、ptvisit、hread 正向與負向讀取 | STOP；backend rollback |
| C. 新 route production smoke | 新 route auth、schema、timeout、legacy isolation | STOP；backend rollback |
| D. Pages deploy | manifest、asset hash、SW cache、console、WebKit | STOP；Pages revert，不開 flag |
| E. Canary device | 一台、單一 concern、正式讀回 | STOP；flag false／Pages revert |
| F. Feature flag enable | 只改一個 flag，readback config version | STOP；關閉該 flag |
| G. Liam device acceptance | Liam 實機確認該 concern | STOP；關閉該 flag，不進下一項 |

## 強制規則

1. 不能跳階段，也不能用後一階段結果補前一階段證據。
2. Backend deploy 與 feature enable 是不同狀態。
3. 一次 release 只處理一個 production concern。
4. 任一結果不是 PASS 就 STOP。
5. 每一步更新新的 release manifest；版本組合與 rollback target 必須可讀。
6. `hwrite`、`half_media_upload` 目前不允許進入本 state machine。

## Canary 順序

App 1.3 任何重新導入都固定依序：

1. 店點店長呈現方式
2. 昨日待追蹤
3. Remote Config infrastructure（不切 endpoint）
4. Approved Device 自動驗證

前一項未取得 Liam Device PASS，下一項保持未部署／flag false。
