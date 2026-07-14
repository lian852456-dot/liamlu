# 跨 AI 協作日誌

Liam、Claude、Codex（及其他 AI 助手）的共享工作紀錄。**新紀錄加在最上方**，格式：

```
## YYYY-MM-DD ｜ 作者（Claude / Codex / Liam）
- 做了什麼：
- 結果（成功 / 失敗 / 進行中）：
- 經驗 / 給下一位的提醒：
```

長期性的坑（會一再影響開發的）除了記在這裡，也請同步進 `CLAUDE.md` 的「踩過的坑」章節。

---

## 2026-07-14 ｜ Claude
- 做了什麼：巡店系統支援分享給其他督導——`gas/Code.gs` 新增 `PT_TITLE`/`PT_STORES` 設定，
  `ptread` 一併回傳；patrol.html 連線後套用該區標題與門市清單（沒回傳則用北一二B預設）；
  巡店網址改存獨立鍵 `bei12b_pt_gas_url`（相容回退舊的 `bei12b_gas_url`）。
- 結果：成功（28 tests passed）。
- 經驗 / 給下一位的提醒：**這次動了 `doGet`（ptread 回傳格式），Liam 的 GAS 要重新「部署新版本」
  才生效**。分享模式＝每位督導自建試算表＋GAS 部署（各改 SPREADSHEET_ID/PT_KEY/PT_TITLE/
  PT_STORES/NOTIFY_EMAIL），前端共用同一個 GitHub Pages 網址，資料實體隔離。

## 2026-07-13 ｜ Claude
- 做了什麼：建立跨 AI 協作機制——新增 `AGENTS.md`（Codex 會自動讀取）與本日誌檔；
  另開了 [Issue #11](https://github.com/lian852456-dot/liamlu/issues/11) 作為三方長期討論區（方向性討論到那裡，具體改動討論到各 PR）。
- 結果：成功。
- 經驗 / 給下一位的提醒：專案完整背景在 `CLAUDE.md`，別跳過「踩過的坑」章節。開工前掃一眼 Issue #11 的最近留言。

## 歷史經驗總結（2026-07 之前，由 Claude 整理）

### ⚠️ 台獎手機資料消失事件（三個問題疊加，詳見 CLAUDE.md）
1. 試算表標題列缺欄位時 GAS 寫入**無聲丟失**，不會報錯 → `getSheet()` 已加自動補欄位，但前端加欄位仍要同步 `gas/Code.gs` 的 `FIELDS`。
2. Google Sheets 把日期字串自動轉 Date 物件，字串比對永遠 false → 一律用 `toDateStr()` 轉換後再比。
3. GAS 編輯器「存檔」不等於「部署」——`doGet` 相關改動必須「管理部署作業 → 新版本」才生效；時間觸發器則相反，跑的是最新存檔、不需重新部署。

### 其他已驗證的做法
- 前端寫入走 JSONP（GAS CORS 限制）；巡店上傳每批依網址長度切分＋失敗自動重試（#6）。
- 巡店讀寫有通行碼 `PT_KEY`（#5），repo 只放佔位字。
- 未回報自動 Email 通知：`checkSegAndNotify()` 每天 16:20/21:20（#3）；知悉題月中提醒：`checkAwareAndNotify()` 每月 15 號（#10）。
- 開發環境 proxy 封鎖 script.google.com，GAS 端點只能請 Liam 用瀏覽器驗證。
- localStorage 有影子備份（`bei12b_shadow_*`），同裝置備援用，跨裝置仍靠 GAS。
