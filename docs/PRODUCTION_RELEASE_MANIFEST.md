# Liam Supervisor Production Release Manifest

狀態：**IMMUTABLE / LIAM DEVICE ACCEPTED / STABLE BASELINE**

Release ID：`stable-baseline-20260814-daily-report-separation`

凍結日期：2026-08-14（Asia/Taipei）

這份 manifest 記錄 Liam iPhone 已正式接受的完整 production 組合。未來任何版本變更都必須建立新的完整 release manifest；不得把其中一層單獨替換後繼續沿用本次 PASS。

## 正式組合

| 層級 | 固定版本／設定 | 驗收狀態 |
|---|---|---|
| Accepted frontend baseline | `76d524519770144e12e884c5c931a865f86ba40a` | Liam iPhone Phase 2.1 acceptance **PASS** |
| Web / Pages | `76d524519770144e12e884c5c931a865f86ba40a` | GitHub Pages deployment run `31771430919` success |
| Pages release query | `daily-report-separation-phase2-1-20260814-1` | `app.css`、`app.js` 與 Service Worker registration 一致 |
| Service Worker cache | `liam-supervisor-app-1-2-daily-report-separation-phase2-1-20260814-v1` | 新舊 cache 可明確區分 |
| Private GAS | v29 | **FROZEN / UNCHANGED** |
| Patrol GAS | v53 | **FROZEN / UNCHANGED** |
| Native App | Existing Liam Supervisor App 1.2 shell | Native shell、Signing、Bundle ID 均未修改 |
| Runtime Config endpoint switch | **DISABLED / NOT DEPLOYED** | 不屬於本 baseline |
| Approved Device auto auth | **DISABLED / NOT DEPLOYED** | 不屬於本 baseline |
| `hwrite` | **DISABLED** | 不得隨其他 release 自動開啟 |
| `half_media_upload` | **DISABLED** | 正式呼叫次數維持 0 |

## Liam Device Acceptance

### Phase 1 — Manager Semantics

- 店長不得顯示個人績效 `0.0%`。
- 店長顯示正式店 KPI、公司排名、KPI DOD、排名變化、AQ actual 與距離 10 點的 gap。
- 店長排除於個人績效排名與 A999／好速／R1399 個人未達名單。
- Liam iPhone acceptance：**PASS**。

### Phase 2 — Yesterday Follow-up

- 僅讀台北前一天正式 `21:00`。
- 不允許 fallback 到 `16:00`。
- transport error 必須 fail-closed，不得呈現假 0。
- 無正式資料時顯示「昨日 21:00 尚無正式資料」。
- Liam iPhone acceptance：**PASS**。

### Phase 2.1 — Daily Report Today / Yesterday Separation

- 每日回報頁明確分成「今日回報」與「昨日待追蹤」兩個獨立資訊區塊。
- 今日 `16:00`／`21:00` tab 只控制今日資料，不得改變昨日區塊。
- 昨日待追蹤維持 previous-day formal `21:00` only，不得 fallback 到 `16:00`。
- Liam iPhone 實機切換今日 `21:00` 後，昨日摘要 `0 / 0 / 6 / 6` 與正式原文保持不變。
- Liam iPhone acceptance：**PASS**。

## 永久回歸測試

以下測試是本 baseline 的不可移除保護：

| 保護規則 | 永久測試證據 |
|---|---|
| manager personal `0.0%` prohibited | `tests/liam-supervisor-manager-store-semantics.test.cjs` |
| manager excluded from personal failure ranking | `tests/liam-supervisor-realdata-mapping.test.cjs` |
| yesterday follow-up = previous day `21:00` only | `tests/liam-supervisor-yesterday-follow-up.test.cjs` |
| no `16:00` fallback | `tests/liam-supervisor-yesterday-follow-up.test.cjs` |
| transport error != zero | `tests/liam-supervisor-yesterday-follow-up.test.cjs`、`tests/liam-supervisor-read-recovery.test.cjs` |
| today `16:00` / `21:00` leaves yesterday content unchanged | `tests/liam-supervisor-yesterday-follow-up.test.cjs`、`tests/liam-supervisor-yesterday-follow-up.spec.js` |
| today and yesterday are separate visual regions | `tests/liam-supervisor-yesterday-follow-up.test.cjs` |
| 390×844 no overflow and console error 0 | `tests/liam-supervisor-yesterday-follow-up.spec.js` |
| KPI canonical source identity | `tests/kpi-battle-source.test.cjs`、`tests/liam-supervisor-realdata-mapping.test.cjs` |

任何後續 release 若刪除、放寬或跳過上述測試，不得沿用此 baseline 的 PASS。

## Freeze

本次 freeze 只新增本 manifest 文件：

- Production data writes：`0`
- Sheet modified：`NO`
- GAS changed：`NO`
- Native changed：`NO`
- Product code changed：`NO`
- Existing regression tests：保留且未移除

下列項目明確不在本 release，且本次不得啟動：

- Remote Config endpoint switch
- Approved Device auto auth
- half-month media
- `hwrite`
- `REMOVE LOCAL KEYCHAIN AS PRODUCTION PUBLISHER SINGLE POINT OF FAILURE`（下一項獨立任務，本次未開始）
- 其他 App 功能

## 不可拆分規則

1. Web、Private GAS、Patrol GAS、Service Worker 與 Native shell 必須視為同一 release 組合。
2. Backend 單獨部署不代表 frontend release 完成。
3. transport failure、timeout、non-JSON 或 unauthorized 不得轉成正式 0／no-data。
4. rollback 不得修改正式資料或 Sheet。
5. 任何 production concern 必須使用新 branch、commit、diff review、canary 與 Liam Device Acceptance；不可覆寫本 manifest。
