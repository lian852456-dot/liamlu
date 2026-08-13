# Liam Supervisor Production Release Manifest

狀態：**IMMUTABLE / RECOVERY STABLE**

Release ID：`recovery-stable-20260813-1`

建立日期：2026-08-13（Asia/Taipei）

這份 manifest 記錄目前已恢復且不可拆開替換的 production 組合。任何未來 release 必須建立一份新的完整 manifest；不得覆寫本文件或只切換其中一層。

## 目前正式組合

| 層級 | 固定版本／設定 | 備註 |
|---|---|---|
| Web | `6f2b42d9c91ff9c6c573e6767525f93105b6a059` | recovery commit，production `main` |
| Web semantic baseline | `94070e0becd289287dae76fb461d719a898cb8d5` | 最後 Liam Device Full Read PASS 語意 |
| Private GAS | v29 | Deployment ID 維持既有 Private deployment |
| Patrol GAS | v53 | Deployment ID 維持既有 Patrol deployment |
| Native shell | `4777746cd0daa9808eccf4260d8b161dfe53e7ac` | Bundle ID、Signing、Native shell 均未修改 |
| Native startup URL | `https://lian852456-dot.github.io/liamlu/app.html?native=1&release=c218843` | `release` 是既有 cache query；實際 Pages 資產由本 manifest 的 Web commit 決定 |
| Service Worker cache | `liam-supervisor-app-1-2-emergency-rollback-20260813-v1` | recovery 專用新 cache family member |
| Web asset query | `emergency-rollback-20260813-1` | `app.html` 與 SW registration 使用相同 cache bust |
| Runtime config | **DISABLED / ABSENT** | recovery 版使用 `app.js` 內兩個已知 deployment endpoint；沒有 remote endpoint 切換 |
| Feature flags | 全部 `false` | 僅為 hardening 設計，未接入 production runtime |
| `hwrite` | **DISABLED** | 不可隨 backend deploy 自動開啟 |
| `half_media_upload` | **DISABLED** | 呼叫次數必須為 0 |

## 相容性矩陣

唯一允許宣告為本 release 的組合：

```text
Web 6f2b42d
  + Private GAS v29
  + Patrol GAS v53
  + Native shell 4777746（既有 startup URL）
  + SW cache liam-supervisor-app-1-2-emergency-rollback-20260813-v1
  + runtime config disabled
```

任一版本不同即為另一個 release candidate，必須重新走完整 Deployment State Machine，不得沿用本 manifest 的 PASS。

## Release manifest 必要欄位

未來每次 release 必須先建立新的 immutable manifest，至少包含：

- release ID、建立時間、負責人
- Web commit、asset query、Service Worker cache name
- Private GAS deployment ID + version
- Patrol GAS deployment ID + version
- Native commit、Bundle ID、startup URL／release query
- runtime config 版本與完整 allowlisted endpoint 組合
- feature flags 的明確值
- legacy compatibility smoke 結果
- new route smoke 結果
- canary device 結果
- Liam device acceptance 結果
- 每一層 rollback 目標

## 不可拆分規則

1. Backend dark deploy 不等於 release 完成。
2. Pages deploy 不得指向尚未通過 legacy smoke 的 backend。
3. Native release query 不得先於 compatible Pages 上線。
4. Feature flag 預設關閉；功能 enable 是獨立 production concern。
5. 任一層失敗即停止，不能用其他層的 deploy 掩蓋。
6. 正式資料與 Sheet 不屬於 rollback target；rollback 永遠不得修改資料。
