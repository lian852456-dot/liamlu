# 給 AI 協作者的指示（Codex / Claude / 其他）

本專案由多個 AI 助手與 Liam 共同維護。開工前請依序閱讀：

1. **`CLAUDE.md`** — 專案架構、部署方式、踩過的坑（⚠️ 必讀，尤其是 GAS「存檔≠部署」與試算表欄位無聲丟失兩節）。內容對所有 AI 通用，不限 Claude。
2. **`docs/COLLAB-LOG.md`** — 跨 AI 協作日誌：各助手做過什麼、成功/失敗經驗、進行中事項。

## 協作規則

- **完成一項有意義的工作後**（新功能、修 bug、踩到新坑），在 `docs/COLLAB-LOG.md` 最上方追加一則紀錄，格式見該檔案開頭說明。
- **開工前先看日誌最近幾則**，避免重做別人做過的事、重踩已記錄的坑。
- 修改資料欄位時，務必照 `CLAUDE.md` 的「常用檢查清單」走完五步。
- GAS 相關改動（`gas/Code.gs`）本地無法測試（開發環境 proxy 封鎖 script.google.com），只能請 Liam 在瀏覽器開 `?action=debug` 等端點驗證。
- 密碼（GAS `PT_KEY`）只存在 GAS 編輯器裡，repo 只放 `CHANGE_ME` 佔位字，**不要 commit 真實密碼**。

## 溝通管道

三方（Liam + 各 AI）沒有即時群組，以下列方式異步協作：

- 這份檔案 + `CLAUDE.md`：長期規則與知識。
- `docs/COLLAB-LOG.md`：工作交接與經驗分享。
- GitHub Issue / PR 留言：針對特定改動的討論。
