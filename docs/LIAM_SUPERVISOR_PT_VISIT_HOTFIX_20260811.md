# Liam Supervisor 巡店到離店 Hotfix 證據

日期：2026-08-11（Asia/Taipei）
範圍：只處理 `ptvisit_read`／`ptvisit_write` 與 App 巡店到離店 UI；本文件建立時尚未部署程式。

## 正式資料盤點

正式試算表：`北一二B每日回報`
工作表：`巡店到離店紀錄`（sheetId `632684822`）

清理前只有四筆資料：

| serverTime | action | store | note | 結果 |
|---|---|---|---|---|
| 14:57:50 | arrival | 台北通化 | `DEPLOY_TEST_20260811T145733` | deployment test |
| 14:57:53 | departure | 台北通化 | `DEPLOY_TEST_20260811T145733` | deployment test |
| 17:20:47 | arrival | 台北六張犁 | 空白 | 正式紀錄 |
| 19:51:16 | departure | 台北六張犁 | 空白 | 正式紀錄 |

- `酒泉` 全表搜尋結果為 0；因此不是 worksheet 有酒泉但 `ptvisit_read` 漏回。
- 兩筆 deployment test 經精確列確認後刪除；清理後 marker 搜尋為 0，六張犁兩筆仍在且 session 相同。
- 未新增或補寫任何酒泉紀錄。

## Apps Script 執行證據

正式 API 專案：`1SW9qr0CU9Xvy97XkVr3n51_4Dx_6GArnTXT8780t0HofIB74v9IDMkWf`，正式執行版本 48。

- 17:20:35 的 `doPost` 後接三個 `doGet`，符合 session restore + 三路 read；17:20:45 另有 `doPost`，對應 17:20:47 六張犁 arrival 落表。
- 17:45:04 的 `doPost` 後接三個 `doGet`，符合 session restore + read，沒有新增 visit row。
- 19:03:57 有一筆 `doPost`，但 worksheet 無新增 row。現行 Apps Script execution view 不保存 request body、action 或應用層 JSON response，程式亦未記敏感 payload；因此不能證明該請求收到 `store=酒泉`，也不能把它補成正式紀錄。
- 19:51:05 的 `doPost` 後接三個 `doGet`；19:51:15 另有 `doPost`，對應 19:51:16 六張犁 departure 落表。

可下的結論只有：酒泉沒有成功寫入 worksheet，亦沒有證據顯示 `ptvisit_read` 漏掉已存在 row。不能把 deployment test 的通化紀錄描述成酒泉 mapping 錯誤。

## Hotfix 行為

- 到店 selector 以 disabled `請選擇店點` 開始；未選店時 submit disabled，HTML validation 與 submit handler 均 fail-closed。
- 成功訊息只使用 server response 的 `event.serverTime`、`event.action`、`event.store`。
- server store 與明確送出 store 不一致時 UI 報錯，不顯示成功、不更新今日列表。
- 離店顯示 `目前在：店點`，store 鎖定，並驗證 server 回傳的 `visitSessionId` 與今日 open arrival 相同。
- `ptvisit_read` 預設只回台北當日、依 `serverTime` 排序、排除 `DEPLOY_TEST_` marker；worksheet 歷史保留。
- `openVisit` 只由當日正式 rows 計算；跨日未離店回傳為 `staleOpenVisit` 異常，不自動延續。
- deployment test 與正式 visit 各自隔離 open/duplicate 判斷，不互相阻擋。

## 未變更

KPI、台獎、個績、每日回報、班表、巡店 canonical calculation、auth、Approved Device、Signing、Bundle ID 均不在本次 diff。
