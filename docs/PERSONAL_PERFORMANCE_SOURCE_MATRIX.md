# PERSONAL PERFORMANCE SOURCE MATRIX

## 範圍

Liam Supervisor App 1.2 的「戰情 → 個績」只讀取既有 Approved Device 保護下的 `private_access.snapshot.kpiBattle.personal`。不新增 backend、不建立人工分數、不拿店 KPI 代替個績。

正式資料快照（2026-08-11 盤點）：資料日 `2026-08-11`、來源統計至 `2026-08-10`、40 人、9 店；姓名沿用正式遮罩值。

| 欄位名稱 | 正式來源 | 資料粒度 | 更新時間 | 是否可直接使用 | 是否需要 fail-closed |
|---|---|---|---|---|---|
| 員工姓名 | `kpiBattle.personal[].name` | 個人 | `kpiBattle.generated_at` | 是；維持正式遮罩 | 空值時不顯示該列 |
| 店點 | `kpiBattle.personal[].store` | 個人／店 | 同上 | 是；只做既有店名正規化 | 未知店名不混入九店 |
| 職級／類別 | `role`／`category` | 個人 | 同上 | 是 | 空值顯示 `—` |
| 個人總績效／達成率 | `overall_rate` | 個人 | 同上 | 是 | 空值顯示 `—`；不補算 |
| 排名 | `rank` | 個人 | 同上 | 是 | 空值顯示 `—` |
| KPI DOD | `overall_rate_dod` | 個人 | 同上 | 是 | 空值顯示 `—` |
| 排名變化 | `rank_dod` | 個人 | 同上 | 是 | 空值顯示 `—` |
| A999 | `metrics.A999` | 個人 KPI | 同上 | 是 | 缺欄位不以店績替代 |
| A1399 | `metrics.A1399` | 個人 KPI | 同上 | 是 | 同上 |
| 好速 | `metrics.好速` | 個人 KPI | 同上 | 是 | 同上 |
| R999 | `metrics.R999` | 個人 KPI | 同上 | 是 | 同上 |
| R1399 | `metrics.R1399` | 個人 KPI | 同上 | 是 | 同上 |
| RT | `metrics.RT` | 個人 KPI | 同上 | 是 | 同上 |
| 其他正式個人 KPI | `metrics.AQ`、`特維`、`配件`、`包膜` | 個人 KPI | 同上 | 是 | 只顯示來源存在項目 |
| 指標實績／目標／每日缺口 | 各 `metrics.*.actual/target/daily_target/daily_gap` | 個人 KPI | 同上 | 是 | 空值不推算 |
| 指標 DOD | 各 `metrics.*.dod` | 個人 KPI | 同上 | 是 | 空值顯示 `—` |
| 需要關注 | 正式來源未提供 | — | — | 否 | 固定顯示 `—`，不建立規則 |
| 個人完整 25 KPI | 正式來源未提供；目前為 10 項 | — | — | 否 | 不拿區／店 25 KPI 代替 |

## 顯示與排序規則

- 北一二B模式維持正式 `personal[]` 原始順序。
- 店點模式只做店點篩選，仍維持正式順序。
- 綠色／紅色只呈現正式總達成率或指標 rate 的 `>=100%`／`<100%`，不改數值、不建立新 score。
- 達標／未達標人數只按正式 `overall_rate` 的呈現門檻分類；`需要關注` 不等同未達標，因來源未定義而保持 `—`。
