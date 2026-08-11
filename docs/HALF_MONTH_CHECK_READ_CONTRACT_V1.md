# Half-month Supervisor Check Read Contract V1

本契約是 Liam Supervisor App 1.2 的 read-only 設計稿。正式 runtime 尚未接線；本輪 UI 使用醒目標示的 Preview fixture，所有按鈕只改頁面記憶體。

```json
{
  "status": "ok | partial | no_data | unauthorized | error",
  "updatedAt": "ISO-8601 or empty",
  "sourceUpdatedAt": "ISO-8601 or empty",
  "stale": false,
  "sourceLink": "patrol.html",
  "period": {
    "key": "H1 | H2",
    "month": "YYYY-MM",
    "label": "2026 年 8 月上半月",
    "dateRange": "8/1–8/15",
    "canonical": "patrol.html#halfPeriod"
  },
  "summary": {
    "completedStores": 8,
    "totalStores": 9,
    "abnormalStores": 3,
    "abnormalItems": 5,
    "pendingStores": 1
  },
  "stores": [{
    "name": "酒泉",
    "status": "completed | improvement | pending | in_progress | unknown",
    "completedAt": "YYYY-MM-DD or empty",
    "answeredItems": 18,
    "totalItems": 18,
    "abnormalCount": 2,
    "pendingImprovementCount": 2,
    "updatedAt": "ISO-8601 or empty"
  }],
  "questions": [{
    "item": 1,
    "title": "督導駐點",
    "result": "ok | abnormal | na | empty",
    "note": "formal original text",
    "improvement": "formal original text",
    "evidence": [{
      "id": "private Drive file id",
      "name": "file name",
      "mimeType": "image/* | video/*",
      "viewUrl": "private Drive URL",
      "previewUrl": "private Drive preview URL"
    }]
  }]
}
```

## Mapping invariants

1. period 必須由正式 `patrol.html` canonical rule 或未來 server read adapter 提供；App 不自行判斷日期區間。
2. 本期資料只接受同一 `month + period`，店點須命中正式九店清單。
3. 僅採正式第 1–18 題；18 題皆有 `ok/abnormal/na` 才能標示 completed。
4. 任一題 `abnormal` 的已完成店顯示 improvement；有資料但不足 18 題顯示 in_progress；完全無資料顯示 pending。
5. `abnormalItems` 是正式 rows 中該期 `result=abnormal` 的題數；不從文字推算。
6. `createdAt` 不得由 `savedAt` 冒充。現有 hread 未暴露建立時間時保持 null。
7. `draft/completed` worksheet 欄位尚未由 hread 暴露；正式接線前不得宣稱 App 使用該 canonical 欄位。
8. openVisit 只可用於店點預選與「目前在」提示，不會自動開始或建立半月檢查。
9. Preview 的暫存／完成不得呼叫 `hwrite`、`half_media_upload` 或任何正式 endpoint。
