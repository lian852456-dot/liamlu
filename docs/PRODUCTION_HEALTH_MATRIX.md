# Production Health Matrix

狀態：**READ-ONLY CONTRACT / NO DEPLOYMENT**

## 狀態定義

每個模組獨立產生一筆結果：

```json
{
  "module": "patrolSummary",
  "status": "PASS | FAIL | TIMEOUT",
  "checkedAt": "server/client timestamp",
  "latencyMs": 0,
  "httpStatus": 200,
  "json": true,
  "sourceStatus": "ok",
  "note": "de-identified message"
}
```

- `PASS`：transport 成功、JSON schema 正確、backend 明確 `status=ok`。
- `FAIL`：HTTP／non-JSON／schema／auth／source error。
- `TIMEOUT`：達到該模組獨立 timeout。
- 任何失敗的 `data` 必須為 `null`；不得轉成 `0`、`0/9`、`[]` 或 `no_data`。
- 一個模組 FAIL/TIMEOUT 不得覆寫其他模組結果。

## 模組矩陣

| 模組 | Backend / action | 唯讀成功條件 | 獨立失敗顯示 |
|---|---|---|---|
| Private API | Private / `private_access` | Approved Device 正向讀取成功 | 正式資料授權／讀取失敗 |
| KPI snapshot | Private snapshot | 9 店、正式 KPI snapshot schema 正確 | KPI 正式資料讀取失敗 |
| Award snapshot | Private snapshot | 9 店、正式 award schema 正確 | 台獎正式資料讀取失敗 |
| Daily Report | Private / `read`, `pread` | 指定日期／時段正式 source `status=ok` | 每日回報讀取失敗／逾時 |
| Schedule | Patrol / `sread` | 9 店 schedule schema 正確 | 班表讀取失敗／逾時 |
| Patrol Summary | Patrol / `ptsummary` | month、9 店摘要與 canonical fields 正確 | 巡店摘要讀取失敗／逾時 |
| ptvisit | Patrol / `ptvisit_read` | 台北當日 events schema 正確 | 到離店紀錄讀取失敗／逾時 |
| Half Month Read | Patrol / `hread` | month/period、九店 18 題 schema 正確 | 半月督導讀取失敗／逾時 |

## Legacy production smoke

Backend candidate dark deploy 後、Pages 切換前，必須以舊正式 frontend 驗證：

- KPI 網站
- 台獎網站
- Daily Report 網站
- `patrol.html`
- 班表
- `ptvisit_read`
- `hread`

未授權 fail-closed 測試只能證明拒絕路徑；不能取代既有 Approved Device／合法 patrol session 的正向讀取。

## 隔離規則

1. 各模組各自 request、timeout、retry、status 與 render。
2. 禁止以單一 `Promise.all` 的 failure 清空全站。
3. 已驗證舊資料若保留，必須標示「上次成功資料」及 timestamp。
4. 沒有 backend 明確 `status=ok`，不得顯示正式數值 0。
5. Health checker 不得呼叫任何 write action。
