# 現有接點唯讀核對（2026-11-10）

## 結論

找得到既有本人核身橋、月金牌來源讀取與候選城市金牌 scoped-read，但沒有可直接啟用的有效扣帳接點。本輪沒有部署、真人登入或正式餘額異動。

### 本人核身：具體阻擋

- 共用城市 `runtime/employee/staff-owner-binding.mjs` 的 `CITY_OWNER_DEADLINE` 為 `2026-10-31T15:59:00.000Z`（台北 10/31 23:59）。`principal()` 先經 `city()`／`gate()`，目前日期會先拒絕 `OWNER_PREVIEW_EXPIRED`。
- 對既有 owner 服務僅送無憑證、無員編的 `city_owner_info` 唯讀請求，HTTP 200 回 `{status:error,code:CITY_OWNER_DENIED}`。證據：`evidence/owner-info-readback.json`。泛化錯誤本身不能證明遠端也因期限而拒絕；期限是本機已發布程式的獨立確證。
- 不可解讀為「再登入一次就一定好」。需要原本人服務提供有效的城市核身契約（含期限、試點範圍及撤銷驗證），再由本人正常驗證。這輪沒有延長期限、刪除檢查、借用員編登入或匯出原 B token。

### 金牌來源：確定存在的兩條路

| 接點 | 可以證明的內容 | 尚不能當成的內容 |
|---|---|---|
| `departmentGoldMonthlyRead_` / `DepartmentGoldMonthly.gs` | 私有月快照、月份、員編列、版本、來源 hash、發布收據 | 累計總取得與既有支出完整分帳；城市扣帳服務 |
| `north12bGoldDailyRead` / `GoldDaily.gs` | 受 `north12b_gold_read` 保護的獨立日結讀取 | 與月金牌同一來源、可直接推定的員編與正式兌換額度 |
| `CityGoldScopedRead.gs` / `CityGoldScopedRuntime.gs` | 本機候選：owner lease 驗證後按本人員編與月份過濾，來源淨額扣 spent 加 refunds | 已註冊、已部署或覆蓋所有同仁的正式 action；累計總取得證明 |

GitHub main 本輪唯讀 blob 證據：
- `gas/DepartmentGoldMonthly.gs`: `82ecfea14e2c39297250eb279b73dd8e3cc1a64f`
- `gas/GoldDaily.gs`: `18ef0f2e5b9f861231ab8a167252df57c2725ceb`
- `department-gold-monthly-core.js`: `d259b41c2072423ad9753754b75a44e565b87d5c`。第 115 行註明僅採全員主表淨金牌，活動欄／PK／SPE不額外計算。`records[].medal` 不能無證據改名為 gross earned。

上述 main 檔案不代表目前 GAS 部署版本。舊候選文件記錄 10/28 v19／v77，只屬歷史證據。本輪未把它們當現行部署，也未對正式業績程式作修改。

候選 scoped-read 來源位置：`worktrees/north12b-city-20261021/prototypes/city-v43-photo-homes-20261026/formal-gold/CityGoldScopedRead.gs` 及 `CityGoldScopedRuntime.gs`。其中 `grossAcquired:null`、`grossHistoryVerified:false`、`formalWritesEnabled:false` 是明示契約。現有試點名單與 current-guests 世界限制也不能無批准擴張。

## 本輪可完成的隔離接線

新增 `scoped-read-connector.mjs`，承接既有 `city-gold-source/v1` 格式：
- 正常 owner 證明前後各驗一次；按來源本人員編核對，不接受瀏覽器傳入 employeeId。
- 驗證來源版本、hash、收據及 `available = sourceNet − spent + refunds`；對不同使用者分開讀取版本。
- 同一資料物件可供城市與儀表板顯示，保留 sourceNet 與 available 的差異；本輪尚未接兩端 UI。
- 此淨額契約不能提供 exchangeSnapshot：會明確拒絕 `NET_SOURCE_IS_NOT_EXCHANGE_ENTITLEMENT`，不產生假的可扣帳授權。
- 3 組新增聚焦測試通過：刷新 20／5／15 不補回、來源／身分錯誤與 I/O 後撤銷拒絕、實際已保存 owner 模組在目前日期失效。原 13 組兌換測試證據保留，不重跑無關城市測試。

## 需取得的精確資源

1. Cassie 實際更新的金牌來源文件或頁面連結，以及該來源是否包含已花費金牌／是否為淨額。已向使用者詢問；不能以名稱相似自行選月報或日結。
2. 原員工服務的有效城市核身接點／契約更新；現有期限已過。取得可行更新範圍後才能製作部署候選，不先移除原檢查。
3. 確定來源後，讓金牌服務與儀表板共讀同一扣帳帳本，核對 source-only 更新與 ledger-only 更新都會使讀取版本改變。未完成此步仍維持兌換關閉。
