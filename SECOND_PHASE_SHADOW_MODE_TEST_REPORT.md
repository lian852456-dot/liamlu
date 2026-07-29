# 第二階段 Shadow Mode 測試報告

- 執行日期：2026-07-29（Asia/Taipei）
- 分支：`fix/daily-automation-minimal-guard-20260729`
- 基準：`4b1c2827aa388b3836845bf6a667362e990e8aa5`
- 模式：`AUTOMATION_GUARDS_MODE=shadow`
- 邊界：只讀取既有來源與產物，只寫入 repo 內已忽略的 `test-output/`；未修改或執行正式自動化。

## 結論

Shadow Mode 防呆的測試骨架已完成。功能旗標預設為 `off`，第二階段只接受 `off` 或
`shadow`，傳入 `enforce` 會直接拒絕。正式 runner、`gas/Code.gs`、正式 Trigger、
OneDrive／Google Drive 路徑、來源優先順序、Outlook 及私人網站發布流程均未修改。

七日 Golden Comparison（2026-07-23 至 2026-07-29）完成 42 個既有正式來源／產物
hash 前後比對，變更數為 0。九店、40 人、KPI／加掛結果、台獎 10 項、報表文字、
圖卡及附件清單的既有資料均通過語意檢查。測試沒有重新產生或覆蓋任何業務輸出。

## 日期三欄位

| 執行日 | executionDate | sourceFileDate | reportEndDate | 判定 |
|---|---|---|---|---|
| 2026-07-23 | 2026-07-23 | 2026-07-23 | 2026-07-22 | 正常模式 |
| 2026-07-24 | 2026-07-24 | 2026-07-24 | 2026-07-23 | 正常模式 |
| 2026-07-25 | 2026-07-25 | 2026-07-25 | 2026-07-24 | 正常模式 |
| 2026-07-26 | 2026-07-26 | 2026-07-26 | 2026-07-25 | 正常模式 |
| 2026-07-27 | 2026-07-27 | 2026-07-27 | 2026-07-26 | 正常模式 |
| 2026-07-28 | 2026-07-28 | 2026-07-28 | 2026-07-27 | 正常模式 |
| 2026-07-29 | 2026-07-29 | 2026-07-29 | 2026-07-28 | 正常模式 |

`0729.xlsx` 的實際 Drive file ID 依 2026-07-29 GAS 執行證據為
`15YxVEjtGBsRPIY4NzOsZaJWquSWnupbS`。其餘六天本階段只有本機唯讀檔，測試 ledger
明確使用 `TEST-LOCAL-*` 替代 ID，不冒充正式 Drive file ID。

日期判斷不要求三者完全相等。`reportEndDate` 比 `sourceFileDate` 早一天會記錄為目前
正常模式；週末、假日或延遲只警示。未來日期、資料日期倒退、同一結算日 hash 改變、
超出歷史落差或無法解析內容日期會標為高風險，但 Shadow Mode 的 `blocking` 仍為
`false`，不改變正式流程結果。

## 階段狀態與來源檢查

已建立並測試：

- 階段：`SOURCE_FOUND`、`SOURCE_VALIDATED`、`REPORT_GENERATED`、
  `IMAGE_GENERATED`、`WEBSITE_STAGED`、`EMAIL_PREPARED`、`EMAIL_SENT`、
  `DELIVERY_VERIFIED`、`COMPLETED`。
- 結果：`WAITING_FOR_SOURCE`、`VALIDATION_WARNING`、`VALIDATION_FAILED`、
  `PARTIAL_FAILURE`、`NON_RETRYABLE_FAILURE`。
- 只有八個必要階段全數完成且沒有失敗結果，才會衍生 `COMPLETED`。
- `unsupported call` 的 `failureClassification` 是 `NON_RETRYABLE_FAILURE`，整體
  `outcome` 是 `PARTIAL_FAILURE`，不會出現 `COMPLETED`。
- 缺檔、同日多檔、空白檔、缺必要欄位、筆數不足與來源 hash 未前進均有獨立測試。
- 所有驗證在本階段只記錄，不阻擋或改寫正式流程。

## Idempotency

測試 batch ID 以以下四項的 canonical JSON 取 SHA-256：

1. `reportEndDate`
2. `sourceFileId`
3. `sourceModifiedTime`
4. `sourceSha256`

檔名不參與 batch ID；同一檔案重新命名後 batch ID 不變。測試 ledger 可讀回報表、
圖卡、網站 staging、Email payload、寄送及完成階段。相同 batch 的 mock Email
第二次呼叫會回 `DUPLICATE_SKIPPED`，connector 實際呼叫次數維持 1；相同 batch 的
測試網站第二次發布也會回 `DUPLICATE_SKIPPED`。

## Outlook 與 pending-delivery

- `unsupported call` 分類為 `NON_RETRYABLE_FAILURE`，只呼叫一次、重試 0 次。
- timeout、connection reset、rate limit、temporarily unavailable 才分類為暫時性錯誤。
- fake timer 已驗證 60,000／180,000／300,000 ms 三段等待；沒有真的等待。
- 成功回應若沒有 `messageId` 或 `deliveryReceipt`，不標記 `EMAIL_SENT`。
- 測試 pending 路徑為
  `test-output/pending-delivery/YYYYMMDD/<batchId>/`，包含
  `manifest.json`、`email-payload.json`、`error.json`、測試附件、測試圖卡、
  建立時間、錯誤分類、已完成／未完成階段、`retryCount` 與 `batchId`。
- Token、password、secret、API key、authorization、credential、PAT 欄位會改寫為
  `[REDACTED]`。
- 全部使用 mock connector、`.invalid` 測試收件地址及 `[TEST]` 主旨，沒有呼叫正式 Outlook。

## 網站 staging 與 last-known-good

測試資料夾已模擬 JSON 損壞、缺欄位、空資料、build 失敗、複製中斷與相同 batch
重複發布。每一個失敗案例後，`current.json` 與 `last-known-good.json` 仍保持上一份
有效測試快照；成功案例才以暫存檔 rename 模擬切換。測試沒有讀寫正式網站輸出路徑。

## Golden Comparison

- 日期：2026-07-23 至 2026-07-29，共 7 天。
- 固定 hash：每日本機來源 xlsx、英文報表 xlsx、主力 KPI 圖、加掛圖、每日戰報文字、
  台獎文字，共 6 × 7 = 42 個。
- 結果：42/42 前後 hash 一致，變更 0。
- KPI：每天九店資料存在，整體 KPI 與加掛結果文字可解析。
- 人員：每天 `rows=40`，分類人數加總 40。
- 台獎：每天 `phone_items 檢查：10`，台獎文字與 payload 內容一致。
- 報表文字：每日／台獎 Email body 與 M+ 已準備 payload 逐字一致。
- 圖卡與附件：既有檔案大小均大於 0，hash 前後一致。
- 網站 JSON：本機目前只取得 2/4 份 private latest JSON，兩份 hash 前後一致；
  public latest JSON 與七天逐日網站快照不存在，因此此項為「無法完整 Golden Comparison」。

Golden 詳細證據由測試產生在
`test-output/TEST_20260729_2026-07-29T08-42-31-062Z/golden-comparison.json`，
該路徑已由 `.gitignore` 排除，不會提交私有內容。

## 測試結果

| 項目 | 指令／方式 | 結果 |
|---|---|---|
| Shadow 單元／整合 | `node --test shadow-tests/automation-guards.test.mjs` | 12/12 |
| Golden Comparison | `AUTOMATION_GUARDS_MODE=shadow node shadow-tests/run-shadow-golden.mjs` | 7/7；42/42 hash |
| 既有 Node 契約 | `node --test tests/gas-date.test.cjs tests/gas-media-contract.test.cjs` | 4/4 |
| 既有 Playwright | `npm test`（指定既有 Chromium） | 44/44 |
| 正式首頁唯讀 HTTP | `curl https://lian852456-dot.github.io/liamlu/` | 200 |

## 下一次自然 Trigger

本報告完成時仍是 2026-07-29，今日 11:00～12:00 的自然執行已在 Drive API 修復前
發生；下一次自然 Trigger 是 2026-07-30 11:00～12:00 GMT+8，目前尚未發生。
因此「來源選取、xlsx 轉換、九店資料、通知信、Drive API 錯誤與錯誤率」均列為
待自然執行後唯讀驗證。本階段沒有人工執行 `kpiCalcAutoUpdate`、沒有重建 Trigger，
也沒有因歷史 100% 錯誤率採取變更。

## 建議與未解風險

可供 Liam 後續考慮的最小部署範圍只有：以預設 `off` 的 feature flag 引入日期、
來源及分階段 Shadow log；正式整合前仍應先完成 2026-07-30 自然 Trigger 唯讀驗證，
並另做正式 runner 的最小整合差異審查。

目前不建議部署：`enforce`、正式 ledger、正式 pending-delivery、自動網站切換、
Outlook retry／替代寄件人或任何 GAS／Trigger 變更。未解風險如下：

1. 缺少七天逐日網站 JSON 快照，網站 Golden Comparison 不完整。
2. 07/23 至 07/28 沒有可核對的正式 Drive file ID，測試只使用明示的本機替代 ID。
3. 正式 Outlook connector 與私人網站未測；這是本階段刻意凍結，不代表正式交付已驗證。
4. 下一次自然 GAS Trigger 尚未發生。
5. 本分支尚未與正式 runner 整合；目前結果只證明測試模組行為與既有產物不受影響。

## 凍結確認

本次未修改正式 Trigger、未切換正式資料來源、未寄送至正式收件人、未執行正式部署、
未發布正式私人網站、未啟用 enforce mode、未合併或 push 至 main。
