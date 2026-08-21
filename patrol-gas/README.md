# Patrol GAS（獨立後端）

此目錄只部署巡店、巡店到離店、半月督導檢查、班表與半月媒體 route。它刻意不含 Audit、KPI、回報上傳或私有戰情程式。

`PatrolCode.gs` 由 `npm run build:patrol-gas` 從目前 Patrol 函式生成；每次產生都會拒絕包含 Audit 或其他非 Patrol route 的內容。

新專案必須在其自己的 Script Properties 設定 `PT_KEY`。`PATROL_SESSION_SIGNING_KEY` 會於首次 session 簽發時在新專案內產生，不與舊服務共用。

目前正式 Patrol Web App 是 v4，audience 為 `patrol-isolated-v1`。部署網址由 `patrol.html` 的 `PATROL_GAS_URL` 唯一指定；不要將 Audit 端點、Audit token 或任何 Audit route 加進此專案。

`.clasp.json` 僅供本機部署設定，刻意不納入版本控制。
