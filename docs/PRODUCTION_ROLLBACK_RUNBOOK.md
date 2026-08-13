# Liam Supervisor Production Rollback Runbook

目標：事故發生後 5 分鐘內確定回退目標；不修改任何正式資料。

## 0–1 分鐘：立即凍結

- 停止 feature enable、Pages、GAS、Native release query 更新。
- `hwrite=false`、`halfMonthMedia=false`。
- 禁止 Sheet cleanup、補值、registry 修改或 cache 掩蓋。
- 保存事故 release manifest、HTTP/body、時間與症狀。

## 1–2 分鐘：查 manifest

目前已知 recovery target：

| 層級 | 回退目標 |
|---|---|
| Web | `6f2b42d9c91ff9c6c573e6767525f93105b6a059` |
| Web semantic baseline | `94070e0becd289287dae76fb461d719a898cb8d5` |
| Private GAS | v29 |
| Patrol GAS | v53 |
| Service Worker cache | 新建 incident-specific cache name；不可重用事故 cache |
| Native | 通常不需更新；若 startup origin/path 未變，Pages recovery 即可 |

## 2–3 分鐘：先回 Backend

1. 只切換受影響的 GAS deployment 到 manifest 指定版本。
2. 不改 deployment ID，不改 Sheet，不改 Script Properties／Approved Device registry。
3. 先直接驗證 legacy website/action：KPI、台獎、Daily Report、`patrol.html`、班表、ptvisit、hread。
4. 如果 backend rollback 後仍失敗，**停止**；不得用 Pages rollback掩蓋 backend/source 問題。

## 3–4 分鐘：再回 Pages

僅在 backend legacy smoke 恢復後：

1. 以 recovery baseline 建立 normal revert commit；禁止 force-reset main。
2. 精確恢復 production App files，不修改 canonical KPI／award／patrol calculation。
3. Service Worker 使用新的 incident-specific cache name。
4. `app.html` assets 與 SW registration 使用新的相同 cache-bust。
5. 部署後逐檔 hash readback，確認線上資產等於 recovery commit。

## 4–5 分鐘：判斷 Native

- startup host/path 未變、Native 只載 remote Pages：**不需要 Xcode／重裝 App**；確認既有 startup URL 已回 recovery assets。
- 若 Native shell、host、path 或 navigation policy 被事故版本改過：回 manifest 的 Native commit，再走 build/sign/install Gate。
- 不能只為 cache query 變更就要求 Liam 重裝；先驗證 Pages cache-bust 與 SW claim。

## Recovery verification

- Private API、KPI、台獎、Daily Report
- Schedule、Patrol Summary、ptvisit、Half Month Read
- HTTP 404 = 0、non-JSON = 0、console error = 0
- transport failure 不得顯示假 0
- unauthorized 仍 fail-closed
- `hwrite` disabled、`half_media_upload` calls = 0

## 禁止事項

- 不刪除、補寫、搬移或重算 Sheet rows。
- 不修改 Approved Device registry。
- 不用 frontend hardcode 數字掩蓋 source／transport failure。
- 不以「頁面可開」取代正式正向讀回。
- 不建立 final pilot tag。
