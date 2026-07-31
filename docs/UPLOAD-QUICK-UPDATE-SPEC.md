# 戰報快速更新 規格

**建立** 2026-07-31（Claude）　**修訂** 2026-07-31 第二輪（需求校正）
**狀態**：**JSON 緊急更新雛形（測試版，未驗收）**　**分支**：`claude/quick-report-upload-feature-elyajz`

> ⚠️ 本檔第一版是補寫的：Liam 任務描述要求先讀本檔與 FILE-MAP，但兩檔在 repo、
> 所有分支與完整 git 歷史中都不存在。第二輪依 Liam 的需求校正重寫。

---

## 0. 功能定位（唯一有效的說法）

**目前完成的是「JSON 緊急更新雛形」，不是 Excel 上傳功能。**
任何文件或畫面都不得宣稱 Excel 上傳已完成。

### 一份必要的事實更正

Liam 說「目前完成的是 JSON 快速更新雛形」——大方向正確，但精確地說：

| 車道 | 檔案型別 | 解析方式 | 狀態 |
|---|---|---|---|
| KPI | `.xlsx` | **Apps Script 端**呼叫既有 `kpiCalcParseReport()` | **解析層已用真實 0730.xlsx 驗證通過**；寫入／發佈端仍未驗 |
| 台獎 | `.json` | `JSON.parse` + 快照結構檢查 | 雛形可用，**完全沒有 Excel 能力** |

證據：`report-upload.html:134` 的 `accept=".xlsx"`；`gas/Code.gs` 的
`data = kpiCalcParseReport(rawFile)`。

所以 KPI 的 Excel 路徑**不是不存在**，而是：
1. ~~從未用真實日報跑過~~ → **2026-07-31 已用真實 `0730.xlsx` 驗證解析層通過**（HANDOVER §6）；
   但**寫入／發佈端**仍未驗（雲端 Claude 無法呼叫 GAS，只有 Liam 能驗）。
2. **不是 Liam 要的架構**——需求是「瀏覽器本機讀取工作簿」，目前是伺服器端解析；
3. 因此**無法與未來離線版共用**，這是真正的缺口。

台獎則是徹底沒有 Excel 能力。**綜合結論：以「Excel 上傳未完成」對外表述是正確的。**

## 1. 已完成的 JSON 更新能力

- 台獎 `awardsBattle` 戰情快照 `.json` 上傳、驗證、預覽、確認、更新。
- 更新前備份正式 JSON；更新後讀回驗證；驗證失敗自動還原。
- 回復上一個成功版本（`report_upload_rollback`）。
- 員編白名單＋管理者密碼雙重驗證（前端擋一次，後端才是真的）。
- 稽核紀錄（帳號／時間／檔名／資料日期／結果／備份檔）。
- 版本狀態與防衝突判斷（§4）。
- 驗證未通過時正式資料一個位元都不會被改寫。

## 2. 尚未完成的 Excel 上傳能力

| 缺口 | 說明 |
|---|---|
| 台獎 Excel 解析 | repo 內無解析器、無樣本、無欄位規格。**不得猜測。** |
| 瀏覽器本機解析 | 目前 KPI 在 GAS 端解析，離線版無法共用 |
| 共用解析模組 | `report-file-reader` / `kpi-normalizer` / `phone-awards-normalizer` / `report-validator` 皆未建立 |
| `.xls` 支援 | 未支援。需先確認實際是否仍有 `.xls` 來源 |
| 真實樣本驗證 | KPI `_店點` 路徑已用 0730.xlsx 驗證；**`_明細` 主路徑與台獎仍無樣本** |
| 工作簿盤點能力 | 「先上傳、只看工作表與欄位、不解析」的盤點模式尚未做 |

## 3. 兩者之間需要增加的轉換層

```
目前：  瀏覽器 ──(整個檔案 base64)──▶ GAS ──kpiCalcParseReport──▶ 正式 JSON
                                        （台獎無此路徑）

目標：  瀏覽器 ──report-file-reader──▶ 工作簿物件
                        │
                        ├─ kpi-normalizer ───────┐
                        └─ phone-awards-normalizer┤
                                                  ▼
                                          標準化資料（StandardPayload）
                                                  │
                                          report-validator（共用驗證）
                                                  │
                    ┌─────────────────────────────┴──────────────┐
                    ▼                                            ▼
            原始 Excel → Drive 備份                    標準化資料 → 既有更新流程
                                                （report_upload_commit，不變）
```

轉換層要做的四件事：
1. **`report-file-reader`**：讀 `.xlsx`（必要時 `.xls`）→ `{sheetNames, rows}`，無副作用、不認得業務欄位。
2. **`kpi-normalizer` / `phone-awards-normalizer`**：工作簿 → 與現行 JSON **完全相同**的結構
   （KPI 必須輸出 `{meta, items, stores, persons}`，與 `kpiCalcParseReport()` 逐欄一致，否則 kpi.html 會壞）。
3. **`report-validator`**：現有 9 項驗證抽成純函式，網站版與離線版共用。
4. **傳輸協定**：改送「原始檔 + 標準化資料」兩者，GAS 端只做驗證與寫入，不再解析。

> ⚠️ **一致性風險**：新增瀏覽器端 normalizer 後，就會存在兩套 KPI 解析
> （GAS 的 `kpiCalcParseReport` 給 11:00 排程用，瀏覽器的給上傳用），
> 這與「不得複製出第二套解析邏輯」直接衝突。
> **建議做法**：先以同一份真實日報跑兩者，逐欄比對輸出完全一致，通過後
> 才讓 GAS 端改為「只接受標準化資料」，最終仍收斂為一套。**這是小榮要做的關鍵決策點。**

## 4. 防衝突設計（已實作）

### 版本狀態

指令碼屬性 `REPORT_UPDATE_STATE`，結構 `{kpi:{...}, award:{...}}`，每筆九個欄位：
`reportType`／`dataDate`／`source`／`uploadedAt`／`fileName`／`fileHash`／`operator`／`versionId`／`updateStatus`

`source` 值：`scheduled`／`onedrive`／`manual-upload`／`rollback`／`external-publish`

### 判斷規則（`reportVersionDecide_`）

| # | 條件 | 結果 | rule |
|---|---|---|---|
| 1 | 無版本紀錄 | 接受 | `first-version` |
| 2 | 資料日期較新 | 接受 | `newer-date` |
| 3 | 資料日期較舊 | **拒絕** | `older-date` |
| 4 | 較舊 + 手動來源 + force | 接受 | `forced-older` |
| 5 | 同日期 + 檔案雜湊相同 | 略過 | `same-hash` |
| 6 | 同日期 + 現版本為手動/回復 + 新來源為排程 | **拒絕** | `manual-wins` |
| 7 | 同日期 + 其餘 | 接受 | `same-date-replace` |

### 對 Liam 提問的直接回答

- **同日期如何決定新舊**：先比檔案雜湊（相同就不寫）；再比來源優先序
  （手動 > 排程）；同性質來源則後到者為更正版。**不以時間戳單獨決定**，
  因為排程時間必然晚於手動上傳時間，只看時間會讓排程永遠勝出。
- **舊日期是否拒絕**：是，一律拒絕。
- **使用者可否強制更新**：可以，但**只有手動來源**（`manual-upload`／`rollback`）
  且需在畫面明確勾選「強制覆寫」。排程即使誤帶 `force` 也無法寫入舊日期（規則 4 限定來源）。
- **11:00 如何避免覆蓋 10:55 的手動更新**：命中規則 6。排程略過、不寫入、寄一封
  `ℹ️` 通知信說明原因，正式資料維持手動上傳的版本。`KPICALC_LAST_IMPORT` 仍會更新，
  避免每天重複判斷同一個來源檔。
- **rollback 後排程如何處理**：回復會登記 `source='rollback'`，屬手動性質，
  因此同日期的排程檔會命中規則 6 被擋下，不會把剛回復的版本又蓋回去。
  只有**更新日期**的來源檔才能再次寫入。

### 刻意不擋的兩個入口

`kpiCalcPublish`（kpi.html 督導發佈區）與 `privateDashboardPublish`（Codex 每日管線）
**只登記版本、不硬擋**。理由：這兩條是外部/既有管線，改成硬擋會在無預警下讓它們失敗。
**要不要升級為硬擋是 Liam 的決定**，小榮不要自行改。

## 5. 尚缺少的樣本檔與欄位資訊

見 `UPLOAD-QUICK-UPDATE-HANDOVER.md` §需要的樣本。摘要：

- **KPI**：`_店點` 版本已由 `0730.xlsx` 驗證完成；**仍缺含 `_明細` 的版本**（`detail` 主路徑未驗）。
- **台獎**：完全沒有樣本，連工作表名稱都不知道。需要 1 份真實台獎 Excel
  ＋一份對應的 `phone-awards-battle-latest.json`（用來反推欄位對照）。
- **`.xls`**：需確認實際是否仍有此格式來源；若無，不做。

## 6. 已知限制

1. **寫入／發佈端仍未在正式環境驗證。** proxy 封鎖 `script.google.com`，只有 Liam 能貼碼／部署。
   測試為本機契約測試（50 項）與 Playwright route 模擬（28 項）。
   **解析層例外**：2026-07-31 已用真實 `0730.xlsx` 逐項驗證（見 HANDOVER §6），
   並因此修掉一個會擋下真實日報的店名比對 BUG。
2. **「更新既有 Google Sheet」目前是 `未執行`**：KPI 與台獎的正式資料都不在既有試算表裡，
   而是私有 Drive 的 JSON。詳見 FILE-MAP §同步盤點。
3. 台獎 Excel（§2）。
4. `.xls` 未支援。
