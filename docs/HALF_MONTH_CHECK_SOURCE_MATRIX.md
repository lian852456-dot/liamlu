# Liam Supervisor App 1.2｜半月督導檢查 Source Matrix

- 盤點日期：2026-08-12
- 範圍：正式 `hread` read-only integration；不接 `hwrite`／`half_media_upload`，未部署。
- 正式頁面：`patrol.html` 的「半月督導檢查」頁籤。
- 正式後端：`gas/Code.gs`；私有媒體模組為 `gas/HalfMedia.gs`。

## Source matrix

| 功能 | 正式來源 | 欄位名稱 | 資料粒度 | read / write | 是否可直接沿用 | App 是否需要 mapping | fail-closed 規則 |
|---|---|---|---|---|---|---|---|
| 期間判定 | `patrol.html` `halfPeriod(date)` / `halfPeriodLabel(period)` | `date`, `period` | 一個檢查期 | pure read rule | 是 | 將 `H1/H2` 顯示為正式期別與日期範圍 | 缺 date 或 period 不顯示本期摘要，不由 App 猜期別 |
| 本期檢查明細 | GAS `hread` → `readHalfCheck()` | `checkId,date,period,month,store,inspector,item,result,note,improvement,evidenceNames,savedAt` | 一店／一半月／一題 | read | 是 | 篩選目前 month/period，僅採第 1–18 題 | 未授權、資料非陣列、店點／期別缺失即不顯示正式摘要 |
| 本期九店填寫進度 | 同一批 `hread.rows`；正式頁 `activeHalfRows()`、`renderHalfSummary()` | `store,item,result,date` | 一店／一半月 | read-derived | 是 | 非 blank 題數只顯示「18/18 已填」「n/18 已填」「尚未填」；異常另計 | 不建立 completed flag；未知 result 不得當符合或異常 |
| 題目清單 | `patrol.html` `HALF_ITEMS` + `ITEM_TEXT` | 題 1–18 | 題目 master | read-only code | 是 | mobile card label | 題數不是 18 或題目缺字時不提供可開始的正式表單 |
| 正式狀態語意 | GAS `halfResultToClient()`；前端正式 form | `ok`, `abnormal`, `na`, blank | 每題 | read/write semantics | 是 | `符合／異常／不適用／尚未填寫` | blank 不得當 abnormal；na 不得當異常；未知狀態不得轉成符合 |
| 缺失內容 | worksheet「缺失說明」 | `note` | 每題 | read/write | 是 | 異常卡原文顯示 | 空值不補寫、不摘要 |
| 改善說明 | worksheet「改善措施」 | `improvement` | 每題 | read/write | 是 | 異常卡原文顯示 | 空值顯示待改善，不自行產生內容 |
| 證據／Drive link | worksheet「證據檔案連結」 | `evidenceNames` | 每題可多附件 | read/write | 部分 | 正式值可能是 media JSON 或 legacy Drive URL；本輪僅定義 contract | 解析失敗只顯示有附件／不可預覽，不改寫原值 |
| 圖片／影片 | GAS POST `half_media_upload`；私有 Drive | `id,name,mimeType,viewUrl,previewUrl` | 每個附件 | write + read metadata | 本輪不可用 | 下一階段才接 upload／preview | 本輪不呼叫 upload；不得新增 Drive OAuth、相機或公開分享 |
| 督導姓名 | worksheet「督導」 | `inspector` | 一個檢查／每題重複 | read/write | 是 | 顯示歷史資料；本輪 Preview 不預填真人姓名 | 缺值顯示 `—`，不得從登入姓名猜測 |
| 店點 | worksheet「門市」；正式 `STORES` / `PT_STORES` | `store` | 一店 | read/write | 是 | 正規化 `台北` 前綴後對齊九店 | 未命中九店 allowlist 不併入九店摘要 |
| 檢查日期 | worksheet「檢查日期」 | `date` | 一個檢查 | read/write | 是 | 完成日顯示 | 非 ISO 日期不排序、不推算 |
| 建立時間 | worksheet「建立時間」 | 後端未獨立回傳 | 每題 | stored, not exposed by hread | 否 | contract 保留 `createdAt:null` | 不以 `savedAt` 冒充建立時間 |
| 最後更新時間 | worksheet「更新時間」回退「建立時間」 | `savedAt` | 每題 | read | 是 | 彙整採該檢查最大 `savedAt` | 無值顯示 `—` |
| draft / completed | worksheet「填寫狀態」；`hread` 未回傳 | Sheet 有「填寫中／已完成」，App read 無該欄 | 每題 | stored, not exposed by hread | 否 | 只以 18 題非 blank 數呈現「填寫進度」 | 不得宣稱 App 有 backend 正式完成狀態 |
| 歷史回讀 | GAS `hread` 讀取整張 worksheet | 全部 read fields | 跨月／跨期／跨店 | read | 是 | App 必須先依 month/period/store 篩選 | 不把其他期資料混入本期 |
| 同店同半月多筆 | `writeHalfCheck()` key = `YYYY-MM-H1/H2 + store + item` | `檢查期別,門市,項目` | 同店同半月每題一列 | write semantics | 是 | 視為同一期更新，不建立多次 session 列表 | 不以 `checkId` 將同一期重複列冒充多次檢查 |
| 正式寫入 | GAS `hwrite` → `writeHalfCheck()` | worksheet 16 欄 | 每題 | write | 本輪禁止 | 無 | Preview 的暫存／完成不得呼叫 `hwrite` |
| 授權 | POST `ptauth`，`ptAuthorized()`；Script Cache token | `key` 僅驗證當下、`token` 1800 秒 | session | auth | 是 | `hread` 沿用目前班表／巡店短效 session | 無 token顯示「請先解鎖班表／巡店」；過期沿用既有逾時 UX；不得放寬或另建 auth |

## Canonical 規則確認

正式 `patrol.html` 的 `halfPeriod(date)` 是 canonical 規則：日期日數 `<= 15` 回 `H1`，其餘回 `H2`；顯示語意為「上半月（1–15日）」與「下半月（16日–月底）」。App read model 以同一規則自動選當期，並允許 H1／H2 唯讀切換。

正式半月檢查固定採第 1–18 題。這和既有 `ptread` 巡店大盤的 33 題、題 14–17、題 18、題 19–33 規則是兩套資料，禁止混算。

## Read / write / auth discovery 結論

- Read：GET `action=hread&token=<short-session>`，回 `{status:'ok', rows:[...]}`。App 只將回傳 rows 在本機依正式 month／period／九店／題 1–18 篩選；沒有 server-side period filter。
- Write：GET/JSONP `action=hwrite&payload=...&token=...`；本輪未呼叫、未修改。
- Media write：POST `action=half_media_upload`；私有 Drive、單檔上限 25 MB；本輪未呼叫、未修改。
- Auth：POST `ptauth` 驗證既有督導通行碼後簽發 1800 秒 token，存在 `sessionStorage`；`hread/hwrite/half_media_upload` 均沿用此邊界。
- Worksheet：「半月督導檢查」，16 欄：檢查ID、檢查期別、檢查日期、門市、督導、項目、檢查結果、缺失說明、改善措施、改善期限、改善狀態、證據檔案連結、建立時間、更新時間、執行頻率、填寫狀態。
- Side-effect note：`hread` 目前呼叫 `getHalfCheckSheet()`；若 worksheet 不存在會建立空表。正式表已存在，但未來若要求「絕對零副作用 read」，需先另案把 read 改為只找表、找不到回 no_data。本輪不改 GAS。
