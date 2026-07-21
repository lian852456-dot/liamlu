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

## 2026-07-21 ｜ Claude（新增 kpitry.html 通用試算版）
- 做了什麼：新增 `kpitry.html`——給**非本區同仁**用的公開試算版。與 kpi.html 共用
  同一套已驗證計算引擎（逐項達成率、250%上限、店績下限半分、防退類反向＋2025/07
  解約NP OUT新制、激勵加分），但**不含任何個資**：無登入、無 GAS、無內建資料，
  店點/姓名/目標/實績全部使用者自行輸入。內建的只有「計算架構」（24 項加權項目、
  標準權重、公式、上下限規則），權重進階可改（外區權重不同時可調）。青色主題與正式版
  橙色區隔避免混淆。含 localStorage 存檔、匯出/匯入 JSON、部分填寫時顯示「權重覆蓋率」
  警語（避免只填幾項誤讀總分偏低）。可完全公開分享。
- 結果：成功（Playwright 驗證：灌 0720 酒泉店績目標/實績、D=19 → 算出 108.90%，
  與官方報表逐格一致；個績模式、持久化、匯出無個資皆通過）。
- 經驗 / 給下一位的提醒：這版總達成率不做校正值（無官方基準可比）。分母為全項權重
  105.5%，未填項目以 0 計，故部分填寫時總分偏低屬正常（頁面已加警語）。若制度權重
  調整，改 `ARCH` 陣列即可。

## 2026-07-21 ｜ Codex（完成 half-inspection-media 分支收尾）
- 做了什麼：核對 `agent/half-inspection-media` 的 3 個 Codex commit 與最新 `main`；確認巡店媒體、moto 第 10 款及北一二B整體 KPI 已由後續提交拆分整合，因此以保留新版 `main` 檔案樹的 merge commit 補齊分支祖先關係，沒有把舊版 `patrol.html` 蓋回來。同步將巡店測試的半月題數由過時的 33 項改為正式 18 項，並驗證連續選取媒體、關閉回放視窗後匯出 Excel、私有附件連結。
- 結果：成功。`tests/app.spec.js` 29/29、`tests/patrol.spec.js` 11/11 通過；合併前後產品檔案樹一致，僅新增分支歷史關係與測試規格修正。
- 經驗 / 給下一位的提醒：若功能已由不同 commit 拆分整合，不要直接用舊分支內容解衝突；先比對功能標記與後續提交，再用 ancestry-only merge 收尾。半月督導檢查固定 18 項，原巡店看板的知悉題仍可維持 19–33 項，兩者不可混為同一題數。

## 2026-07-20 ｜ Claude（KPI 試算每日自動更新）
- 做了什麼：`gas/Code.gs` 新增 `kpiCalcAutoUpdate()`：每天 11:00（台北）由時間
  觸發器掃描 Liam 的日報 Drive 資料夾（`KPICALC_SOURCE_FOLDER_ID`，預設寫在
  程式常數），取檔名 `MMDD.xlsx` 最大者 → Drive API v3 轉暫存 Google 試算表 →
  解析「上線數KPI_店點/個人達成率_明細」→ 產生資料 JSON 直接覆寫私有 Drive 的
  `north12b-kpicalc-private-latest.json` → 刪暫存檔 → 寄成功/失敗信
  （`DASHBOARD_NOTIFY_EMAIL`，回退 `NOTIFY_EMAIL`）。同檔案已匯入過
  （屬性 `KPICALC_LAST_IMPORT` 記檔名+mtime）就靜默略過；解析失敗保留舊資料不動。
  啟用：GAS 加入 Drive API v3 服務 → 執行一次 `setupKpiCalcAutoUpdate()`。
- 結果：成功（解析演算法在本機以 0720/0719 兩天真實日報模擬驗證：與已勾稽的
  kpidata 逐格零差異、跨日欄位穩定）。GAS 端實跑需 Liam 啟用後由 email 確認。
- 經驗 / 給下一位的提醒：時間觸發器跑最新存檔程式碼免重新部署，但
  `kpicalc_access`/`kpicalc_publish` 屬 doPost，改動要部署新版本。日報若改版
  （欄位帶狀區塊位移），自動更新會寄失敗信並保留舊資料，屆時把新檔丟給 AI 重新對格式。

## 2026-07-20 ｜ Claude（kpi.html 加員編授權，資料撤出公開頁面）
- 做了什麼：kpi.html 資安強化——(1) 加 noindex；(2) 內嵌 KPI 資料全部移除
  （原始碼 grep 驗證 0 筆殘留），改為登入後從 GAS 拉取；(3) **重用 Codex 的
  私有戰情授權機制**（`private_request` 申請＋mail 通知＋裝置綁定＋DashboardUsers
  名冊審核，同網域共用 `north12b_private_dashboard_device_id`，戰情已核准的
  裝置直接能登入 KPI 試算）。GAS 新增兩個 doPost action：`kpicalc_access`
  （驗證員編＋裝置 → 回傳資料+profile）與 `kpicalc_publish`（管理者密碼＋
  base64 JSON → 存私有 Drive `north12b-kpicalc-private-latest.json`）。
  發佈入口在 kpi.html 進階設定「督導發佈區」（選 JSON 檔上傳）。
- 結果：成功（Playwright mock GAS 驗證：未核准擋下、申請流程、登入後計算
  仍與 0720 報表一致、重載自動登入）。**需 Liam 重新部署 GAS（新版本）才生效**。
- 經驗 / 給下一位的提醒：KPI 試算資料檔**不要 commit 進 repo**（repo 公開）；
  每日更新流程＝產生新 JSON → kpi.html 進階「督導發佈區」上傳，不用動 GAS。
  授權共用戰情名冊：核准/撤銷都在戰情頁籤管理介面或 DashboardUsers 表操作。

## 2026-07-20 ｜ Claude（新增 kpi.html KPI 試算網站）
- 做了什麼：新增 `kpi.html`（單檔，無後端，localStorage）。同仁選店點／個人後
  KEY 今日上線數，即算各項目「明日達成率」與明日 KPI 總進度達成率。
  內建 0720 日報（2026/07/01~07/19）九店＋40 人的目標數/累計實際數/權重。
  公式從「KPIPI資料設定」模板＋0720 日報反推並勾稽：逐項達成率 100% 吻合
  （含防退類 2−實際/目標、2025/07 解約NP OUT 店績新制 50%+50%×原始）；
  總達成率＝Σ(權重×達成率)（分母 1.0，好速 5%＋Netflix 0.5% 為疊加權重）
  ＋店績下限半分規則（個績無下限）＋激勵加分（降轉率≧1399≦37% +0.75%、
  升轉率<1399≧30% +0.75%、AQ件數加分推估≧130% +1%）。9 店中 7 店完全一致，
  大稻埕 −0.34%／三創 +0.14% 殘差由「校正值」（官方−模型）自動吸收。
- 結果：成功（Playwright 驗證：D=19 時模型＝報表官方值、輸入/重載/localStorage 正常）。
- 經驗 / 給下一位的提醒：日報「上線數KPI_店點達成率明細」最後的「TTL AQ上線數_加分項」
  欄位組間距不同（實際GK/目標GL/權重GN/達成率GP，中間跳格），照 +1+2+3 硬讀會錯位。
  店長／代理店長個人目標全為 0、報表個人總達成率直接顯示 0（店長只看店績）。
  目標數固定不變（Liam 說有變會告知）；每天新日報出來後，用「修改累計」＋
  進階設定更新累計與到位日即可，或請 Claude 重新產生內嵌資料。

## 2026-07-17 ｜ Claude（門市圖案改動物）
- 做了什麼：應門市要求，九間店圖案換成動物——通化🐯 酒泉🐻 三創🦅 萬大🐘
  六張犁🦌 復興南🐺 永吉🐲 大稻埕🦁（指定獅子） 杭州南🐎。
  改兩處：填報頁 store-card 與 selectStore 的 icons 對照表。
- 結果：成功（Playwright 驗證店卡與選店副標）。
- 經驗 / 給下一位的提醒：門市圖案有兩份（HTML 店卡＋JS icons map），改的時候要同步。

## 2026-07-16 ｜ Claude（移除 KPI/個績 死程式碼）
- 做了什麼：Liam 決定 KPI 呈現以 Codex 的「KPI戰情／台獎戰情」為準，
  移除 Claude 稍早做的「KPI/個績」頁籤殘留 JS（214 行：renderPerf/_getPersonalDay
  /_getPersonalMonth/_perfPersonalTable 等；頁籤按鈕與面板 Codex 已先拆）。
  Codex 的戰情頁籤完全未動。
- 結果：成功（Playwright 煙霧測試：六個頁籤全部正常切換、填報送出正常、無 JS 錯誤）。
- 經驗 / 給下一位的提醒：localStorage 可能殘留 `perfDay_YYYY-MM-DD` 快取鍵，無害可忽略。
  之後 KPI/個績相關需求一律做在 Codex 的戰情頁籤上，不要再開新頁籤。

## 2026-07-16 ｜ Claude（回報檢查信改版）
- 做了什麼：`checkSegAndNotify` 檢查時間 16:20/21:20 → **16:30/22:00**（`setupTriggers`
  改 atHour/nearMinute）；未回報警示信加入「📊 N12B 目前加總」——已回報門市的
  KPI 均值＋A999/A1399/好速/R1399 合計，零回填時顯示（尚無回填資料）。
- 結果：成功（Node stub 驗證主旨/加總/邊界情境）。**需 Liam 貼新碼進 GAS 編輯器
  存檔＋重跑一次 `setupTriggers()`**（改觸發時間必須重建觸發器；無 doGet 改動，不用重新部署）。
- 經驗 / 給下一位的提醒：改信件內容只要存檔即可生效（觸發器跑最新存檔碼），
  但改「觸發時間」一定要重跑 setupTriggers 重建。

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
