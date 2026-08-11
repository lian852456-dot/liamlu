# Liam Supervisor App 1.2｜半月督導檢查 Formal Read 驗證

## 範圍

- Branch：`feature/liam-supervisor-half-month-formal-read-20260812`
- Baseline：`51ce311e00523b557f8aef272e845af6b6aa2290`
- Read：既有 `ptauth` 1800 秒 token → `hread`
- Write：未接 `hwrite`、未接 `half_media_upload`
- 部署：無

## Mapping Gate

- `ok` → 符合
- `abnormal` → 異常
- `na` → 不適用
- blank → 尚未填寫
- 18 題全非 blank → `18/18 已填`
- 1–17 題非 blank → `n/18 已填`
- 18 題全 blank → `尚未填`

以上只代表 18 題填寫進度，不代表 backend 正式 completed 狀態。

## 九店 fixture Gate

固定 fixture 驗證 9 店、18 題與正式 H1/H2 語意。預期摘要：18/18 已填 5/9、有異常 3 店、異常項目 4、尚未填 2 店。排序為尚未填、填寫中、18/18 有異常、18/18 無異常。

三種店況逐題驗證：

- 酒泉：18/18、無異常，題 18 為 `na`，不得計為異常。
- 台北三創：18/18、有異常，正式缺失／改善／媒體原文逐欄相等。
- 六張犁：5/18、有異常；其餘 13 題維持 blank，不得補值。

## Live formal readback

正式線上 hread 抽驗僅記錄去識別摘要與逐題相等結果；不將 token、通行碼、督導姓名、原始缺失文字或私有媒體 URL 寫入本文件。若既有短效 session 未解鎖或已逾時，狀態保持 waiting-user，不以 fixture 冒充正式讀回。

## Zero-write evidence

- 正式 action allowlist：read 包含 `hread`；write 仍只有既有 `ptvisit_write`。
- 半月頁進入、H1/H2 切換、店點展開、Preview 編輯、暫存與完成均不得產生 `hwrite` 或 `half_media_upload` request。
- Playwright 專項會攔截所有 request，正式 write requests 必須為 `0`。

## 已知既有測試債

既有 ptvisit fixture 固定日期 2026-08-11，在 2026-08-12 會被 today-only 規則排除。本輪依範圍只記錄，不修改 ptvisit fixture 或正式規則。
