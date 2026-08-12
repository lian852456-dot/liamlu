# Liam Supervisor App 1.2｜半月督導檢查 Write Readiness V1

## 狀態與邊界

- 狀態：`PREDEPLOY / FORMAL TEXT WRITE INTEGRATION`
- 分支：`feature/liam-supervisor-half-month-hwrite-integration`
- 正式寫入：`NO`
- 正式部署：`NO`
- 本分支已完成既有 `hwrite` 的最小接線、server-side strict validation、寫後 `hread` 逐欄核對與本機測試；尚未部署，不得據此宣稱正式寫入已可用。
- 既有 `ptauth` 1800 秒 token、`hread`、worksheet「半月督導檢查」與 H1/H2 canonical 規則維持不變；不建立新 auth。
- `half_media_upload` 不在本階段，媒體／Drive 僅保留 UI placeholder，不呼叫上傳。

## 手機 Preview 現況

App 已具備 18 題 card flow：`符合 / 異常 / 不適用 / 清除（尚未填寫）`，只有「異常」展開異常說明與改善方式；媒體／Drive 欄位維持唯讀。Liam 必須明確按「+ 開始半月督導檢查」、選店並按「儲存目前進度」才會寫入；到店狀態只預選店點，不會自動開始或自動寫入。

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

禁止欄位：通行碼、client `savedAt`、任意 extra field、媒體 blob、任意 Drive URL。App 專用 `hwrite` 使用單次 POST，短效 token 與 18 題 rows 只存在 JSON body；URL query 不含 token、note、improvement 或 payload。既有 `patrol.html` JSONP hwrite 保持相容，未在本輪重構。

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
11. App POST 的 `result != abnormal` 時，`note` 與 `improvement` 必須都是空字串；App POST 不接受 `evidenceNames`、media 或其他附件 mutation。
12. App 一次送出完整 rows；server 必須在任何 worksheet 操作前完成全部 rows validation，再於 ScriptLock 內依 business key 更新。

純函式契約位於 `half-month-check-write-prep.js`；本 Predeploy 分支已由 `app.html` 載入，正式 main 尚未部署。

## Update semantics

- 沿用既有 business key：`YYYY-MM-H1/H2 + store + item`，同店同一期同題更新既有 row，不新增另一套資料。
- `checkId` 仍為 `date|store|period`，但不可取代 business key。
- server timestamp 是唯一正式時間；client 不可提供或覆寫 `savedAt`。
- 預備 adapter 只輸出既有 `hwrite` 可理解的欄位，不輸出 token、savedAt、媒體或任意欄位。
- 媒體欄位不由此 action 新增。既有正式附件保留語意必須在實作前以 fixture 驗證，不能用空 payload 覆蓋。
- `draft` 只更新 payload 中明確出現的題目；`complete` 是 18 題原子檢核後才允許逐題 update。

## Idempotency / update semantics

1. Client 每次明確送出建立 `operationId`，但既有 `hwrite` row contract 不儲存 operationId。
2. Server 以既有 business key `period + store + item` 更新同一列；ScriptLock 將競態寫入序列化，重複儲存不新增重複題目。
3. 本機整合測試已驗證重複儲存後仍為同一組 18 個 business keys，且不影響其他門市或另一半月。
4. 每次寫入後都重新 `hread`，逐欄比對 `period / store / item / result / note / improvement`；不一致即顯示失敗。
5. 本輪不新增 receipt worksheet、schema 或新 backend action。若未來需要網路層 exact-once receipt，必須另案設計，不得在本次最小整合中偷偷擴充 schema。

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
5. 若已寫入部分 rows，只能依該次 response、寫後 readback 與明確 business keys 列出影響範圍，經 Liam 另行授權後處理；不得批次猜測回復。

## Predeploy Gate

- strict schema / unknown-field rejection
- canonical H1/H2、九店、題 1–18 allowlist
- draft 18 題（包含 blank）validation
- abnormal 說明與改善方式
- deterministic adapter / business-key update semantics
- token、passcode、savedAt、media 不進 payload
- App 只在明確按「儲存目前進度」後呼叫既有 `hwrite`
- App `hwrite` 使用單次 POST body；token／payload／note／improvement 不在 URL
- 18 題不得切成多個 client chunks；完整驗證在任何 worksheet 寫入前完成
- `hwrite` 成功後必須完成正式 `hread` 逐欄核對才顯示「已儲存」
- `half_media_upload` request = 0
- GAS 只新增既有 `hwrite` row 的 strict validation、canonical store/date 與可靠日期輸出；未改 worksheet schema
- Node full suite：172/172 PASS
- Half-month formal read + hwrite Playwright：7/7 PASS（單次 POST、URL 無 token/payload、390×844、readback mismatch、重複儲存／隔離）
- 選定五頁籤回歸：17/18 PASS；唯一失敗為既有 `2026-08-11` ptvisit fixture 在 8/12 today-only 規則下被排除，依範圍不修改 ptvisit
- `npm audit --audit-level=moderate`：0 vulnerabilities
- 正式 `hwrite`／`half_media_upload` request：0

## 下一個正式 Gate

等待 Liam review 本 Predeploy diff。未取得另行部署授權前，不得 merge main、不得部署 GAS／Pages、不得呼叫正式 `hwrite` 或 `half_media_upload`；文字寫入實機 PASS 前，媒體上傳仍維持 0。
