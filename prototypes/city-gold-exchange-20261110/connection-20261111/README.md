# 儀表板本月金牌與核身橋：11/11 隔離驗證

使用者已確認：以目前儀表板各同仁的「本月金牌」為來源，先驗證，不能動原餘額與進度。此確認取代 11/10 尚待 Cassie 來源連結的問題。本目錄及本輪修改均未被共用城市載入、未推送 GAS、未改原資料庫。

## 確定來源及處理方式

GitHub main 唯讀路徑：`department-ops.html` → `department-gold-monthly-ui.js` → `department_ops_read` → `departmentGoldMonthlyRead_` → 私有月報 registry。

- 前端按員編彙整，每月欄位是該月份 `records[].medal`，`total` 是多月加總。候選只選台北時區當月，不能把季合計當本月。
- 來源是月淨金牌。保留 `sourceNet`，不冒充 gross earned；原月數值、來源 hash、月份與歷史資料不寫回。
- 新來源 adapter 承接完整 `department-version-read/v1` / `north12-monthly-v2`，只取原本人證明對應員編。每次完整讀取，不沿用原來源的 knownVersion。
- 原 UUID 來源版本不強轉數字；在隔離帳本保存版本對照與歷史，拒絕已見過的舊版本重播。
- 既有支出需要明確來源與收據，並明確排除本接點帳本的支出，不能預設為零或重複扣除。即使來源版本提高，也不能把已驗證的外部支出調低；外部退款須另有可去重的退款收據契約，本候選尚未開放該種退款，拒絕直接覆寫支出。
- 城市和儀表板投影共用同一來源帳本讀回。`projectMonthlyRow` 保留 `medal`，另給 `availableMedal`；readVersion 包含來源、支出及事件，扣帳／退款也會使版本更新。本輪未改正式 UI。
- 支援負數來源修正：保留負淨額，顯示可用 0 與 deficit，停止新兌換；不補回消費，不追扣既有遊戲資產。

核對的 main 原始碼：`DepartmentGoldMonthly.gs` blob `82ecfea14e2c39297250eb279b73dd8e3cc1a64f`；月報 core blob `d259b41c2072423ad9753754b75a44e565b87d5c`。這是 GitHub source 證據，不代表當前 GAS 部署或私有當月數值已真人驗收。

## 核身橋修復候選

`owner/CityEmployeeBridge.gs` 與 `owner/staff-owner-binding.mjs` 以現有模組作最小修改，保留原 allowlist、世界、正常 B-session、裝置、撤銷、店別、角色所有權檢查。

- 移除寫死的 10/31 日期，改為必要的 server-owned `readPolicy`。沒有有效政策就拒絕；沒有客端延期或免核身參數。
- 政策包含 id、單調遞增 generation、enabled、notBefore、validUntil。兩端持久保存最高 generation 及完整 fingerprint；禁止回滾版本、重用同代修改日期或啟用狀態。刪除已存在政策會標記撤銷，不能藉恢復原政策復活憑證。
- 每份 lease 另綁政策 fingerprint，最長 30 分鐘，且不超過原本人會話或政策期限。過期須本人正常驗證後重新 handoff。
- 舊綁定保留原員編、世界、UID、created_at；沒有新政策證明時只要求重新驗證，不清存檔、不另建角色、不再次觸發首次綁定效果。
- 修改目前啟用政策必須提高 generation；每次發布或停用都需使用新 generation，回復程式也不能還原政策 guard 或舊憑證。
- `PolicyRuntime.gs` 僅提供伺服器政策讀取 hook；需要在原 factory 加入 `readPolicy:cityOwnerPolicyRead_`。沒有新增公開政策寫入 API。範例檔預設關閉，不代表已批准的正式期間。
- GAS 的 `withLock` 必須使用現有可重入 `privateDashboardRosterTransaction_`；本機 guard 使用 SQLite 原子條件更新。未建立第二套密碼登入。

## 驗證範圍

新增 7 項核身測試：過舊期限仍可按新政策正常驗證；30 分鐘到期續綁；政策輪替／停用；原會話撤銷及 epoch；舊綁定續用 UID；政策回滾／同代改寫拒絕。另以真實 GameStore 實作建立合成存檔，比對全部原資料表，續綁後原錢包、物品、進度與收據不變。

新增 6 項月來源整合測試：本月精準選取、1→50 HTTP 扣帳／入帳／對帳與相同投影、負數修正、既有支出未知／員編重複拒絕、UUID 舊版重播拒絕、來源 I/O 期間撤銷。另回歸原 13 項交換及 3 項舊 scoped-read 合約測試，總計 29 項。

測試使用合成員編／金額及臨時 SQLite，不讀真實金牌餘額，不開啟共用城市原資料庫；localhost HTTP 只連測試伺服器。正式 exchange remains disabled，反向兌換不存在。

## 尚待正式前驗證

1. 正常部署管理讀回確認既有 GAS 正在運行的版本與所需 hook；目前只有 main 與歷史 owner 原始碼，不以舊 v19/v77 冒充現行版。
2. 在原私有來源服務內接 `readProtectedMonthly`（原 session 權限保留）、`readExternalSpending` 與 `verifyOwner`。若確認沒有舊正式消費，仍須由權威服務產生可核對的零支出證明，不靠瀏覽器或城市猜測。
3. 將政策候選套用到原核身服務和城市兩端，經本輪以外的部署範圍確認後，啟用有限期間；本人再正常驗證。此輪沒有修改正式啟用期限。
4. 正式讀回須核對本人當月值與儀表板一致，且沒有扣款或發幣；再驗交易接口。iPhone Safari 真人流程尚未驗收。

因此本輪交付是可審閱、可執行的隔離修復與接線，不能稱正式核身已恢復或正式兌換已啟用。
