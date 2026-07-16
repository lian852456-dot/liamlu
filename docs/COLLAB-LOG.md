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

## 2026-07-16 ｜ Codex（KPI／台獎權限與私有 Drive 串接）
- 做了什麼：`gas/Code.gs` 新增私有戰情 API 與名冊初始化：首次「員編＋0935」只建立待核准裝置申請，不回傳資料；管理者以獨立密碼核准後才會綁定一台裝置，改綁新裝置會使舊裝置失效。網頁 KPI／台獎頁籤已移除對 `private-data/` 的直接讀取，改為通過 Apps Script 驗證後才由私有 Google Drive 取回遮罩快照。新增名冊產生器與 `publish_private_dashboard_snapshot.mjs`，供 Outlook 寄件備份驗證後再同步當日網站資料。
- 結果：私有 Drive、啟用碼、名冊與管理者權限已設定，Web App 已更新部署；本機自動化仍須以安全方式提供管理者密碼後，才能在 Outlook 寄件備份驗證完成時自動發布當日快照。
- 經驗 / 給下一位的提醒：GitHub Pages 可公開，但不得含 KPI／台獎 JSON、名冊、員編或密碼。登入成功後也只顯示遮罩姓名；每日私有快照必須以 Outlook `寄件備份` 驗證成功為發布門檻。

## 2026-07-16 ｜ Codex（KPI戰情本機私有 MVP）
- 做了什麼：新增 `🏆 KPI戰情` 頁籤，提供店點總覽（KPI、公司排名、加掛、A999／A1399／好速／R1399）與店點全部KPI明細；個績排名支援店點／職類篩選。DOD 以當日相較前一天顯示：店點含 KPI、公司排名、加掛與各項指標；個人含總達成率與排名。KPI 明細新增「實績／月目標／100%日目標／差異」，以來源資料區間的最後一天計算日目標。新增 `🏅 台獎戰情`：督導獎金置頂、店長／督導預估、每店前三補量與 10 機款下一獎階；個績表加入個人台獎預估與獎金排名。日期回放移除 13:00，KPI／台獎手機字級與字重提高。
- 結果：成功。`update_phone_awards.py` 摘要新增完整 10 機款和個人台獎資料；`build_github_pages_data.py` 會產生私有 `kpi-battle-latest.json` 與 `phone-awards-battle-latest.json`。姓名遮罩且檔案被 `.gitignore` 排除，未提交至公開GitHub。Playwright 35項測試通過。
- 經驗 / 給下一位的提醒：正式公開版不可直接讀 `private-data/`；目前改由 Apps Script 驗證後從私有 Google Drive 讀取。
## 2026-07-16 ｜ Claude（新頁籤：KPI 達成與個績）
- 做了什麼：`index.html` 新增「🏆 KPI/個績」頁籤——上半：店點 KPI 達成進度條
  （區內均值/達標間數/公司排名，晚上 7 點後自動選 21:00）；下半：個績排行榜
  （主力四項 A999/A1399/好速/R1399＋合計＋個人KPI），可切「當日／月累計」。
  當日 21:00 記錄優先蓋 16:00；月累計逐日抓 `pread` 加總（7 天一批平行），
  KPI 取最新一筆、附回報天數。
- 結果：成功（Playwright 攔截 API 全流程驗證：排序/加總/天數/失敗提示皆正確）。
- 經驗 / 給下一位的提醒：過去日期的個人資料會快取進 localStorage（`perfDay_` 前綴），
  只有抓取成功（`ok`）才寫入，避免網路失敗把空資料存成永久快取；今天永遠重抓。
  月累計首次載入約 30~60 個 pread 請求，之後靠快取秒開。純前端改動，不用動 GAS。

## 2026-07-14 ｜ Claude（個人回報擴充 12 欄）
- 做了什麼：個人每日回報 6 欄 → 12 欄：新增 A1399/R1399（highlight＋badge）、
  提前續約、5G、手機保險（筆）、包膜保貼。R1399 納入 `PERSONAL_ITEMS` 未過關判定
  （對齊店點 21:00 零報攔截三項 A999/好速/R1399），其餘純記錄。
  今日卡片改 12 格；追蹤牆/督導卡/連續警示吃 `PERSONAL_ITEMS` 自動帶出。
- 結果：成功（Playwright：R1399=0 攔截、12 欄入庫、卡片/追蹤牆顯示、全過關放行）。
- 經驗 / 給下一位的提醒：`5g` 當物件 key 要用 `data['5g']` 取；個人回報資料
  全在 record JSON 內，加欄位不用動 GAS。舊記錄沒有新欄位會顯示 0，屬預期。

## 2026-07-14 ｜ Claude（個人未過關回報內容）
- 做了什麼：`index.html` 個人追蹤的未過關說明區新增必填欄位「① 未過關原因說明」
  「② 明日改善計畫」（空白擋下送出、每次開啟自動清空避免沿用舊文字）；
  個人今日卡片與督導端未過關卡片（`renderStorePersonalDetail`，彙整大盤＋日期回放共用）
  一併顯示新欄位，並補顯示先前有收集但沒顯示的「接客數、上線項目」。
- 結果：成功（Playwright 全流程驗證：攔截→必填擋下→儲存→個人卡＋督導卡顯示）。
- 經驗 / 給下一位的提醒：新欄位存在個人回報 record 的 `extra` JSON 內
  （`pwrite` 整包字串進「個人回報」工作表），**不用改 GAS FIELDS、不用重新部署**。

## 2026-07-14 ｜ Claude（週報改版＋修正）
- 做了什麼：週報 Excel 改為六分頁（巡店紀錄／未巡店／上下半月2-13／每月盤點14-17／
  雙月全盤18／知悉20日前19-33），逐分頁呈現與看板同語意的狀態（不再壓成單一✓✗）。
  修正：①GAS 店名比對加入營業點代碼（與前端 findRecordStore 對齊）
  ②`writePatrol` 去重改為「同鍵但 result/reason 有變→就地更新」——來源表事後補填
  「是否合格」重貼時不再被跳過（舊行為會讓雲端永遠留舊值）。
- 結果：成功（Node 模擬 GAS 環境驗證六分頁輸出全數正確；28 tests passed）。
- 經驗 / 給下一位的提醒：ptwrite 回傳多了 `updated` 欄位（doGet 有變，需重新部署）。
  驗證 GAS 純邏輯可用 Node stub（SpreadsheetApp/Utilities/MailApp…）直接 eval Code.gs 跑。

## 2026-07-14 ｜ Claude（巡店週報）
- 做了什麼：GAS 新增每週一 08:00 巡店週報——`sendWeeklyPatrolReport()` 產暫存試算表
  →匯出 xlsx（UrlFetchApp + OAuth token）→ MailApp 夾檔寄出 → 刪暫存。
  Excel 含「檢核總表」（每店×33題 ✓✗，判定邏輯 `ptItemDone()` 與前端看板一致）
  與「本月明細」。啟用：`setupWeeklyReport()`；試寄：`testWeeklyReport()`。
- 結果：成功（語法通過；GAS 端需 Liam 執行驗證）。
- 經驗 / 給下一位的提醒：xlsx 匯出用 UrlFetchApp 打 spreadsheets export URL 帶
  `ScriptApp.getOAuthToken()`，會新增 Drive/UrlFetch 授權範圍——**首次執行會再跳一次授權**。
  時間觸發器不需重新部署。

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
