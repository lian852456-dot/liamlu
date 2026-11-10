# 正式金牌兌換：隔離接點候選（2026-11-10）

> **11/11 接續修復：** [北一二B 對照與核身修復](north12b-readonly-20261111/README.md)已完成28項隔離驗證。40個日結暱稱仍待確認；正式推送遭自動核准審查拒絕，等待本次發布明確批准。未部署、未啟用兌換。

> **2026-11-11 來源更正（優先於下文歷程）：** 使用者明確指定「北一二B 金牌明細」，排除部區金牌。下文 DepartmentGoldMonthly 接線僅保留為錯誤來源假設下的隔離候選，不得部署或用於本次兌換。正式唯讀讀回改以 `gold-medal.html` 的 `department_gold_access`／`north12b-public-gold/v1` 為準；詳見 [北一二B 唯讀驗收](PRODUCTION-READONLY-20261111.md)。核身修復候選仍未部署，兌換未啟用。
> 11/11 更新：使用者已確認以儀表板每位同仁的本月金牌為來源。已完成對應月淨金牌接線與核身政策修復候選，詳見 [最新驗證說明](connection-20261111/README.md)。以下 11/10 狀態保留作歷程；不再要求 Cassie 來源連結。正式功能仍未啟用。

目前僅完成候選實作與合成資料驗證。共用城市沒有載入本目錄，正式兌換仍關閉；本輪沒有正式扣帳、員工登入、原存檔修改或服務重啟。

## 固定規則與已完成項目

- 1 面金牌兌換 50 金幣，僅接受正整數。沒有金幣換金牌的入口。
- 月取得數與花費分離：可用量 = 取得數 − 既有外部支出 − 本接點有效扣帳；來源修正不足時顯示 deficit 並停止新扣帳。每日更新不補回已花金牌。
- 同一 requestId 綁定員工、原城市 UID、數量及方向。重送不重扣、不重發；修改原請求內容會拒絕。
- 來源扣帳後，獨立查回同一收據，才將城市錢包加幣、城市流水與交易狀態放在同一 SQLite 交易中提交。
- 超時保留待處理紀錄；取消先建立本地 REFUNDING，再由來源建立退款或取消墓碑，防止延遲扣帳。來源 DEBIT／REFUND／CANCEL 事件保留。
- 已發幣交易不能透過取消退款。僅尚未完成的交易可以取消，並查回來源退款結果。
- host-only `recoverPending()` 可在本人會話失效後續處理已授權扣帳；不會建立新扣帳。不確定或本地入帳失敗仍保留待處理狀態及錯誤，不能當成成功。
- 開關預設關閉；城市接點關閉時不建資料表、不改錢包。原有 wallet.gold、進度、家具與物品都不作為正式金牌來源。

## 模組與接點

| 模組 | 職責 |
|---|---|
| contract.mjs | 比例、方向、請求與收據驗證 |
| coordinator.mjs | 城市交易流程、入帳、取消、對帳、重啟續處理 |
| authority-ledger.mjs | 獨立來源帳本、原子扣帳、退款、月餘額投影 |
| transport.mjs | 固定 HTTPS 來源、伺服器憑證、來源身分核對；拒絕轉址 |
| city-adapter.mjs | 原城市 cookie／CSRF 與正式本人綁定同時驗證 |

城市預備路由：POST `/api/formal/gold-exchange`（gold、requestId）、POST 同路徑 `/resume` 或 `/cancel`（txId）、GET 同路徑 `/status?txId=...`。目前未掛載到共用城市。

來源預備路由：POST `/internal/city-gold/balance`、`debit`、`status`、`refund`。僅伺服器憑證可呼叫，預設關閉。HTTP 例外只供明確啟用的 127.0.0.1 測試。

## 正式接線仍須完成的條件

1. **權威來源轉接**：`readSnapshot`／`verifySnapshot`／`validateLease` 為必要依賴，目前只有合成 fixture。正式來源必須提供經本人權限篩選的員編、月份、可兌換取得數、既有支出、來源識別與版本；不能從遊戲暱稱或每日 personKey 推測員編。
2. **版本與金額口徑**：候選契約使用正整數遞增 revision 與 SHA-256；現有月金牌程式使用 UUID revision，不能直接強轉數字或自行把所有 medal 都當可兌換餘額。來源轉接必須明訂穩定版本排序、月取得與既有支出歸屬，避免同筆支出在 externalSpent 與 citySpent 重算。
3. **來源帳本部署與共用讀回**：候選 SQLite 帳本尚未安裝到權威金牌服務。正式報表／儀表板也尚未改讀扣帳後 available；在兩端使用同一來源帳本之前不能啟用。
4. **正式本人證明**：既有 owner bridge 的 principal／serverLease 須由權威服務驗證。只有員編的遊戲登入不能替代正式金牌本人驗證。本輪未更動任何登入規則。
5. **上線前驗收**：隔離環境接真實協定但不寫正式帳後，再核對故障續處理、服務監控與雙邊對帳；實體 iPhone Safari 與真人操作仍待驗收。

2026-11-10 唯讀核對 GitHub main：`gas/DepartmentGoldMonthly.gs` blob `82ecfea14e2c39297250eb279b73dd8e3cc1a64f` 有私有月快照、版本與發布收據；`gas/GoldDaily.gs` blob `18ef0f2e5b9f861231ab8a167252df57c2725ceb` 為獨立日結讀取。這兩檔並非本候選扣帳 API，GitHub 原始碼讀回也不代表目前 GAS 已部署同版。未呼叫正式金牌寫入 API。

## 測試與保護範圍

需 Node 24（使用 node:sqlite），在本目錄執行 `node --test tests/exchange.test.mjs`。Fixture 使用暫存的兩個新 SQLite 資料庫、合成 QA 員編及 localhost HTTP，結束後刪除暫存資料。城市 GameStore 從已保存的發布副本匯入，沒有開啟原城市資料庫。

13 組涵蓋：1:50 單向、併發與重送、斷線／重啟、原子入帳失敗、退款競態、每日更新／跨月／來源修正、偽造收據、本人證明撤銷、CSRF／來源權限、既有支出、退款回應遺失、預設關閉零建表、來源收據查回及 host recovery。

測試結果只支持候選協定與合成帳本行為，不代表正式來源已接通、原員工餘額已完成實帳對帳或實體 iPhone 已驗收。

## 後續啟用及回復原則

本輪不啟用。未來取得發布範圍後，先唯讀備份並核對兩世界、在來源側完成帳本與本人驗證，再小範圍開關上線。遇異常關閉新請求並保留帳本；依 txId 續查、續入帳或退款。**不得以還原整份舊資料庫處理單筆異常**，避免覆蓋同仁後續遊玩進度。已成功發幣交易不提供自動反向扣幣。

## 11/10 接續唯讀核對

詳見 [CONNECTION-READBACK.md](CONNECTION-READBACK.md)：已核對舊本人橋期限及 live info 拒絕、GitHub main 月淨金牌口徑，並新增 scoped-read 隔離 connector。新增 3 組聚焦測試證據在 `evidence/scoped-tests.tap`；與原 13 組分開記錄。正式接線仍因有效本人契約與 Cassie 實際來源未確認而關閉。
