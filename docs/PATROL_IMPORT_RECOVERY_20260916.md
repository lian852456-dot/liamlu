# 巡店匯入預檢相容修正 2026-09-16

## 證據與界線

- 使用者截圖為 unknown patrol action；未呼叫 ptwrite。貼文字與選檔均共用 ptdetail Server Preflight，不能將它判成ptwrite缺失或檔案格式錯誤。
- 最新main基線29b9e39，獨立fix/patrol-import-post-20260916工作樹。正式Pages patrol.html與基線逐位元一致。
- 正式Deployment仍v9；無token POST ptdetail回AUTH_TOKEN_MISSING，證明現行路由存在。正式Chrome合成7月單筆預覽在正常session重驗後PASS，未按確認寫入，隨後reload清除候選。
- 未重現使用者電腦當時unknown action，無法確定當時頁面版本、請求method與實際回應路由；不宣稱已確定基礎設施根因。

## 修正

- 僅ptdetail POST明確unknown action時，回退同一Deployment既有GET路由一次。仍需相同session、月份／店點與完整分頁比對；不跨後端、不忽略錯誤、不繞過preflight。
- 回退與HTTP/network重試共用最多3次request預算；AUTH不回退、寫入不回退或自動重送、GET仍unknown即失敗。
- 失敗訊息增加Server Preflight ptdetail識別。診斷仍只保留安全欄位，URL去query/hash。
- GAS未修改，無正式資料新增修改刪除。正式v9備份沿用本日private-backups/patrol-app-unknown-action-20260916/editor。

## 驗證

- Node27/27，Chromium貼上／選檔／去重／write-readback合成回歸11/11，語法與diff檢查PASS。
- 正式匯入前只讀預覽PASS；實際使用者報表匯入與寫入尚待本人重新操作確認。
- rollback：revert本次功能commit並發布Pages；GAS維持v9。

## 發布

- 功能commit debe754已進origin/main。Pages 2026-09-16 16:33:06 built，正式patrol.html與提交逐位元一致。原報表的實際匯入仍待使用者重新操作確認。
