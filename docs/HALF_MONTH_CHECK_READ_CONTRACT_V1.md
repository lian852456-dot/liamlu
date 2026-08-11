# Half-month Supervisor Check Read Contract V1

本契約是 Liam Supervisor App 1.2 的 formal read-only contract。正式 runtime 僅沿用既有 `ptauth` 1800 秒 token 呼叫 `hread`；表單按鈕仍只改頁面記憶體，不呼叫 `hwrite` 或 `half_media_upload`。

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
    "filledStores": 8,
    "totalStores": 9,
    "abnormalStores": 3,
    "abnormalItems": 5,
    "emptyStores": 1
  },
  "stores": [{
    "name": "酒泉",
    "fillState": "filled | in_progress | empty",
    "latestDate": "YYYY-MM-DD or empty",
    "answeredItems": 18,
    "totalItems": 18,
    "abnormalCount": 2,
    "pendingImprovementCount": 2,
    "updatedAt": "ISO-8601 or empty"
  }],
  "questions": [{
    "item": 1,
    "title": "督導駐點",
    "result": "ok | abnormal | na | blank",
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

1. period 沿用正式 `patrol.html` canonical rule：1–15 日為 H1、16 日至月底為 H2；App read model 只實作同一規則，不建立另一套業務判定。
2. 本期資料只接受同一 `month + period`，店點須命中正式九店清單。
3. 僅採正式第 1–18 題；`ok/abnormal/na` 都計入「已填」，blank 不計入。
4. 18 題皆非 blank 顯示「18/18 已填」；1–17 題非 blank 顯示「n/18 已填」；18 題全 blank 顯示「尚未填」。這是透明 completeness，不是 backend completed 狀態。
5. `abnormalItems` 是正式 rows 中該期 `result=abnormal` 的題數；不從文字推算。
6. `createdAt` 不得由 `savedAt` 冒充。現有 hread 未暴露建立時間時保持 null。
7. `draft/completed` worksheet 欄位未由 hread 暴露；App 不建立或宣稱正式 completed flag。
8. openVisit 只可用於店點預選與「目前在」提示，不會自動開始或建立半月檢查。
9. 正式 hread 值可載入手機 Preview 表單，但所有修改、暫存與完成只存在本地頁面記憶體，不得呼叫 `hwrite`、`half_media_upload` 或其他正式 write endpoint。
