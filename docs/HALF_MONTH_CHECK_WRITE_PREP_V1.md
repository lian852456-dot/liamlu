# Liam Supervisor App 1.2｜半月督導檢查 Write Readiness V1

## 狀態與邊界

- 狀態：`PREVIEW / DESIGN ONLY`
- 分支：`feature/liam-supervisor-half-month-write-prep`
- 正式寫入：`NO`
- 正式部署：`NO`
- 本文件只凍結未來最小 `hwrite` 接線的 payload、驗證、更新、冪等與 rollback 要求；不得據此宣稱正式寫入已可用。
- 既有 `ptauth` 1800 秒 token、`hread`、worksheet「半月督導檢查」與 H1/H2 canonical 規則維持不變；不建立新 auth。
- `half_media_upload` 不在本階段，媒體／Drive 僅保留 UI placeholder，不呼叫上傳。

## 手機 Preview 現況

目前 App 已具備 18 題 card flow：`符合 / 異常 / 不適用`，只有「異常」展開異常說明、改善方式與媒體／Drive placeholder；底部顯示「已填 n / 18」。Preview 暫存／完成只存在頁面記憶體，正式 request 次數必須維持 0。

## V1 payload schema

```json
{
  "schemaVersion": "liam-half-month-write-prep-v1",
  "operationId": "client-generated-nonce-16-to-80-chars",
  "mode": "draft | complete",
  "date": "YYYY-MM-DD",
  "month": "YYYY-MM",
  "period": "H1 | H2",
  "store": "九店 allowlist 其中一店",
  "inspector": "既有正式督導識別",
  "items": [
    {
      "item": 1,
      "result": "ok | abnormal | na | blank-for-draft-only",
      "note": "異常說明原文",
      "improvement": "改善方式原文"
    }
  ]
}
```

禁止欄位：`token`、通行碼、client `savedAt`、任意 extra field、媒體 blob、任意 Drive URL。Token 必須在既有 auth transport 中獨立傳送，不進 payload、URL log 或 audit material。

## Validation

1. `date` 必須是有效 ISO 日期；`month = date.slice(0,7)`。
2. canonical period：1–15 日 `H1`，16 日–月底 `H2`；payload 不一致即拒絕。
3. store 僅允許：通化、酒泉、台北三創、萬大、六張犁、復興南、永吉、大稻埕、杭州南。
4. 題號只允許 1–18，單一 request 不重複。
5. `complete` 必須包含完整 18 題且每題是 `ok / abnormal / na`。
6. `draft` 可送 1–18 題；blank 只代表尚未填，不可轉成 abnormal。
7. complete 的 abnormal 必須同時包含異常說明與改善方式；原文保存，不摘要、不改寫。
8. ok / na 不得攜帶新異常欄位；由 client 明確送空字串清除已被使用者改掉的異常內容。
9. `note`、`improvement` 各上限 1000 字；不接受任意欄位。
10. Server 必須先驗證既有短效 token，再解析／驗證 payload，未授權 fail-closed。

純函式契約位於 `half-month-check-write-prep.js`；目前不由 `app.html` 載入，因此不會改變正式 runtime。

## Update semantics

- 沿用既有 business key：`YYYY-MM-H1/H2 + store + item`，同店同一期同題更新既有 row，不新增另一套資料。
- `checkId` 仍為 `date|store|period`，但不可取代 business key。
- server timestamp 是唯一正式時間；client 不可提供或覆寫 `savedAt`。
- 預備 adapter 只輸出既有 `hwrite` 可理解的欄位，不輸出 token、savedAt、媒體或任意欄位。
- 媒體欄位不由此 action 新增。既有正式附件保留語意必須在實作前以 fixture 驗證，不能用空 payload 覆蓋。
- `draft` 只更新 payload 中明確出現的題目；`complete` 是 18 題原子檢核後才允許逐題 update。

## Idempotency strategy（部署前必要，尚未實作）

1. Client 每次明確送出建立 `operationId`；重試沿用同一 ID。
2. Server 以 `operationId + canonical payload SHA-256` 建立短效 receipt。
3. 相同 operationId + 相同 digest：回原 receipt，不重寫 worksheet。
4. 相同 operationId + 不同 digest：固定拒絕 `idempotency_conflict`。
5. Business key 仍防止重複 row，但不足以避免重試改動更新時間，因此正式部署前必須完成 receipt gate。
6. Audit 僅記 operationId 的去識別 digest、狀態、題數與 server time；不得記 token、通行碼、原文、姓名或媒體連結。

## Token / authorization

- 沿用 `ptauth` 簽發的 1800 秒短效 token與 `ptAuthorized()`；不新增帳密或 localStorage token。
- 未帶、錯誤或逾時 token：在任何 worksheet 操作前拒絕。
- App 顯示既有「班表／巡店授權已逾時，請重新驗證」，不得靜默重放。
- Passcode 只存在輸入當下，不進 payload、Git、log、URL 或 storage。

## Rollback plan

1. 未來正式改動必須使用獨立 GAS deployment 與獨立 Pages release commit。
2. Deploy 前記錄前一 GAS deployment ID、Pages commit、worksheet row count 與非敏感 schema hash。
3. 任一 auth／validation／idempotency Gate 失敗：Pages 回退前一 release、GAS 流量切回前一 deployment。
4. 不刪除、不重建「半月督導檢查」worksheet；不修改既有巡店明細與班表。
5. 若已寫入部分 rows，只能依 operation receipt 精確列出影響 business keys，經 Liam 另行授權後處理；不得批次猜測回復。

## Mocked Gate

- strict schema / unknown-field rejection
- canonical H1/H2、九店、題 1–18 allowlist
- draft partial / complete 18 題 validation
- abnormal 說明與改善方式
- deterministic adapter / idempotency material
- token、passcode、savedAt、media 不進 payload
- App runtime 仍無 `hwrite`／`half_media_upload`
- GAS source 本分支零 diff

## 下一個正式 Gate（不在本輪）

只有 Liam 另行授權後，才可在獨立實作分支新增 server-side strict validation、receipt idempotency、mock integration、TEST deployment 與真人驗收。完成以前不得 merge main、不得部署 GAS／Pages、不得呼叫正式 `hwrite` 或 `half_media_upload`。
