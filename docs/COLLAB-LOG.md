Warning: truncated output (original token count: 40598)
Total output lines: 1168

## 2026-09-16 匯入預檢 unknown action 相容修正

- 照片為「未呼叫ptwrite」，錯誤在共用ptdetail Preflight。正式路由存在，Chrome合成唯讀預覽PASS，未重現使用者電腦錯誤。
- 加入ptdetail POST unknown action一次同端點GET回退，與有限重試共用3次預算，保留auth／完整preflight／readback與寫入單次。
- Node27/27、匯入Chromium11/11、語法／diff PASS；未寫正式資料、GAS維持v9。使用者來源報表實機驗收仍待確認。
- 詳見 PATROL_IMPORT_RECOVERY_20260916.md。

## 2026-09-16 巡店 App 登入障礙正式修復與讀回

- 功能03ed294已進main，Pages 15:28:22 built，四項正式資產與提交一致。
- App與看板統一Patrol隔離端點及session key；登入單次60秒，唯讀有限重試，寫入未加重試。
- 正式Chrome兩入口正常登入、重新整理session恢復及九店讀回通過；App最近巡店與里程載入完成，未見unknown action。iPhone實機仍待本人確認。
- Node212/212、Chromium23/23及語法／diff通過；额外6項KPI／台獎Node與1項台獎browser fixture失敗另外列管。
- GAS既有v9未變，無正式資料寫入。404來源層及截圖當時unknown action仍無足夠trace定論。
- 詳見[本輪交接](PATROL_APP_LOGIN_INCIDENT_20260916.md)，含備份與revert 03ed294回復方式。

## 2026-09-16 巡店看板／App登入障礙修正候選

- 發現App仍使用歷史共享Patrol端點／舊session key，與看板獨立後端不同；正式看板單次登入實測30秒AbortError，pthealth有間歇404後成功。
- 統一App Patrol端點/session契約；唯讀2s/5s最多3次；App登入／登出不自動重送、登入60秒；看板同樣60秒、暫時錯誤保留input方便手動重試，成功／錯碼清空。更新SW資產版本。
- 專項Node212/212、看板Auth／恢復Chromium13/13、App Chromium10/10通過。另有6個既有KPI Node及1個台獎Browser fixture失敗，未改無關產品邏輯。
- 候選看板／App正式正常登入讀回成功，App九店25題、最近紀錄與里程可見。既有App稍後也成功，未重現截圖當下unknown action；不宣稱所有失敗唯一根因已知。
- GAS editor和v9一致，部署保持v9，本輪不修改GAS或正式巡店資料。Pages發布待補。詳見docs/PATROL_APP_LOGIN_INCIDENT_20260916.md。

## 2026-09-15 19:36 巡店正式發布與唯讀驗收完成

- GAS第9版（原Deployment ID／權限）；程式回讀一致，rollback第8版。
- 功能提交76ea226、cfd6759；Pages建置built（19:29:36），線上patrol.html與候選一致。
- 正式正常session：首次開啟、reload、9/10月切換、九店摘要、展開ptdetail、9月里程、班表、到店檢查讀取完成；面談入口可開啟。初始舊session已EXPIRED，正常登入一次後未再重登。
- Node156/156；Patrol/Auth Chromium93/93；新恢復4/4；每日回報smoke4/4；正式增量候選parity2/2；語法與diff check通過。fixture逐店逐題新舊結果一致。
- 無正式巡店資料寫入。寫入／上傳等功能驗證為隔離mock；實機本人UAT及長期404觀察未包含。Deployment或轉址層404根因仍未知。
- 詳見docs/PATROL_READ_RESILIENCE_20260915.md；Pages rollback依序revert cfd6759與76ea226，GAS選回v8。

## 2026-09-15 巡店 GAS v9 與正式候選驗收

- 原 Deployment 已於19:18完成第9版；ID/存取權限不變，程式與manifest回讀核對通過。
- pthealth HTTP200、新 ptdashboard 正常session驗證通過；補上歷史店碼相容，Node156/156、四項恢復瀏覽器回歸PASS。
- Pages發布與正式網址新版驗收待完成，未寫入正式測試資料。詳見 PATROL_READ_RESILIENCE_20260915.md。

# 跨 AI 協作日誌

> 歷史 evidence：本檔保存過往改動、驗證與事故脈絡，不是現行 Agent 規則、待辦清單或固定工作流程。現行規則只以 repo 根目錄 `AGENTS.md` 為準。

## 2026-09-15 ｜ Codex（巡店唯讀穩定性候選；正式部署待完成）

- 功能 commit `76ea2269516dd9036bbb2f1cac03040cd395d1a7`，由最新 `origin/main` `9acdd6a` 建立獨立修正分支；共享 dirty checkout 未修改。
- 修正唯讀404/429/5xx/network/timeout有限重試（2s/5s，共3次）、保留session與非個資摘要快取、診斷白名單；移除既有ptwrite失敗自動重送及寫入重驗後自動replay，保留逐鍵readback並背景刷新看板。
- 新增summary-only `ptdashboard`，九店／25題／月份／版本／5000筆上限，單次工作表scan；unknown action安全回退舊API；缺來源表直接失敗，不建表。
- 驗證：Node 155/155；Patrol/Auth Chromium 93/93＋新增4/4；每日回報smoke 4/4；正式v8增量候選parity 2/2；語法與diff check通過。全部為本機／合成資料。
- 正式Patrol已核對v8且完成editor/v8私有備份；候選保留原92函式＋新16函式，全數唯一且逆向增量可還原。共用Code.gs基線既有kpiCalcPct重複2次，未動KPI；關鍵函式仍各1次。
- 未完成：GAS管理介面連線逾時／原生畫面無內容，尚未儲存、部署GAS、合併main、發布Pages或新版正式session讀回。首次開啟、reload、是否仍需重登均未驗證；404的Deployment/轉址層來源仍未知。
- 詳細contract／備份／rollback與後續順序：`docs/PATROL_READ_RESILIENCE_20260915.md`。先完成GAS同ID新版本與唯讀驗證，再發布Pages；不得以測試宣稱正式完成。

## 2026-09-11 ｜ Codex（行進間戰報字體與數字可讀性加強）

- 做了什麼：依 Liam 實際畫面回饋，行進間戰報網頁與下載 PNG 統一優先使用 Microsoft YaHei 並改為粗體，將原灰藍文字加深；九店 A999／A1399／R999／R1399／好速等上線數與商品上線數再放大，商品長表頭同步加粗。CSS／JS 快取一起升版。
- 結果（正式發布／程式回讀完成）：只改視覺字型、字重、字級與對比，不改 AQ／RT 解析、目標、數值、排序、破蛋標色、商品認列或影音漏搭規則。行進間戰報契約與核心 30/30 PASS、JavaScript syntax 與 diff check 通過；功能 commit `66d91b697a23b47bd36901f5da9c3d1c1875be71`、Pages run `34594958938` 成功，正式 HTML／CSS／JS 已回讀 `20260911-readable-bold`、Microsoft YaHei 與新字級設定。
- 經驗 / 給下一位的提醒：網頁 CSS 與 Canvas PNG 是兩套字型設定，行進間戰報的可讀性調整必須同步修改，不能只改網頁表格。

## 2026-09-11 ｜ Codex（行進間戰報第①張 PNG 列文字裁切修正）

- 做了什麼：修正「① 全國 AQ／RT 完整戰情」PNG 的 AQ／RT 明細列文字垂直定位。畫布使用 `textBaseline=middle`，舊版卻把文字中線放在列底 `y + 43`，導致下一列底色覆蓋前一列文字下半部；現改為列中央 `y + rowHeight / 2`，並升版 `live-battle.js` 快取參數。
- 結果（正式發布／程式回讀完成）：只調整第一張 PNG 的四區／全國列顯示，不改 AQ／RT 解析、數值、排序、非零標色、目標、商品、九店或影音漏搭。行進間戰報契約與核心 30/30 PASS、JavaScript syntax 與 diff check 通過；功能 commit `4660441e892801c6182d0c50e59333dcea481418`、Pages run `34593201234` 成功，正式 HTML 已回讀 `20260911-summary-row-center`，正式 JS 已回讀 `y + rowHeight / 2`。此環境無可用瀏覽器執行檔且下載受限，未把程式檢查冒充實際 PNG 視覺驗收；仍待 Liam 以真實檔重新下載第①張確認。
- 經驗 / 給下一位的提醒：Canvas 已全域設定文字中線基準時，表格內容必須使用 `y + rowHeight / 2`；若用接近列底的座標，後續列的 `fillRect` 會覆蓋前列文字。

## 2026-09-09 ｜ Codex（店長個績來源修正）

- 原因：9 月店長納入個績後，私有 dashboard 快照的救援建置器錯把「店點達成率」寫入店長個人列，造成店長總績效、公司排名及各項目標誤顯示為店績；先前據此回覆的店長數值亦不正確。
- 修復：店長個績的總績效、實績、目標及達成率固定以 `kpicalc_access`／原始報表「上線數KPI_個人達成率_明細」為準；dashboard 快照只在具 `personal_semantics: individual-v1` 標記時補個人排名與 DOD。同步修正正式 09-08 快照的 9 位店長個績，並保留 41 人及其他台獎、保險與店績資料。
- 防護：兩個正式建置器新增個績語意與來源工作表標記；另提供 `scripts/correct_manager_personal_snapshot.py`，只修店長／代理店長且要求人數與來源完全對齊，避免再次以店績覆寫個績。
- 驗證：App 個績映射、KPI controller、快取與 9 月店長規則的聚焦套件 39/39 PASS，另增「舊快照不得覆寫店長個績」的 controller 測試並通過；兩支 JavaScript syntax、三支 Python compile、diff check 通過。正式 Drive 原檔已先備份，再更新同一 latest ID；全檔回讀為 41 人、9 位店長來源值及 `individual-v1` 標記正確。

## 2026-09-08 ｜ Codex（9 月店長個績）

- 9/1 起依 snapshot 資料截止日將店長納入 App 個績排名、達標統計、指標未達與店點個績；管理店績卡仍獨立保留。8 月歷史維持原規則。
- kpi.html 個人試算自 DATA.meta.month 2026-09 起允許店長／代理店長；更新 App 與 Service Worker cache。
- 驗證：資料映射與管理店績語意 26/26，涵蓋 8/31、9/7、店績不替代個績與缺 DOD 保持 null。9/8 本機正式資料副本有 9 位店長個績，但個人 DOD 缺值，不補猜；尚未核准裝置線上驗收。
- 延伸驗證：KPI、台獎、登入重試、回報映射、巡店與里程共 59/59 通過；兩處測試同步新版快取名稱，未放寬驗證。使用者已明確指示發布。
- 未修改 GAS、正式資料、台獎或登入。外部 AI協作中心未提供，未同步；發布與讀回結果另行記錄。


## 2026-09-08 ｜ Codex（VK 漏搭合約代碼篩選）

- 做了什麼：在最新正式 `origin/main` 基準修正行進間戰報的 KKBOX／MyVideo 漏搭判定；RT 案件先以「合約代碼」欄篩出 `VK…` 合約，再套用 5G 599（含）以上、企客／4G 排除與同案件去重。網頁及第④張 PNG 新增合約代碼欄與資格說明。
- 結果（正式發布／線上回讀完成）：功能 commit `2af579bf6bed074db17ba1ea16fdf4aedb722bfd`，GitHub Pages run `34214772817` 成功；正式頁已回讀新版快取、VK 資格說明與合約代碼欄。行進間戰報專項與契約 `30/30 PASS`，兩支 runtime JavaScript syntax PASS。線上合成案例確認非 VK、4G、企客排除，同門號多個合約編號／多筆 VK 只列一次。智慧營運中心、每日回報、KPI、台獎、App、巡店、日誌、稽核、快速更新九個入口均可載入且無頁面自身執行錯誤；瀏覽器環境僅有各頁一致的 extension metadata 雜訊。
- 經驗 / 給下一位的提醒：合約代碼欄優先取明確「合約代碼」，才相容促案／專案／優惠／服務／產品代碼；缺少可辨識代碼時漏搭採 fail-closed，不再用單純 5G 月租推定 VK。全 Node 檢查另有 7 個 `kpi-battle-source`／`kpi-battle-standalone` 既有失敗，均位於本次 0 diff 檔案；外部 `../AI協作中心` 本環境不存在，未同步。回退分支：`rollback/live-battle-vk-filter-predeploy-20260908`。仍建議 Liam 以真實 RT 檔重傳做資料 UAT。

## 2026-09-08 ｜ Codex（App KPI 總進度與 DOD 資料修復）

- 原因：當日救援摘要因獨立好速認列調整，把區與九店 overall_kpi_dod 清空；區總進度採調整值，App 店點則讀 kpicalc official，形成不同口徑。
- 修復：直接從前後兩份公司原始報表「上線數KPI_店點達成率_明細」讀總進度，以資料截止 09-07 減 09-06，補回區與九店公司 KPI／DOD；保留好速獨立認列及其待比較狀態。已在原私有資料夾備份，更新同一 dashboard latest ID；未改 App、GAS、權限、kpicalc、台獎或其他欄位。驗證識別 b2-20260908-app-kpi-dod-03。
- 驗證：10 筆來源與差值、九店 kpicalc official 一致；反向還原所改欄位後與原資料完全相同；正式 Drive 全檔回讀 SHA-256 一致；使用現行 app.js 的 adaptKpi 與格式化函式，區與九店 DOD 均正常。未執行核准裝置登入畫面驗收。既有 kpicalc 區「解約後NP OUT(督導績)」rate 缺值使模組仍標 partial，本次未補猜。
- 交接：KPI 總進度 DOD 應採公司同口徑來源，不能因單一好速明細規則而整欄清空；不要以明細調整總分搭配公司原始排名。外部 AI協作中心文件本環境未同步。


## 2026-09-08 ｜ Codex（每日日誌查看日期移至每日分頁下方）

- 做了什麼：依 Liam 指示，將「查看日期」由九店完成總覽右上角移到每日／每週／每月／需追蹤分頁列正下方，標籤改為「每日查看日期」；桌機維持緊湊橫排，手機改為滿寬上下排列。日期的資料篩選與重算邏輯未變。
- 結果（正式發布／靜態讀回完成）：日誌專項 `12/12`、JS syntax 與 diff check 通過；同步最新主分支後全站 Node `376/383`，7 項失敗已在未修改的最新 `origin/main` 以相同指令完全重現，皆為既有 KPI controller／standalone 契約差異，沒有本次新增失敗。正式功能 commit `c006d5290064090f5f225179f004cad3de3a0a86`，GitHub Pages run `34183795331` 成功；正式 HTML 已讀回 `daily-date-row`／「每日查看日期」與 CSS `v=20260908-1`，新版桌機同排及手機滿寬樣式均存在。本次未修改解析規則、GAS、Sheet、巡店、KPI 或其他功能。
- 經驗 / 給下一位的提醒：日期仍是整份儀表板的資料基準日，只移動控制項位置；不可將它改成只影響每日四項。外部 `../AI協作中心` 交接資料未存在於本環境，未同步。

## 2026-09-07 ｜ Codex（巡店看板移除缺項總卡與放大雅黑粗體）

- 依 Liam 本輪要求，移除 patrol.html 新版及歷史看板的「尚缺檢核項次」統計卡；保留各店缺項明細、完成判定及所有資料來源。
- Liam情報站各分頁字級約放大20%，小字至少14px、內文18px，統一 Microsoft YaHei 700粗體；無此字型的裝置依序使用繁中字型備援。概覽卡片自適應、手機維持兩欄。
- 驗證：內嵌JS語法通過、三處統計卡移除、GitHub提交後完整內容逐字回讀一致（commit 61a5ddf）。正式登入入口可開啟；本機預覽遭Cloud Browser ERR_BLOCKED_BY_CLIENT，未宣稱登入後桌機／手機視覺或正式資料E2E驗收。Pages發布另由工作流程結果確認。
- 僅前端顯示調整，無GAS／權限／資料寫入。外部 ../AI協作中心 交接文件本環境未提供，未同步；本日誌保留交接。


## 2026-09-07 ｜ Codex（同仁獎金排序及店點篩選）

- 依Liam要求，同仁獎金按正式projected由高至低，缺值排末；新增全部店點/九店下拉，篩選後保持排序，領獎人數隨篩選更新。
- 店點篩選使用獨立bonusStore狀態，不影響KPI/店點選擇；不改獎金計算、資格或來源。更新App與快取版本。
- Node回歸82/82、JS syntax通過。沿用本輪正式發布授權；外部AI協作中心本環境不可用，未同步。


## 2026-09-07 ｜ Codex（同仁獎金獨立分頁）

- 依使用者實機回饋，台獎新增與北一二B/店點並列的「同仁獎金」，移除區域及店點內重複的個人獎金；個人金額、狀態、排名及資料來源不變。
- 切回KPI/個績自動隱藏第三頁並從bonus回到region，避免錯誤套用店點視圖。App、CSS及service worker更新快取版本。
- 驗證：App相關Node 82/82，新增region/store無個人卡、bonus獨立呈現與跨類型重置的模擬；JS syntax通過。沿用前輪發布授權。外部AI協作中心不在環境內，未同步。


## 2026-09-07 ｜ Codex（App台獎發布前模擬回歸）

- 使用者授權：先模擬測試，沒有影響即可發布。
- 檢查：App相關Node測試81/81通過（KPI、個績、回報、班表/巡店讀取、半月檢查權限、登入恢復、快取契約及台獎）。新增10款排序、80%缺額、空目標、來源不變、個人店點篩選與N但金額非零的HTML模擬。135個既有函式區段保持一致；修改集中在台獎adapter/render與發布日/快取版本。
- 保留店點原50%與100%獎金資訊；同步舊版本硬編碼測試及service worker註冊版本。
- 邊界：本機Playwright無瀏覽器執行檔；Cloud Browser連本機預覽ERR_BLOCKED_BY_CLIENT，未繞過，不宣稱手機視覺或正式核准裝置E2E通過。
- 正式發布結果由GitHub Pages後續部署確認。外部AI協作中心不在環境內，未同步；此日誌為交接。


## 2026-09-07 ｜ Codex（App 指定機款80%缺額與個人台獎候選）

- 新增：App 台獎北一二B與店點頁呈現指定機款實際數、全月目標、目前達成率、80%目標、距80%缺額及來源預估達成率；九月機款依指定順序顯示。
- 個人台獎：讀取同次 snapshot kpiBattle.personal 的 phone_award_actual/projected/rank/eligible；依店點集中，Y/N直接呈現，缺值顯示尚未同步，非零金額不等於可領獎。
- 日期：發布日採 report_run_date 優先，截止日與 processing run 分開核對，禁止混批。
- 驗證：Node 對應資料映射20/20、JS syntax通過；包含80%進位、超標歸零、缺目標、領獎N且金額非零、日期批次不一致。未執行核准裝置正式登入或視覺QA；尚未部署，不能當成正式驗收。
- 範圍：App前端與快取版本、測試、此日誌；無GAS、權限或私有資料寫入。外部 ../AI協作中心 文件本環境未提供，未同步；此處保留交接。


## 2026-09-07 ｜ Codex（台獎日期與九月機款檢核修復）

- 原因：正式台獎已生成，但 controller 將截止日 report_date 與 KPI adapter 的發布日比較，並沿用舊 13 款 gate；九月正式 10 組資料被誤擋。資料發布紀錄的 readback PASSED 未涵蓋前端契約。
- 修正：僅調整 awards-battle-controller.js，發布日與截止日分開核對，附帶驗證同一 snapshot 的 processing run，九月使用 10 組、其他月份保留既有 13 款；標示發布日期與資料截至日期。未修改正式數值、GAS、權限、KPI或其他入口。
- 驗證：台獎契約 8/8；以當日私有 Drive latest snapshot 與 kpicalc 通過實際 adapter、validator、accept/render，10張整體／門市卡及10組機款。相鄰 KPI 靜態契約有一項既有失敗（測試 regex 不接受已存在的 script 版本參數），本次相關檔案零變更。主發布、救援、缺件與假日排程已加入台獎前端契約回讀門檻。發布狀態另以 GitHub Pages 部署與正式 JS SHA-256 回讀確認；核准裝置線上登入 E2E 尚未驗收，不可用本機 render 代替。
- 交接：未來改月機款時必須同步 renderer 契約；不得把 private JSON 提交公開 repo，不得只改日期繞過 freshness。

## 2026-09-07 ｜ Codex（行進間戰報店點排序）

- 做了什麼：VK 網頁與 PNG 共用穩定店點排序，依既有 STORE_NAMES 集中同店案件；商品 PNG 改為與網頁相同的每店一列、機款欄與合計，保留紫色非零數量。更新控制器快取版本。
- 結果：相關 Node 29/29、JS syntax、diff check 通過；合成 Canvas 記錄驗證九店順序、機款數量、合計與 VK 穩定排序／原始陣列不變。提交後需確認 Pages 靜態讀回，真實 AQ／RT 重傳由 Liam 驗收。
- 交接：未改解析資格、GAS、KPI 或其他功能。外部 ../AI協作中心 交接資料未存在於本環境，未同步；本日誌保留本輪交接。可回退本次提交恢復版型。


## 2026-09-05 ｜ Codex（督導面談季度雲端候選完成，待 Liam 部署 GAS）

- 做了什麼：將「督導面談紀錄」從單次本機預覽補成當季管理頁；依十一欄來源解析七／八／九月，同仁編號在瀏覽器解析後立即排除。新增本季名冊、已完成、待結案、尚未面談與可回看面談內容；名冊沿用私有班表。新增受保護 `interview_read`／`interview_write` POST，寫入獨立 `督導面談紀錄` 工作表，採鎖定、去重、upsert 與寫後讀回。
- 結果（本機候選／未部署）：季度規則固定七至九月同季，十月畫面立即全員歸零；讀取不刪資料，新季度第一次成功寫入後才清除舊季度。Node `155/155`、Patrol/Auth Chromium `93/93`、diff check 通過。巡店、里程、班表與督導到店檢查回歸均通過。
- 經驗 / 給下一位的提醒：Patrol Apps Script 只能由 Liam 手動備份與建立新版本部署；在 GAS 部署、Pages 發布、真實七／八月檔寫入後讀回與 Liam 實機驗收完成前，不得宣稱正式雲端已上線。完整契約見 `docs/SUPERVISOR_INTERVIEW_QUARTERLY.md`。

## 2026-09-03 ｜ Codex（Patrol 新版 25 題 NA/V 判定已發布）

- 做了什麼：由最新 `origin/main` 建立乾淨 worktree，將 2026-09-01 起共用 25 題模型收斂為只有 `result=V` 計入完成；`result=NA`、`reason=NA` 與只有原因文字都維持缺項。`patrol.html` 與 Supervisor App 共用此模型，並升版題庫、App 與 Service Worker cache。8/31 前 `patrol-read-model.js` 33 題歷史判定未改。
- 結果（Pages 已發布／靜態線上讀回完成）：固定樣本第 1、3、10 題為 NA 時為 22/25、缺 `[1,3,10]`、三群 7/9・0/1・15/15，完整看板與 App 待補徽章一致。Node `377/377`、Patrol/Auth Chromium `91/91`、App NA/V 專項 Chromium `1/1`；正式 commit `a3bb36e955f9b11ac6015d3c1014c26c4b64a3d2`、Pages run `33765914897` 全成功，線上題庫、`patrol.html`、`app.html`、`app.js`、Service Worker SHA-256 均與 repo 相同。
- 經驗 / 給下一位的提醒：本次沒有修改 GAS、Sheet schema、登入／權限、貼上／readback、里程、班表、半月檢查或正式資料。回復分支 `rollback/patrol-na-v-predeploy-20260903` 指向 `d95aa736`。靜態發布與 SHA readback 不等於核准裝置正式資料驗收，Liam 仍需登入巡店頁與 Supervisor App 核對真實 NA 列。

## 2026-09-03 ｜ Codex（Supervisor App 9 月新版巡店與移動里程已發布）

- 做了什麼：根因為 Supervisor App 仍沿用 8 月以前的 `ptsummary`／33 題讀取模型，沒有載入 9 月共用題庫，也沒有巡店里程讀取模組，因此 `patrol.html` 已更新但 App 看板與里程不會同步。App 現在於 2026-09-01 起讀取 `ptsummary` 後，以受限分頁的 `ptdetail` 套用共用 25 項、每月兩次且至少相隔 7 天模型；「督導到店檢查」同步改採第 1–9 題。新增既有唯讀 `ptmileage2` 的月里程、報銷日、待確認路段與近期路線顯示，並更新 Service Worker cache key 與資源版本。
- 結果（Pages 已發布／靜態線上讀回完成）：本機 Node `376/376`、JS syntax 與 `git diff --check` 通過。功能提交 `06716fef99e4ac649038e1cde8e6d8f6d18f2466` 發布後發現大型 `app.js` 經 GitHub API 傳送時被截短，已以 `9ec4c4b7473563a11a525616100a07d9a3add2aa` 還原完整 blob，並由 `695f7ea7d56aeab420d833119d9fb759fde57329` 升版快取。GitHub Pages `app.html` 已讀回 `patrol-question-versions.js?v=app-sep25-20260903-2`、新版 `app.js`，巡店分頁實際可開啟且 DOM 已出現「督導到店檢查」、`每日移動里程`、`ptdetail` 與 `ptmileage2`；新頁面無網站 console error，Service Worker cache 為 `liam-supervisor-app-1-2-sep25-patrol-mileage-20260903-v2`。
- 經驗 / 給下一位的提醒：本次沒有修改 GAS、Sheet schema、OAuth／Cookie／session／權限，也沒有寫入正式巡店、里程、KPI、台獎或每日回報資料；正式資料仍維持唯讀，同店同日無可靠 visit/session identifier 時只計一次、不補猜。發布前回復分支 `rollback/app-sep25-patrol-mileage-predeploy-20260903` 指向 `ca1959fc`。Liam 的 iPhone Safari／主畫面 App 解鎖後真實資料驗收仍須與靜態發布分開記錄。

## 2026-09-02 ｜ Codex（群組提醒與獨立店務行事曆上傳已發布）

- 做了什麼：在每日日誌檢查新增「一鍵複製群組提醒」及文字預覽；提醒依查看日期列出三類完成度、已到期缺項與門市，排除未到期項目。依 Liam 提供的店務行事曆匯出格式新增第二個獨立選檔入口，辨識檢查日期、九店店名／DNB 代碼、檢查人員、填寫時間與處理狀態，再以店點＋日期覆蓋／合併日誌檔內的行事曆資料。同步為 CSS、核心與控制器加版本參數，避免 Pages 快取舊腳本導致按鈕無反應。
- 結果（Pages 已發布／雙檔本機合併）：Node `369/369`、npm audit 0、JS syntax 與 diff check 通過。正式網址以合成日誌 `.xlsx` 5 列及同版型行事曆 `.xlsx` 9 列實測，合併後 14 列／9 店／0 待確認；行事曆完成 4 店使每日完成變為 `4/36`，需追蹤由 44 降為 40。群組提醒成功寫入剪貼簿且預覽文字一致，網站 console 無錯誤。正式 commit `4f6b549d87763a3681b55408bd8ca5dee2e57160`。
- 經驗 / 給下一位的提醒：行事曆匯出會同時含多日期，儀表板只依「查看日期」取當日九店；獨立行事曆只覆蓋相同店點＋日期的 calendar 列，不影響營業前／中／後、每週或每月資料。兩檔仍只進目前瀏覽器與 `localStorage`，未寫 GAS／Sheet／巡店。回復分支 `rollback/daily-log-calendar-upload-predeploy-20260902` 指向 `ed45a608`；前一階段群組提醒回復分支為 `rollback/daily-log-group-reminder-predeploy-20260902`。

## 2026-09-02 ｜ Codex（每日日誌 Pages 發布與正式網址選檔驗證）

- 做了什麼：經 Liam 明確授權後，先建立 `rollback/daily-log-dashboard-predeploy-20260902` 指向發布前 `5812db7`，再將每日日誌候選版發布到 GitHub Pages；使用雲端 Chrome 由 `home.html` 同仁大廳實際點入 `daily-log-dashboard.html`，以不含真實資料的合成 `.xlsx` 操作原生檔案選擇器、解析並套用本機預覽。
- 結果（Pages 已發布／本機資料模式）：正式網址成功辨識工作表 `每日日誌`、表頭第 1 列、5 列有效資料、1 間門市、5 種已確認表單、0 筆待確認，產生每日 `0/36`、每週 `3/36`、每月 `1/18` 及需追蹤 `44`；返回同仁大廳後入口存在且可再次開啟，`localStorage` 預覽仍可讀回。網站來源無 console error；瀏覽器擴充套件自身 metadata 錯誤與網站無關。正式發布 commit `7958054be0c715f7ba11b1fa20c2e9dac3be682a`。
- 經驗 / 給下一位的提醒：原生 `.xlsx` 選檔流程已在實際 HTTPS 通過；CSV 合成檔曾因匯入版型未被 SheetJS 選為有效工作表，不可拿該結果否定 Excel 功能。此版本仍只在瀏覽器解析並寫入目前裝置 `localStorage`，沒有 GAS／Sheet／巡店資料寫入；真實去識別化 Excel、手機版與中央 read/write/readback 尚待後續確認。

## 2026-09-02 ｜ Codex（每日日誌本機 Excel 選檔修正）

- 做了什麼：修正直接由本機／工作區開啟 `daily-log-dashboard.html` 時，頁面控制器使用 ES module 而遭 `file://` 安全限制阻擋，導致選檔無反應。控制器改為頁尾一般腳本；第二次依使用者回報再移除自訂按鈕與隱藏欄位，改成瀏覽器直接呈現的原生 `input type=file`，不再依賴程式轉按選檔。
- 結果（本機候選／未部署）：日誌專項 `6/6`、JS syntax 與 diff check 通過；未修改解析規則、正式資料、GAS、巡店或其他入口。
- 經驗 / 給下一位的提醒：需要支援直接開啟的獨立靜態頁，不可把無 import 的控制器設成 `type="module"`。ChatGPT 工作區的 HTML 預覽可能基於安全政策封鎖本機檔案選擇；此情境要下載完整靜態包後由 Chrome 開啟，或部署到實際 HTTPS 測試網址，不能把預覽器限制誤判成解析器故障。

## 2026-09-02 ｜ Codex（每日日誌檢查本機候選版）

- 做了什麼：從最新 `origin/main` `5812db7` 建立 `feature/daily-log-dashboard-20260902`；在 `home.html` 同仁大廳新增「每日日誌檢查」入口，新增獨立本機 Excel／CSV 解析頁、九店每日／每週／每月完成總覽、到期判斷、需追蹤清單及長細項展開。資料契約固定為每日四項、環境檢查第一至第四週及每月兩項；第五週維持未定義。
- 結果（本機候選／未部署／視覺 QA 受阻）：解析與規則專項 `6/6`、相關入口契約 `10/10` 通過；全 Node `364/366`，唯二失敗已在乾淨 `origin/main` 同條件重現，均為既有巡店 parity `daysLeft` 一日差。JS syntax 與 diff check 通過。雲端瀏覽器禁止開啟本機候選網址，故未把自動化測試冒充桌機／手機視覺簽核。檔案只在瀏覽器解析，候選快照只存目前裝置 `localStorage`；未修改 `gas/Code.gs`、Google Sheet、巡店 API、正式資料或任何部署。
- 經驗 / 給下一位的提醒：尚未到期的週／月表顯示「未到期」且不列異常。正式中央更新前必須取得去識別化原始 Excel 驗證實際版型，並由 Liam 確認查看／上傳權限；應建立獨立日誌 read/write 與 readback，不得把本機預覽誤稱正式發布。另須在可開啟候選頁的瀏覽器補做桌機／手機與明細視窗視覺 QA。完整契約見 `docs/DAILY-LOG-DASHBOARD.md`。

## 2026-09-01 ｜ Codex（影音漏搭 5G 資格嚴格判定已發布）

- 做了什麼：依 Liam 更正，KKBOX／MyVideo 漏搭只納入「變更／申辦資費」欄最終資費明確為 5G 599 型（含）以上的 RT 案件；提前續約仍須符合相同 5G／599 門檻，企客與 4G 案排除。移除以整列任一 5G 字樣或單憑月租 599 以上推定 5G 的舊判定，避免 4G 資費因商品型號標示 `(5G)` 被誤列。
- 結果（Pages 已發布／待 Liam 真實檔實機重傳）：新增明確 5G、提前續約、4G 搭 5G 商品、純數字 599、企客及 4G 升 5G 等資格邊界測試，專項 `20/20` 通過。全站 Node `358/360`；唯二失敗仍為 `origin/main` 已知巡店 parity `daysLeft` 一日差，非本次新增。npm audit 0、JS syntax 與 diff check 通過；KPI、台獎、巡店、班表、快速更新、稽核、App、首頁與 GAS 均 0 diff。正式功能 commit `a9c804cc88fe1930af861427bc46175976aef1d3`，Pages run `33500032964` 成功；線上 `live-battle.html` 已讀回 `v=20260901-2`，核心已讀回只由資費欄判定最終 5G 的條件。
- 經驗 / 給下一位的提醒：影音漏搭的世代證據只能取資費欄，不能掃商品、專案或整列；畫面固定顯示 `5G` 的前提必須由核心先嚴格保證。部署前回復分支為 `rollback/live-battle-gift-5g-only-predeploy-20260901`，指向 `a3d9df9`。

## 2026-09-01 ｜ Codex（行進間戰報好速案件嚴格判定已發布）

- 做了什麼：依 Liam 提供的 6 筆正式好速明細，將 AQ／RT 原始檔的好速判定由「好速／寬頻／固網／FTTH／FBB／光纖／36M／500M／1G 任一命中」收斂為專案業務欄位必須明確含「好速」。一般寬頻或速率字樣不再計入；企客不作為好速排除條件，只要專案明確含「好速」仍計入。
- 結果（Pages 已發布／待 Liam 真實檔實機重傳）：新增 6 筆有效案件及 4 筆舊規則誤算案件的回歸測試；九店結果為通化 1、酒泉 2、大稻埕 1、杭州南 2，其餘 0，北一二B合計 6，專項 `19/19` 通過。全站 Node `357/359`；唯二失敗為巡店 parity 測試既有 `daysLeft` 一日差，已在未修改的 `origin/main` 同條件完整重現，非本次新增。npm audit 0、JS syntax 與 diff check 通過；KPI、台獎、巡店、班表、快速更新、稽核、App、首頁與 GAS 均 0 diff。正式功能 commit `905328a11bb0d98b72416dd6d732adc1a302188a`，Pages run `33493785131` 成功；線上 `live-battle.html` 已讀回 `v=20260901-1`，`live-battle-core.js` 已讀回嚴格判定，首頁、KPI、巡店、App、每日回報與戰報入口 HTTP 200。
- 經驗 / 給下一位的提醒：好速業績判定與 KKBOX／MyVideo 漏搭的企客排除是兩套規則，不可混用。正式全國／區域彙總表的「好速」欄仍直接讀來源數字，不受原始明細判定收斂影響。部署前回復分支為 `rollback/live-battle-haosu-strict-predeploy-20260901`，指向 `b1360dd`。

## 2026-09-01 ｜ Codex（新版 25 項巡店看板讀取逾時修正已發布）

- 做了什麼：根因為 9 月新版看板在 `ptsummary` 成功後，仍對九店同時讀取 9 月及尚未發生的 10 月 `ptdetail`，18 組查詢任一超過 30 秒便清空新版看板。前端現只讀雙月視窗中不晚於選定月份的資料；選定月份只讀 `ptsummary` 已標示有到店紀錄的門市，visited contract 不完整時才保守回退九店；`ptdetail` 單次等待上限調為 60 秒。重新整理失敗時保留上次成功 rows／model／驗證時間並明示「顯示上次成功資料」。
- 結果（Pages 已發布／正式資料未讀寫）：Node `358/358`、Patrol Chromium `81/81`、針對性 4/4 與 9 月登入新版容器測試通過；全站 Chromium `193/204`，8 個更新前既有基準失敗持續存在，另外兩個並行 screenshot timeout 單線重跑通過，過期的 33 題登入斷言已改為 9 月新版容器並通過，沒有候選新增功能失敗。正式 commit `10894cfbe16a7b4a7f3547c6b625ef421250126a`，Pages run `33460159174` 的 build／status／deploy 全成功；線上與 repo `patrol.html` SHA-256 均為 `72500eb05aacbca8f50adbaaaf87ba6f770291bba86b396a666e6e85758bfd06`，home／patrol／app／index HTTP 200。
- 經驗 / 給下一位的提醒：9 月查看 9–10 月雙月題時不可預讀 10 月；10 月查看時仍需納入 9 月資料。`ptsummary` 的 current-month visited 是縮小 `ptdetail` 查詢面的唯一依據，不可用 33 題完成率代算新版 25 題。本次未改 GAS、Sheet schema、session／權限或正式資料；回復分支 `rollback/patrol-sep25-timeout-predeploy-20260901` 指向 `d86d1f2`。Liam 重新整理後的登入實機確認仍須與靜態發布分開記錄。

## 2026-09-01 ｜ Codex（巡店五項回饋 Pages 已發布／Patrol GAS 待 Liam）

- 做了什麼：萬大正式代碼統一為 `DNB10168`；新版 25 項加入每店每月 2 次且不同日期至少相隔 7 天的提醒、最早可完成日期與完成判定；新版看板只在巡店頁顯示；「半月督導檢查」改名「督導到店檢查」，9 月起採新版第 1–9 題、舊日期保留 18 題；里程新增近六個月快速切換與前後月，並以到店時間優先、填表時間 fallback 還原歷史列。
- 結果（Pages 已發布／GAS 待部署／UAT 待驗收）：Node 全站 `358/358`、Patrol Chromium `80/80`、`git diff --check` 通過。全站 Chromium 為 `195/203`；失敗 8 案已在乾淨 `origin/main` 以相同檔案重跑並逐案完全重現（基準 `12/20`、同 8 案），故不列為本次回歸。功能 commit `af0f16b81a2b85e239dcb478fe9f787b1bb894e1`，另以 `3feace29c4418ca043559338abd404e79f1c0b33` 將題庫 cache key 升至 `v=2`；最終 Pages run `33458183113` 的 build／status／deploy 全成功。線上 `patrol.html` SHA-256 `4a8591e4531fe7a88364afece0211fd5a8fd109e4d17efa18d349c09b255ecf3`、題庫 `9cd1a54d4e0b128991b720534789615e229efa7d3938dd5b44a44dfb7ede7fc8`，均與 repo 一致。home／index／KPI／台獎／稽核／巡店入口皆 HTTP 200。未讀寫正式巡店資料；Liam 眼前分頁視覺驗收與正式 7／8 月 readback 尚待完成。
- 經驗 / 給下一位的提醒：巡店次數以 `arriveTime` 日期為準，缺值才用 `fillTime`；同日多題／重複列只算一次。`ptsummary` 仍為既有 33 題摘要，9 月新版 25 題與雙次間隔由 `ptdetail` 前端模型計算。GAS source／隔離 bundle 雖已修正萬大代碼並納入 commit，依專案規範正式 GAS 編輯器／新版本部署只能由 Liam 操作，本輪不得宣稱 GAS 已部署。回復分支 `rollback/patrol-five-feedback-predeploy-20260901` 指向 `6f2c876`。

## 2026-08-31 ｜ Codex（行進間戰報督導區數字誤判與破蛋標色修正已部署）

- 做了什麼：修正區域彙總候選判斷；含「店點／門市」欄位的店點明細表即使同時有「督導區＋合計」，也不再冒充北一二 A／B／C／D 彙總表，避免同區最後一家店覆蓋整區數字。督導區完整 AQ／RT 表、九店七項表及兩張下載 PNG 的非零指標新增綠色破蛋標註；北一二B原深藍列的非零指標改用深綠色，仍可辨識破蛋。
- 結果（成功／已部署；視覺驗證受阻）：Node 全站 `347/347 PASS`、npm audit 0、JS syntax 與 diff check 通過；新增店點明細不得冒充區域彙總的回歸測試。變更範圍只有 `live-battle-*`、專項測試與文件；KPI、台獎、巡店、班表、快速更新、稽核、App、首頁及 GAS 均 0 diff。正式 commit `6cf2c33`、GitHub Pages run `33388025723` 成功，四個 runtime 檔案與正式網址 SHA-256 一致，主要既有入口 HTTP 200。必要 cloud-browser 連線仍逾時，`design-qa.md` 維持 blocked。
- 經驗 / 給下一位的提醒：區域彙總表與店點表都可能有「督導區、合計、A999↑／R999↑」；是否出現「店點／門市」欄是必要隔離條件。回復分支為 `rollback/live-battle-region-hit-predeploy-20260831`。仍需用 Liam 真實 AQ／RT 檔核對 A／B／C／D 與來源彙總表一致，並補驗非零綠色、北一二B深綠、第一與第三張 PNG 及 console。

## 2026-08-31 ｜ Codex（行進間戰報全國 AQ／RT 督導表候選）

- 做了什麼：依 Liam 更正，第一張戰報不再只顯示北一二 A／B／C／D；新增全國彙總表解析，保留來源順序及重複部別列，顯示全國合計、合計、999↑、999↑占比、小A／小R、999／1199／1399／1599／1899／2699、好速、RT 提前續約與來源有提供的 RANK。好速固定接在 2699／R2699 後；無法唯一對應北一二B時不任意將全國列標成藍色。若檔案沒有全國彙總表，畫面會明確標示只能顯示北一二 A／B／C／D、不可視為全國數字。
- 結果（成功／已部署；視覺 QA 仍受阻）：Node 全站 `346/346 PASS`、npm audit 0、JS syntax 與 diff check 通過；全國表與店點表的誤辨識隔離已有回歸測試。變更範圍仍只有 `live-battle-*`、專項測試與文件；KPI、台獎、巡店、班表、快速更新、稽核、App 與 GAS 均 0 diff。必要 cloud-browser 連線仍逾時；Liam 在已知限制後明確指示部署，正式 commit `12a015e` 已發布，四個 runtime 檔案與正式網址 SHA-256 一致，首頁、KPI、台獎、巡店／班表、App、稽核與快速更新均 HTTP 200。
- 經驗 / 給下一位的提醒：全國來源表的灰色首列是全國合計，不能丟棄；「部」才可作為全國表識別，不能把店點表的「督導區」誤判為全國表。回退分支為 `rollback/live-battle-national-predeploy-20260831`。待 cloud-browser 恢復後，仍須用真實檔完成全國合計、水平捲動、好速位置、北一二B唯一對應、第一張 PNG 與 console error 補驗，`design-qa.md` 在此之前維持 blocked。

## 2026-08-31 ｜ Codex（行進間戰報完整 AQ／RT／好速督導區明細候選）

- 做了什麼：依 Liam 提供的 AQ／RT 公司報表版型，將第一張北一二 A／B／C／D 戰情改為上下兩張完整明細表；AQ／RT 均新增 999↑、999↑占比、小A／小R、999／1199／1399／1599／1899／2699，並將好速固定放在 2699 後，RT 另保留提前續約。區域彙總表存在時優先讀取完整欄位，否則由本機原始明細依資費與案件去重計算；同步更新第一張 Canvas PNG。
- 結果（本機候選／視覺驗證受阻／未部署）：Node `345/345 PASS`、npm audit 0、JS syntax 與 diff check 通過；既有九店、商品、影音漏搭、KPI、台獎、快速更新、巡店、稽核與 GAS 均未改動。Product Design 的必要 cloud-browser 在選取合成 AQ／RT 檔時卡住且本輪無法重置，因此 `design-qa.md` 依規則標記 `blocked`，未推送或部署正式 Pages。
- 經驗 / 給下一位的提醒：下次先重開乾淨 cloud-browser，再以 `/workspace/scratch/3729926cc24f/qa-live-battle-aq.csv` 與 `qa-live-battle-rt.csv` 完成 STEP 3 畫面、水平捲動、北一二B藍底列、第一張 PNG 與 console error 驗收；QA 通過後才可沿既有部署流程發佈。

## 2026-08-31 ｜ Codex（行進間戰報四張 PNG 下載已部署）

- 做了什麼：依 Liam 選擇的「分開四張」方式，在 AQ／RT 辨識結果加入五項全區總覽、九店五項戰情、目前上線商品、KKBOX／MyVideo 漏搭明細四個 PNG 下載按鈕；依動態商品與漏搭筆數自動調整圖片高度，九店商品改為店點橫向欄位以控制圖片寬度。
- 結果（成功／已部署）：圖片以原生 Canvas 在公司電腦瀏覽器內產生 2 倍解析度 PNG，下載至瀏覽器預設下載資料夾；正式維護 Node `341/341 PASS`。GitHub Pages 正式 HTML／CSS／JS 與驗證版 SHA-256 完全一致，既有首頁、每日回報、KPI、台獎、快速更新、巡店與稽核頁面均 HTTP 200。未新增 CDN、第三方套件、AQ／RT 上傳、localStorage／IndexedDB／Cookie 明細留存或正式後端寫入。
- 經驗 / 給下一位的提醒：四個下載按鈕只在兩檔辨識完成、結果區顯示後出現。部署前回復分支為 `rollback/live-battle-four-png-predeploy-20260831`；仍應用公司電腦真實 AQ／RT 各下載一次，核對中文、動態機款與漏搭長表是否符合實際列印／群組需求。

## 2026-08-31 ｜ Codex（五項行進間戰報／商品矩陣／影音漏搭候選）

- 做了什麼：依 Liam 真實 AQ／RT 網站選檔結果，將戰報主軸由 AQ／RT 總量改為 A999、A1399、R999、R1399、好速；依「變更資費」拆分門檻、依「商品型號」動態建立九店商品矩陣。RT 以門號／案件分組，5G 599 型（含）以上與提前續約都檢查 KKBOX、MyVideo，排除企客；只缺任一項即列漏搭，識別碼遮罩後才顯示。
- 結果（本機候選／未部署）：正式維護 Node `339/339 PASS`；成功解析時不再展開大幅安全診斷，直接顯示五項戰情、上線商品、漏搭明細與群組文字。只修改 `live-battle-*`、文件與專項測試；GAS、P1、KPI／台獎、快速更新、巡店、稽核及正式資料 0 diff。
- 經驗 / 給下一位的提醒：原始 AQ／RT 仍只在瀏覽器記憶體解析。漏搭依報表內可辨識的 KKBOX／MyVideo 文字或合約描述判定；若公司實際只提供純代碼，需由 Liam 提供非個資的代碼對照後再擴充，不得自行猜碼。取得新部署授權前不可覆蓋正式 Pages。

## 2026-08-30 ｜ Codex（行進間戰報先選檔／動態今日目標／安全診斷候選）

- 做了什麼：依 Liam 公司電腦只能透過正式網站選檔的限制，將 `live-battle.html` 改為 STEP 1 先選 AQ／RT、STEP 2 才選用載入正式目標。兩檔可在完全沒有目標時先本機辨識並產生目前上線預覽；若原檔只含正式店碼，載入 trusted 督導目標後以瀏覽器仍保留的同一 File 自動重試。另加入安全辨識資訊，只列工作表結構、候選表頭與資費／商品／合約代碼／企客標示等業務分類值，不列姓名、門號或案件資料。
- 結果（本機候選／未重新部署）：今日目標改為 `ceil((月目標－截至昨日正式實績)／含今天剩餘天數)`；正式 KPI 截止不是昨日即停止冒算，月目標已完成則今日目標為 0。全 Node `337/337` 通過；未修改 GAS、P1、快速更新、KPI／台獎、巡店、稽核或正式資料。
- 經驗 / 給下一位的提醒：原始檔仍永遠不離開公司電腦，網站選檔不等於上傳給 AI。Liam 可把安全診斷區截圖或複製文字回傳，再依真實表頭完成 AQ／RT 資費結構、實際上線機款與 KKBOX／MyVideo（含提前續約、排除企客）漏搭規則。未取得新一輪部署授權前不得更新正式 Pages。

## 2026-08-30 ｜ Codex（行進間戰報 AQ／RT 本機解析，已部署／待真實檔 UAT）

- 做了什麼：在 `home.html` 督導專區新增「行進間戰報」候選入口；新增獨立 `live-battle.html`，沿用既有 Approved Device 的 `private_access → kpicalc_access` 並要求 trusted 督導身分。頁面從正式 KPI 唯讀載入九店 AQ／RT 月目標，本機分開解析 AQ／RT CSV／TSV／XLSX／XLS（含 Big5／CP950），依正式店名／DNB code 彙整實績、達成率、缺口與群組貼文。
- 結果（成功／已部署）：Node 全站 `331/331` 通過；AQ／RT 選反、案件去重、點數／明細模式、九店缺目標與非督導皆 fail closed。GitHub Pages run #33322556767 build／deploy 成功；正式 `home.html` 已讀回第三張入口卡，`live-battle.html` 與既有 App、KPI、台獎、巡店、稽核頁面皆回應 HTTP 200。Chromium 因執行環境 process singleton socket 權限無法啟動，WebKit runtime 未安裝；既有 Drive 報表資料夾也沒有 AQ.csv／RT.csv，所以尚缺 Liam 真實雙檔 Safari UAT。正式 GAS／P1／資料寫入為 0；部署前回復分支：`rollback/live-battle-aqrt-predeploy-20260830`。
- 經驗 / 給下一位的提醒：AQ／RT 明細只存在頁面記憶體，不得改成上傳或留存；唯一網路流量是既有兩個唯讀 action。實績來自本次本機檔、目標來自正式 KPI，不可混入前日 actual。完整驗收前必須用 Liam 真實 AQ、RT 各一份核對欄位、九店總數與公司既有「全國 (2)」結果；完整交接見 `docs/LIVE_BATTLE_AQRT_20260830.md`。

## 2026-08-29 ｜ Codex（每日移動里程人工補登欄位，已上線）

- 做了什麼：PR #101 已以 squash 合併至正式 `main`，merge commit `87b2bc75a2a7d6ce1f153083ca34fe1ed837a34d`。正式 `patrol.html` 每一段路線新增 0.1–999 KM 的補登／更新欄位；已知值更新前要求確認，寫入既有 `bei12b_mileage_v1.dayEdits[date].legKm`，不改原始巡店紀錄。另將 Liam 更正確認的 2026-08-27「台北通化→台北萬大」7.4 KM 加入人工確認距離，該日「台北三創→台北通化→台北萬大」計為 3.6 + 7.4 = 11.0 KM。
- 結果（成功／已部署）：Node `320/320`、Patrol＋Auth Chromium `83/83` 通過；全站 Chromium `189/195`，其餘 6 案在乾淨 `main` 以相同結果重現，皆位於本次零 diff 的 Supervisor App 班表／半月範圍。GitHub Pages run #33253323585 的 build／report-build-status／deploy 全數成功；正式網址已讀回 7.4 KM、`.mi-leg-entry` 與 `saveLegInput`。部署前回復分支：`rollback/patrol-mileage-manual-entry-predeploy-20260829`。
- 經驗 / 給下一位的提醒：本次只有 `patrol.html` 是 runtime 變更；GAS、Sheet schema、auth/session/TTL、`ptmileage2`、稽核、KPI、台獎、班表與半月皆 0 diff。補登值仍是既有瀏覽器 localStorage 層；8/27 的 7.4 KM 則在前端受控距離表，可跨裝置一致呈現。不得把補登誤作巡店資料回寫，也不得為此修改 GAS Deployment。

## 2026-08-26 ｜ Codex（KPI 戰情間歇性 HTTP 404 診斷與有限重試 hotfix）

- Root Cause：`Intermittent GAS HTTP 404, root cause not conclusively proven`。15:22 的 404 未留存可驗證 server／redirect trace；目前無敏感匿名探測連續三次皆為 `/exec` 重新導向一次後 HTTP 200，只能確認現行 endpoint 與 redirect chain 當下可用，不能回推先前 404 的確切責任層。
- 做了什麼：從 `origin/main` `c67d6de` 建立獨立 `hotfix/kpi-http-retry-20260826`，rollback tag `rollback/kpi-http-retry-premerge-20260826-c67d6de` 已先推送。只在共用 `kpi-battle-controller.js` 對 `private_access`／`kpicalc_access` 的 HTTP 404、429、500、502、503、504 與 network exception 做最多三次 request（等待 2 秒、5 秒）；業務驗證、綁定申請與管理者核准不 retry。主站每日回報共用的 `privateDashboardPost()` 保持原樣。
- 診斷／隱私：失敗紀錄只含 timestamp、action、attempt、HTTP status、去除 query/hash 的 response URL、redirected、Content-Type、exception type、retry success 與 original-exec／redirect-target／network-exception；不記員編、bootstrap code、device/session token、admin secret、POST body 或私有資料。
- 結果（本機完成／待 PR 與正式驗收）：新增 retry 契約 `14/14`、全 Node 契約 `320/320`、KPI standalone／原 index／台獎／每日回報 Chromium `43/43` 通過；初次 Chromium 在受限沙箱因 macOS Mach port 權限 43/43 無法啟動，改在核准的非沙箱本機環境精準重跑後全數通過。沒有修改 GAS Deployment ID、Approved Device、員編規則、device fingerprint、session/TTL、綁定／核准流程、Drive 正式資料、KPI／台獎計算、每日回報 API、快速更新、巡店 GAS 或 Service Worker cache 策略。

## 2026-08-25 ｜ Codex（PR #97 follow-up：STORES gate／SheetJS 0.20.3／選檔後載入）

- 做了什麼：在原分支追加 follow-up；本機 rows 先同時核對正式 `STORES` code/name，矛盾或任一未知整批封鎖，通過後正規化正式 code/store 才進 dedupe 與既有 Preflight。SheetJS 改為官方 0.20.3 full browser build；初始頁面不載入 parser／SheetJS，選檔後才各載入一次，失敗維持零 Preflight／零 `ptwrite`。
- 測試：Patrol Node passed 96／failed 0／skipped 0；正式 Patrol＋Auth Chromium passed 81／failed 0／skipped 0；follow-up Chrome 8/0/0、WebKit 8/0/0。全站 Chromium total 193：passed 187／failed 6／skipped 0；6 個 failed 均在本分支零 diff 的 Supervisor App 班表／半月讀取範圍。
- 邊界：PR #97 維持 Draft；沒有修改 GAS、schema、auth/session、里程或正式資料。正式寫入 UAT、正式 readback、合併、Pages／GAS 部署與 Liam 實機驗收均未執行。

## 2026-08-25 ｜ Codex（正式 Patrol 本機選檔入口，Draft PR／未部署）

- 做了什麼：從最新 `origin/main` `bda6e4a` 建立獨立 `feature/patrol-local-file-import-20260825`。只在正式 `patrol.html` 的「貼上巡店紀錄」區塊增加 `.xlsx/.xls/.csv/.tsv` 本機選檔；固定版 SheetJS 與 License 存在 repo，本機 parser 輸出既有十二欄後沿用正式 `patrolServerPreflight → pendingPatrolWrite → ptwrite → ptdetail readback → cloudLoad／MI.open`。
- 結果（本機完成／待 UAT）：Patrol Node `91/91`、正式 Patrol＋auth Chromium `79/79`、本機選檔 Chromium `6/6`、WebKit `6/6` 通過。全站 Chromium `184/191`；本次曾影響的原貼上 readback 文案已恢復且精準重跑通過，剩餘 6 案在本分支零 diff 的 Supervisor App 班表／半月讀取範圍，序列重跑仍為既有失敗。
- 邊界：PR #95 Lite 維持暫停；沒有搬入 Lite 程式。Patrol GAS、共用 GAS、schema、auth/session/token、里程模組、看板規則、班表、半月、大盤、媒體、稽核、JSON/localStorage 與頁籤／登入均零變更。未執行正式 GAS 寫入、正式 readback、Pages 部署或 Liam 真實檔案／iPhone UAT，不可宣稱正式完成或已上線。

## 2026-08-24 ｜ Codex（KPI／台獎 freshness P0，台獎正式發布 blocked）

- 做了什麼：建立獨立 `hotfix/kpi-awards-freshness-p0-20260824`，修正 KPI 版本日期只接受已解析 period end 與 snapshotDay 相同的有效日期；8/23 manual cutoff 8/22 不再誤擋 8/24 `0824.xlsx` cutoff 8/23。runtime 另加入 01-08-03／01-08-04 原始來源 identity gate（canonical basename、mtime、size、SHA-256、run_id），並使 private snapshot／正式 readback 比對兩份獨立台獎 source identity。
- 結果（部分完成）：KPI contract 73/73、網站發布 gate／台獎 contract 25/25、Python 日期／來源／freshness 10/10 通過；8/24 真實台獎原始檔仍為 8/23 mtime 與相同 SHA-256，source-only preflight 已正確 fail-closed 為「今日台獎來源尚未更新」。沒有建立今日台獎 Mail、Website／App snapshot，沒有呼叫巡店。
- 經驗 / 給下一位的提醒：canonical staging copy 的今日 mtime 不可當成原始新鮮度。需等待兩份真正更新的 01-08-03／01-08-04 原始檔，再以本 run 的雙 source identity 重建、發布並完成 Website 與 Supervisor App readback；在此之前不可宣稱 P0 結案。


## 2026-08-24 ｜ Codex（Liam Supervisor 穩定 iPhone PWA 入口）

- 做了什麼：從乾淨 `origin/main` `fc83f94` 建立隔離分支 `feature/liam-supervisor-pwa-iphone-stable-20260824`，提交 `96184ec`。PWA 固定以既有 `app.html` 為 Safari／加入主畫面入口；manifest 明確採 standalone 且不偏好原生 App，Service Worker 對同源 shell 採 online network-first、offline fallback，避免 iPhone 保留舊版版本化 asset。
- 結果：Node 核心契約 `38/38`、390×844 Chromium 行動版 `11/11` 通過；測試涵蓋未核准 fail-closed、Approved Device、KPI／台獎／回報／班表／巡店互動。Service Worker 不快取 GAS/private API、credential 或正式資料。原生 iOS WKWebView／簽署、`gas/Code.gs`、private_access、Approved Device、資料契約與每日自動化皆 0 diff。
- 正式發布／readback：PR #84 已合併為 main `486c4b6`；Pages run #32655133444 的 build／deploy／report 均成功。正式 `app.html`、manifest、Service Worker、`app.js` 以 SHA-256 逐一與合併版本一致；這只證明靜態 PWA 資產發布，尚不含核准裝置資料或 iPhone 實機驗收。
- 經驗 / 給下一位的提醒：加入主畫面可能是獨立裝置儲存區；未核准時必須沿用 `private_request` 與人工核准，絕不可複製 Safari device ID 或免驗證。尚未合併／Pages 部署／正式資料 readback 或 Liam iPhone Safari 驗收；原生 App 僅保留回退。

## 2026-08-23 ｜ Codex（Liam Supervisor App D+1 KPI 補值 hotfix，未部署）

- Root Cause：正式快照為截止 `2026-08-22`、來源 `0823.xlsx`；App 仍用 snapshot 日期推算
  `0822.xlsx`，把有效 D+1 快照誤判為不同來源。`kpicalc_access` 的九店 KPI 可顯示，但公司排名、
  區 KPI、DOD、排名變動與加減分被 fail-closed，與 iPhone 畫面一致。
- 修正：App 改為比對 snapshot `report_date`／cutoff 與 `kpicalc` cutoff 同日，並直接比較雙方
  canonical source basename；不再由日期推算附件檔名。同步更新 App／Service Worker release query
  與 cache namespace，避免 iPhone 保留舊 artifact。另修正兩項測試使用的舊巡店 session key；
  巡店 runtime、端點、GAS 與正式資料均未變更。
- 結果（本機完成／未部署）：KPI mapping／source Node `35/35`、App Chromium `11/11` 通過；
  `0823.xlsx`／cutoff `2026-08-22` 回歸可讀回區 KPI、公司排名、DOD、排名變動與加減分。

## 2026-08-23 ｜ Codex（台獎 snapshot source_file runtime follow-up，未發布）

- Root Cause：台獎 snapshot builder 遺漏頂層 `source_file`，正式 readback 亦未把台獎來源納入同源 gate；
  因而在 8/22 canonical input 下 KPI 有 `0822.xlsx`、台獎卻是空值。
- 修正：台獎 public／private snapshot 僅取同次 `today_report_data.json` canonical source path 或 source file 的
  `.xlsx` basename；缺值在任何輸出前 blocked。正式 publisher 現同時檢查 KPI／台獎 source file、report date
  與逐值 snapshot，一方為空、不同檔名或日期不一致均 fail-closed。
- 結果（本機完成／未發布）：暫存 JSON source-output `1/1`、Node formal／ingest `24/24` 與 Python syntax
  compile 通過。未讀取／輸出員編、未發布私有 snapshot、未改 Sheets、GAS、Pages、KPI／台獎計算或巡店。

## 2026-08-23 ｜ Codex（source_date_range 月內簡寫 runtime follow-up，待正式發布）

- Root Cause：8/22 runtime patch 的 downstream consumer 已有截止日處理，但 daily runner 上游
  `extract_today_report.mjs` 仍只接受半形 `YYYY/MM/DD ~ MM/DD`。全形 `～` 或完整結束日期會被
  擷取成空值，才在 consumer 出現 `source_date_range` lacks an end date；屬另一個舊解析器，
  不可由 `0822.xlsx`、寄信日或系統日期補造截止日。
- 修正：僅在 runtime 的實際擷取／consumer 路徑加入共用 strict parser。完整範圍、半形／全形月內
  簡寫都以 `source_date_range` 最後一日為準，月內簡寫僅補起始年；檔名、空值、無效、逆序、跨年
  歧義與晚於 run date 一律 fail-closed。KPI／台獎計算、Sheets、GAS、Pages、巡店及正式資料皆 0 變更。
- 結果（本機完成／待正式發布）：Node 非寫入回歸 `24/24` 通過。正式契約保持
  `report_run_date=2026-08-22`、`report_date=data_as_of_date=2026-08-21`、`source_file=0822.xlsx`。
  runtime 位於 repo 外；此分支只保存可重現 patch、SHA-256、測試證據及必須先 reverse-check 的 rollback 指令。

## 2026-08-22 ｜ Codex（戰報日期契約正式發布＋readback 同步延遲修正）

- 結果：PR #76 已合併；正式私有網站已發布並讀回 `reportDate/dataAsOfDate=2026-08-21`、來源 `0822.xlsx`，KPI 9 店／40 人／25 項，台獎 13 機款／10 列且逐值一致。Manifest 為 `published-verified`，日期與來源一致，owner 與 PRIVATE 權限正確。
- 補強：首次發布後立即 readback 曾因 snapshot propagation delay 暫時不一致，閘門正確 blocked；數秒後逐值差異為 0。Publisher 改為最多三次、每次五秒的有限 readback retry，最後一次仍不一致就 fail-closed。新增「短暫不同步後通過」及「重試用盡仍 blocked」測試，相關 Node gate 22/22 通過。
- 提醒：不得把一次發布 API 成功當完成；只認正式雙路 readback 與 manifest。有限重試僅吸收短暫同步延遲，不可移除或弱化精確比對。

## 2026-08-22 ｜ Codex（戰報執行日／資料截止日分離，Draft PR）

- Root Cause：Mac `report-automation` 以單一 `REPORT_DATE_ISO` 同時代表寄信日、manifest 日與網站 snapshot 日；`build_github_pages_data.py` 又讓台獎從 email body 檔名取日期。當 `0822.xlsx` 的資料範圍只到 8/21 時，正式 KPI parser 正確讀到 8/21，但 dashboard snapshot／readback 仍要求 8/22，因而被 fail-closed date gate 擋住。
- 修正：實際非 Git runtime 明確分成 `report_run_date`／`mail_date` 與 `data_cutoff_date`。Builder 從 `source_date_range` 取得 cutoff，並接受顯式 `--report-run-date`／`--data-cutoff-date` 交叉驗證；KPI／台獎 `report_date` 與 KPI `data_as_of_date` 都改用 cutoff，來源檔仍保留 `0822.xlsx`。Consumer、publisher、Keychain wrapper 與 manifest/readback 全鏈傳遞兩個日期；任一缺少、無法解析、晚於 run date 或正式讀回不一致都維持 blocked。
- 驗證（未發布）：Node 日期／正式 gate `20/20`；Python 日期契約與真實 8/22 本機產物 `3/3`。回歸案例確認寄信／檔名日 2026-08-22、資料截止日 2026-08-21 時，KPI／台獎 snapshot `report_date=2026-08-21`、KPI `data_as_of_date=2026-08-21`、`source_file=0822.xlsx`。未合併 PR、未部署 Pages／GAS、未執行正式私有資料發布或 r…10598 tokens truncated…/ 進行中）：以 0805 正式產物重建驗證：北一二B保險搭售率 `46.154%`，九店皆有實際搭售率；vivo X300／V70 FE 範例，北一二B 80%／100% 為 `$2,215`／`$3,410`，店點 50%／100% 為 `$2,130`／`$3,195`。契約測試 17/17、介面測試 32/32 通過。
- 經驗 / 給下一位的提醒：篩選器的北一二B金額只取 `supervisor` 規則的 80%／100%，店點金額只取 `manager` 規則的 50%／100%，不得把兩條獎金軌合併；上方實際獎金排序與優先補量卡不因篩選器而改動。

---

## 2026-08-05 ｜ Codex（KPI／台獎日期契約與同次快照補值）
- 做了什麼：修正 `index.html` 將 KPI 的「戰報發布日」與來源「資料截止日」混用的問題。`kpicalc_access` 仍是 KPI 實績、目標、店點總達成與指標的唯一來源；只有私有 snapshot 的 `report_date`、`data_as_of_date`／`source_as_of_date`、`source_file` 全部與 kpicalc 一致時，才補入公司／個人排名、DOD、加掛得分、個人台獎與保險搭售率。台獎一致性改比 `report_date`。本機 `build_github_pages_data.py` 也將快照補齊 `data_as_of_date` 與 `source_file`。
- 結果（成功 / 失敗 / 進行中）：0805 契約資料已驗證為戰報日 `2026-08-05`、資料統計至 `2026-08-04`、來源檔 `0805.xlsx`、公司排名 `34`、整體 KPI `109.7%`、加掛 `12.35`、KPI `9` 店／`41` 人、台獎 `13` 款／`10` 列。前端與契約測試同時保護 `gas/Code.gs`、`patrol.html` 不得變更。
- 經驗 / 給下一位的提醒：先前 2026-07-31 的「不得混入 snapshot」規則只適用於未驗證或舊快照。本契約以三項同次來源門檻取代它；任一項不符時必須維持「尚未同步」，不可回退到 localStorage 或舊 JSON，也不可拿 `data_as_of_date` 當 `report_date`。

---

## 2026-08-04 ｜ Codex（正式 Apps Script v26 與直接 POST 傳輸修復）
- 做了什麼：以遠端 `main` 的 `9f3e729` 為基準完成 Apps Script v26 部署，並將 `index.html`、`kpi.html` 的正式 GAS 請求從隱藏 iframe 改為直接 `fetch` POST；另加入管理者私有快照狀態讀回路由供發布驗證。
- 結果（成功 / 失敗 / 進行中）：Apps Script v26 已成功更新，HTTP 200 / `status=ok` 已確認；iframe 在 Chrome 實測會逾時，直接 POST 修復待 GitHub Pages 建置後重新驗收。
- 經驗 / 給下一位的提醒：Apps Script 端點可直接 POST 時，不能只以頁面 HTTP 200 判斷前端可用；必須實際驗證登入、回報寫入與快速更新流程，並以瀏覽器截圖及雲端讀回作為完成證據。

---

## 2026-07-31 ｜ Claude（方案 A 實作：index.html KPI 戰情改讀 kpicalc 唯一正式來源）

- 做了什麼：依 Liam 拍板實作方案 A。`index.html` KPI 戰情頁籤登入後改打 `kpicalc_access`
  （與 kpi.html 完全同一份受保護 JSON、同一個第 15 版主部署，**GAS 零改動、零新部署**），
  新增 `kpicalcToKpiBattleView()` 轉接層餵給既有渲染器；`_kpiBattleData` 不再吃
  `snapshot.kpiBattle`，KPI 頁籤的本機快照回退移除（台獎頁籤與其回退**完全未動**，
  snapshot 降為台獎來源＋舊版回復）。另補齊正式驗收清單（HANDOVER §7.10）。
- 結果：新契約測試 `kpi-battle-source.test.cjs` 11/11（含轉接層實際執行）、
  `app.spec.js` KPI 戰情段落改寫後 31/31、上傳 33/33、契約 70/70。
  **未建 PR、未合併、未部署**；等 Liam 建立上傳 Deployment 後照 §7.10 驗收。
- 經驗 / 給下一位的提醒：
  1. **缺少欄位的鐵則**：company_rank／DOD／加掛分／個人排名／個人台獎／保險搭售率
     不在 kpicalc JSON——畫面一律「尚未同步」（`kpiPendingCell()`）或不出現（DOD），
     **絕不混入 snapshot 舊數字**。Playwright 有反向斷言（加掛 13.36、整體 105.5%、
     DOD 字樣、val-gold 排名節點 = 0）。要補這些欄位的正道是擴充 `kpiCalcParseReport`
     從同一份 Excel 讀，不是把 snapshot 接回來。
  2. **轉接層只搬運與加總，不發明數字**：店點總達成率直接取 `official`；
     整體核心項＝各店 a/t 純加總；整體總達成率需加權、無法由 kpicalc 推得 → null（尚未同步）；
     進度差由同一組 meta（snapshotDay/monthDays）換算。有逐條行為測試。
  3. **updatedAt 目前拿不到**：第 15 版 `kpicalc_access` 回應沒有檔案 mtime，
     來源列顯示「更新時間 尚未同步（讀取於 <本機時間>）」。想補它要等主部署未來升版時
     在 kpiCalcAccess 回應加 `updatedAt`，不值得為此動第 15 版。
  4. **登入順序刻意台獎先渲染**、kpicalc 包獨立 try——kpicalc 失敗只影響 KPI 頁籤，
     訊息寫明「台獎頁籤不受影響」。
  5. 測試小坑之前也踩過一次：契約測試用 `doesNotMatch` 禁字時，**程式註解裡的
     識別字也算命中**——註解請改寫成不含禁字的說法，不要放寬測試。

## 2026-07-31 ｜ Claude（分支校正＋資料鮮度診斷落檔＋獨立上傳 Deployment 隔離）

- 做了什麼：依 Liam 指示停用舊分支 `claude/quick-report-upload-feature-elyajz`（含 bde4c6b
  事故歷史），從去污染驗收的 `claude/quick-report-upload-clean`（bc9301b，base adf7542）建出
  `claude/report-data-freshness-hotfix` 繼續。三件事：
  ①把「網站顯示舊資料」現場診斷**重寫**進本分支文件（HANDOVER §7.9，只搬文件不搬舊分支程式碼）；
  ②實作**部署隔離閘**：`reportUploadIsUploadDeployment_()` ＋指令碼屬性
  `REPORT_UPLOAD_DEPLOYMENT_URL`——當請求由「上傳專用 Deployment」服務時，doPost 只放行
  `report_upload_*` 四路由、doGet 只回 ping（帶 `app:'report-upload'` 識別），
  其餘 read/write/巡店/戰情一律拒絕；屬性未設定＝隔離不啟用，主部署行為不變（安全預設）；
  ③`report-upload.html` 改用獨立 `UPLOAD_GAS_URL` 常數（CHANGE_ME 佔位），
  不再引用每日回報端點，佔位未填時登入直接被擋、零請求送出。
- 結果：契約測試 70/70（新增 4 條：路由白名單恰為四個、doGet 隔離、隔離函式六情境行為、
  前端端點分離）、Playwright 33/33（新增佔位守門＋卡片標示）。HANDOVER §11 改寫為
  雙 Deployment 部署程序（含驗證與一鍵回滾）。**未建 PR、未合併、未部署。**
- 經驗 / 給下一位的提醒：
  1. **每日回報 Deployment 固定第 15 版**：貼新碼進編輯器不影響它；部署上傳功能時走
     「部署 → **新增部署作業**」拿全新 /exec URL，**絕不要 ✏️ 編輯既有每日回報部署**。
     回滾＝清空 `REPORT_UPLOAD_DEPLOYMENT_URL` ＋封存新部署，每日回報全程不受影響。
  2. **隔離判斷靠 `ScriptApp.getService().getUrl()` 比對屬性**：時間觸發器沒有 getUrl，
     函式以 try/catch 包住一律回 false，排程不受隔離影響（有行為測試）。
  3. **上傳頁端點固定寫死、無任何瀏覽器儲存覆寫**（bde4c6b 事故後的資安基準）；
     `window.__UPLOAD_GAS_URL_OVERRIDE__` 僅供 Playwright 在頁面載入前注入，正式頁不設。
  4. 診斷結論（Liam 已確認）：kpi.html 與 index.html **不是同一正式資料來源**——
     前者吃 GAS 排程產的 kpicalc JSON，後者吃 Liam 本機 Mac `report-automation` 產的
     dashboard snapshot。7/31 未更新＝來源資料夾沒有 0731.xlsx ＋本機流程沒重跑，
     不是程式壞掉。`Y26重點台獎手機.xlsx` 確認就是獎階表。
  5. 綜合戰情一致化：建議**方案 A**（index.html KPI 頁籤改讀 kpicalc JSON，GAS 免部署、
     不複製第二份真相），但 company_rank／DOD 欄位不存在於 kpicalc JSON，需 Liam 先接受取捨。
     比較表在 HANDOVER §7.9。
  6. 台獎雲端化仍缺：`Y26重點台獎手機.xlsx` 的獎階內容（工作表／欄位）、
     `update_phone_awards.py` 原始碼（或欄位對照邏輯）、`difference` 規則確認。
     拿到前不寫台獎解析器；本機發布流程照舊保留。

## 2026-07-31 ｜ Claude（快速上傳去污染：從回復後的 main 重建乾淨分支，待 Liam 驗收）

- **背景**：`claude/quick-report-upload-feature-elyajz` 是從事故 commit `62cbe1e` 分出去的，
  base 內含 `bde4c6b`，其 `index.html` 仍帶著「請輸入已核准裝置的員工編號」。
  直接合併會讓當天的全門市中斷事故完整重演。
- **做了什麼**：**不用盲目 rebase**。從回復後的 `origin/main`（`adf7542`）開
  `claude/quick-report-upload-clean`，先逐一盤點原分支 6 個 commit，確認它們
  **完全沒有動 `index.html`／`kpi.html`／`patrol.html`**，污染風險只集中在 `gas/Code.gs`。
  再以 `git diff 62cbe1e..42e3036` 隔離出「純上傳變更」（此區間已排除 `bde4c6b`），
  只把這份差異套到新 base，新檔案（`report-upload.html`、3 份 SPEC/FILE-MAP/HANDOVER
  文件、2 支測試）直接取自原分支。**原分支保留不刪、不改寫，作為備份。**
  原分支的 `docs/COLLAB-LOG.md` 刻意不搬——它基於事故版，搬過來會蓋掉事故紀錄。
- **結果**：`index.html`／`kpi.html`／`patrol.html` 與 main **diff 為 0 行**；
  `gas/Code.gs` 只新增 5 處（doPost 4 條 `report_upload_*` 路由、`kpiCalcPublish` 與
  `privateDashboardPublish` 各 6 行只登記版本、`kpiCalcAutoUpdate` 19 行排程防覆蓋、
  檔尾 824 行上傳模組）。`doGet`／`readData`／`writeData`／`readPersonal`／`writePersonal`／
  `privateDashboardAccess`／`kpiCalcAccess`／`privateDashboardIsTrustedEmployee`
  **逐函式 md5 與 main 完全相同**。全 repo 掃不到 `ensureReportSession`／`protectedGasPost`／
  `reportSessionRequired_`／`report_auth` 任一個。
  測試：Node 契約 **78/78**、`report-upload.spec.js` **31/31**、`app.spec.js` **30/30**。
- **經驗 / 給下一位的提醒**：
  1. **上傳功能的授權與每日回報是分開的，請維持這樣。** `reportUploadAuthorize_()` 走的是
     `DASHBOARD_ADMIN_SECRET` ＋ `REPORT_UPLOAD_ALLOWED_EMPLOYEES` 白名單
     （未設定時退回 `DASHBOARD_TRUSTED_EMPLOYEE_ID`），**完全不碰 `DashboardUsers` 裝置名冊**。
     它只保護「上傳與發布」這個管理動作，不是登入閘門。
  2. **命名沒有衝突但很接近，改的時候看清楚**：上傳模組是 `reportUpload*`／`reportVersion*`，
     事故那組是 `reportSession*`／`report*Payload_`。前者可留，後者不可回來。
  3. **`tests/patrol.spec.js` 在這個容器裡本來就不穩定**。實測 `origin/main` 原始碼連跑兩次，
     失敗集合分別是 {341,365,545,783} 與 {341,365,525,535,783,798}，每次都不同。
     其中 341／365 是 headless_shell 不回傳 `download.suggestedFilename()` 的固定環境問題。
     **判斷回歸請單獨重跑該測試，不要只看一次全量結果就下結論。**

## 2026-07-31 ｜ Claude（🚨 正式站全門市回報中斷事故：回復 bde4c6b 程式碼，保留事故文件）

- **事故**：全門市開 `index.html` 即跳瀏覽器 prompt「請輸入已核准裝置的員工編號」，
  輸入員編也進不去；每日回報讀取與儲存全數失敗，當日回報資料有持續遺失風險。
- **根因**：`bde4c6b`（Codex，07-31 01:03，已推 main 並部署 Pages run `30564346083`）
  把每日回報綁進了**只給 KPI／台獎私有戰情用的 `DashboardUsers` 裝置核准名冊**。
  `window.onload`（`index.html:2288`）→ `fetchDayData()` → `ensureReportSession('employee')`
  → prompt。**門市同仁從來沒被登錄進那份名冊**，所以無人能通過。
  疊加另兩項回歸：①`privateDashboardAccess` 與 `kpiCalcAccess` 兩處的
  `privateDashboardIsTrustedEmployee()` 豁免被刪，信任員編換裝置即鎖死；
  ②員編／session／`bei12b_kpi_emp`／`bei12b_shadow_*` 全改成純記憶體變數，
  重新整理就登出、影子備份救援機制同時失效。
- **範圍釐清**：**不是**資料遺失、**不是**路由錯誤、**不是** onclick 綁錯或載入順序問題，
  也**與 `claude/quick-report-upload-feature-elyajz` 無關**（`42e3036` 未合入 main，已用
  `merge-base --is-ancestor` 驗證）。`DashboardUsers`／`DashboardRequests` 兩張表
  **完全沒被動過**——`bde4c6b` 只改比對條件，未改任何名冊寫入或刪除邏輯。
- **做了什麼**：依 Liam 指示執行方案 B 止血。**只回復造成事故的程式碼檔案**至
  `dadd286`（`bde4c6b` 的 parent，已驗證為事故前最後正常版）：
  `index.html`、`kpi.html`、`gas/Code.gs`、`patrol.html` 與對應測試；
  **刻意保留** `docs/PATROL_SECURITY_REVIEW_20260731.md`、Codex 的事故當事人紀錄、
  Playwright 1.55.1 升級與 `playwright.config.js` 的可攜性修正。
  未 force-push、未改寫 git 歷史、未碰任何正式資料與核准紀錄。
- **結果（已完成止血，正式站恢復）**：Node 契約 12/12、Playwright 66/68。
  那 2 個 fail（`patrol.spec.js:341/365`）**在事故版 62cbe1e 上跑也同樣 fail**，
  是 headless_shell 不回傳 `download.suggestedFilename()` 的環境問題，非回歸。
  Liam 先完成 GAS「每日回報 Deployment」第 22 版 → 第 15 版切版並實測讀寫正常，
  之後 `1799d58` 以 fast-forward 推上 main（`62cbe1e..1799d58`，未 force-push），
  Pages run **`30620023862` 部署成功**（2026-07-31 09:28:43Z）。
  巡店 Deployment 與七分頁 Deployment 依判斷**維持原狀未動**——
  `bde4c6b` 未改動 `ptread/ptwrite/hread/hwrite/sread` 契約，`dadd286` 版 `patrol.html`
  與第 22 版巡店 API 相容；七分頁專案無前端 API，回退只會白白拆掉與本事故無關的
  公式注入防護。
- **⚠️ 未爆彈：`claude/quick-report-upload-feature-elyajz` 是從事故 commit `62cbe1e`
  分出去的**，因此**含有 `bde4c6b`，其 `index.html` 仍帶著那句 prompt**。
  該分支目前未合入 main、不影響正式站，但**直接合併就會讓整起事故重演**。
  接手前必須先 `git rebase --onto 1799d58 62cbe1e` 或改由新 main 重開分支。
- **經驗 / 給下一位的提醒**：
  1. **本機 `origin/main` 會過期，只看本機 branch 會完全誤判事故版本。**
     這次一開始看到的 main 是 `857a536`，重新 `git fetch` 後才發現已被推到 `62cbe1e`。
     查正式站事故，第一步一定要先 fetch。
  2. **每日回報與 KPI／台獎共用同一個 Deployment `AKfycbwf…onDIl4Mi`**
     （`index.html` 與 `kpi.html` 都指它），巡店是另一個 `AKfycbznzo…Grghd-Mv`。
     動其中一個的授權條件會同時影響兩個系統，改之前務必確認影響面。
  3. **授權範圍不等於授權強度。** 把「少數人的裝置核准名冊」套到「全門市每天在用的路徑」，
     就算每一行程式都正確、測試全綠、資安報告 0 高風險，結果仍是全站中斷。
     新增授權時要先問「現在有多少人在這份名冊裡」，而不是只問「這樣夠不夠安全」。
  4. GAS Deployment 版本回復**只需在原 Deployment ID 選回舊版，不要貼 `Code.gs`**——
     貼碼就會重演 2026-07-25 的 `kpiCalc*` 無聲洗掉事故。

## 2026-07-31 ｜ Codex（匿名讀寫 P0 資安修補與正式 GAS 部署）

- 做了什麼：只針對本次確認的匿名讀寫與瀏覽器敏感資料風險做最小修補。
  `read/write/pread/pwrite` 已停止 GET／JSONP 存取，改為 GAS 後端驗證短效
  session；員工 session 必須同時符合啟用名冊、員編與已核准裝置，`pread`
  僅限督導，員工 `read/write/pwrite` 另受店別範圍限制。session 只存記憶體，
  登出會在後端撤銷；姓名、員編、改善內容與私有附件不再寫入
  localStorage／sessionStorage。另固定受保護 GAS URL、移除 repo 內固定通行碼，
  補上輸出 HTML escaping、七分頁公式注入防護與 Drive 連結 allowlist。
- 結果：正式七分頁 Script `17XfhB1cYOIWIyIm0_1mO1a9-ba-H4QCBJHX56bYHiEX06XSSG05FWtlg`
  由第 19 版更新至第 20 版；正式主 Script
  `1SW9qr0CU9Xvy97XkVr3n51_4Dx_6GArnTXT8780t0HofIB74v9IDMkWf`
  的巡店與每日回報兩個 Deployment 均更新至第 22 版。`PT_KEY` 已輪替並只保存在
  Script Properties，管理用副本在 macOS Keychain。完整本機契約 20/20、
  Playwright 71/71、npm audit 0。正式匿名、假 token、模擬過期 token、登出後舊 token
  均只回 unauthorized；匿名寫入隔離標記授權讀回為 0 筆。GitHub Pages
  `bde4c6b` 的 run `30564346083` 成功；正式桌機無痕 A／B／C 與 390×844 行動版
  均通過，行動版另確認 11 天／74.5 KM、對帳相符、正式 Excel 可下載且無水平溢位。
- 經驗 / 給下一位的提醒：Apps Script ContentService 無法自行設定 HTTP status，
  因此外層 HTTP 仍為 200，應以 JSON `status:"error", code:403` 判斷拒絕。
  部署前備份位於
  `private-backups/patrol-security-predeploy-20260731004841/`；四個既有觸發器未重建。
  正式金鑰不可回填 repo、文件或瀏覽器 storage；若要回滾，應在原 Deployment ID
  選回第 19／15／21 版並以備份最小還原 HEAD，不能整份六分頁覆蓋七分頁專案。

## 2026-07-30 ｜ Codex（巡店里程＋正式 GAS 七分頁安全整合，待 Liam 驗收）

- 做了什麼：由最新 `origin/main` `f4de11f` 建立
  `integration/patrol-mileage-gas7-20260730`；確認里程最終 commit `c5bf782`，只取其
  `patrol.html`、`tests/patrol.spec.js` 與協作紀錄內容。另以 Apps Script 後台實測鎖定
  4-trigger 專案 `17XfhB1cYOIWIyIm0_1mO1a9-ba-H4QCBJHX56bYHiEX06XSSG05FWtlg`，
  完整備份正式 `程式碼.gs`、`appsscript.json`、第 19 版部署與 4 個觸發器；把線上第七分頁
  `改善提醒與照片` 的 7 個獨有函式與 `sendWeeklyPatrolReport` 最小差異納入 repo，
  未整份覆蓋任一正式專案。
- 結果：Y2606 11 個報銷出差日／74.5 KM、6/15 4.4＋10.0＝14.4、油料 11 列、
  距離明細 12 段與空白備註均通過；Node／GAS 契約 12/12、完整 Playwright 68/68。
  里程 DOM 仍位於 P0 驗證後才建立的 template，所有頁籤共用 verified session。
  `patrol.html` 正式 API 仍指向另一路第 21 版專案 `1SW9...`，URL 未改。
- 經驗 / 給下一位的提醒：目前是兩個正式 Apps Script 角色，不可只看同名專案。
  里程是純前端，不需要 GAS 新版；未經 Liam 驗收不得部署 Pages，也不得把 repo
  `gas/Code.gs` 整份貼到任一專案。4-trigger 專案排程跑 editor HEAD，切回 Web App
  第 19 版不會回滾觸發器程式；需用安全備份還原 HEAD。另因 Y2606 路線／公里數、
  成本歸屬與車號預設值仍是 `patrol.html` 內的靜態 JavaScript，P0 DOM gate 無法阻止
  view-source；Liam 尚未確認可公開或授權改由 verified token 後載入前，正式部署維持
  blocked。詳見
  `docs/PATROL_MILEAGE_GAS7_PREDEPLOY_20260730.md`。

## 2026-07-29 ｜ Codex（P0 Liam 情報站全站權限修復）

- 做了什麼：由執行當下最新 `origin/main` 建立
  `security/patrol-full-auth-gate-20260729`；先以獨立 commit `c67e012` 關閉
  `home.html` 督導入口。`patrol.html` 改為正式 GAS 回 `status:"ok"` 前只建立全頁鎖定，
  不建立督導 DOM、不執行 render／cloudLoad、不切頁或讀取巡店、班表、半月資料。
  通行碼只送一次，成功後改用 sessionStorage 的 30 分鐘 token，登出與錯誤驗證清除全部狀態。
  正式 GAS 只套用權限最小差異：`PT_KEY` 移至 Script Properties，全部巡店／班表／半月／媒體
  action 統一後端驗證，`ping`／`pthealth` 只保留最小健康資訊。
- 結果：成功。正式 Apps Script 專案
  `1SW9qr0CU9Xvy97XkVr3n51_4Dx_6GArnTXT8780t0HofIB74v9IDMkWf`、
  Deployment ID
  `AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv`
  已由第 20 版更新至第 21 版。GAS 負向契約 8/8、Node 9/9、Playwright 51/51，
  正式 A/B/C 全新隔離瀏覽器與登出驗收全數通過。確認既有 KPI、自動更新、通知與週報
  關鍵函式仍存在後，入口才由 commit `f17e41e` 重新開放；Pages run `30448659037` 成功。
- 經驗 / 給下一位的提醒：前端顯示密碼框不等於授權；巡店主頁本身也必須受同一個
  verified session 約束。正式密碼不得進 repo／文件／localStorage。後續若權限回歸，
  先重新套用 `c67e012` 的緊急關閉，再將 GAS 部署切回第 20 版；未完成正式 GAS 與無痕
  驗收前不得重新開放入口。正確憑證的寫入／媒體上傳仍需另行指定安全測試資料。

## 🔴 進行中／待辦（2026-07-30 更新，接手者先看這段）

**狀態：全線正常。11:00 排程已在 0730 首次獨立驗證成功（非人工補救）。**

| 項目 | 狀態 |
|---|---|
| repo 程式碼 | ✅ `gas/Code.gs` **2028 行**（自動化＋通知信＋日報格式回退＋Codex P0 權限修復）；已部署第 21 版 |
| 通行碼 | ✅ 已移至 Script Properties（Codex P0 修復），repo 與文件均無明碼 |
| Drive API 進階服務 | ✅ 已啟用（0729 由 Codex 補上） |
| **11:00 自動更新** | ✅ **0730 排程自主跑通**：台北 **11:51** 寄出 `✅ KPI試算資料已更新（0730.xlsx）`，主旨無「手動發佈」字樣，私有檔 modifiedTime 同步為 03:51Z，累計推進到 07/29 |
| 12:30 巡檢 | ✅ 正常（今天自動更新成功 → 巡檢靜默不寄信，符合設計） |
| 同仁看到的資料 | ✅ 累計 **07/29**，區平均 1.085、8/9 店破百（僅通化 0.9189 未達標） |
| patrol.html／home.html／督導試算區 | ✅ 全部上線 |

### ⏰ 重要：11:00 排程實際落在 **11:51**，不要在 11:20 就判定失敗

`setupKpiCalcAutoUpdate()` 用的是 `.atHour(11)` **而沒有 `.nearMinute()`**，GAS 這種寫法
會在 **11:00–12:00 之間任意時間**觸發。實測這個專案穩定落在 **11:51**
（7/21 與 7/30 兩次成功排程都是 11:51 寄信）。

**踩過的誤判**：2026-07-30 我排了 11:20 的自動回檢，看到「沒有任何信 + 私有檔沒更新」，
差點依當時自己寫的判讀規則宣告「觸發器沒建立成功」。實際只是窗口還沒到。
**要驗證當天排程結果，請在台北 12:00 之後再查**（想連巡檢一起看就等 12:50）。
另外注意：**手動執行 `testKpiCalcAutoUpdate` / `setupKpiCalcAutoUpdate` 也會寄同樣的信**，
所以單看「有沒有 ✅ 信」不能證明排程有效——要一併看**寄信時間是否落在 11–12 窗口**。
（0729 那兩封 ❌15:46／✅16:09 都是下午的手動執行，不是排程。）

**怎麼驗證「是排程自己跑通、還是人工補救蓋過去」**（可複用的三層檢查）：
1. 私有資料夾 `north12b-kpicalc-private-latest.json` 的 `modifiedTime` 是否為最近
2. **看 Gmail 成功信主旨**：`kpiCalcPublish`（kpi.html 督導發佈區人工上傳）寄的信主旨帶
   **「手動發佈｜」**，`kpiCalcAutoUpdate` 寄的**沒有**這個字樣
3. **看寄信時間**：落在台北 **11–12 窗口**＝排程；其他時段＝有人在 GAS 手動執行
   （第 2 點只能排除「督導發佈區上傳」，排除不了「手動跑 testKpiCalcAutoUpdate」，
   所以第 3 點才是判斷排程是否真的有效的關鍵）
4. 需要再保險時，AI 另外重跑一次 `make_kpicalc.py` 對同一份日報，逐店比對數字是否一致

**另**：私有資料夾有一個 AI 建的測試檔 `zz-claude-write-test.txt` 可刪（AI 無刪檔權限）。

## 2026-07-29 ｜ Codex（Git 與交接文件最終封版）

- 做了什麼：以最新 `origin/main` 為正式程式基準，保留本機已驗證的
  `savedAt` 顯示時間修正、半月檢查附件連結防覆蓋契約與跨 AI 文件規範；完成衝突逐檔
  核對，未改 Google Sheet、資料欄位、Apps Script 串接或網站功能。跨站正式狀態同步至
  `../AI協作中心/00_WEBSITE_INDEX.md` 與三站 `PROJECT_HANDOFF.md`（Claude 雲端環境讀不到
  這兩份文件，只能靠這則日誌轉述結論）。
- 結果：成功。Node 契約測試 4/4、Playwright 44/44、五個主要頁面煙霧測試 5/5；
  `Code.gs` Node 語法檢查與 `.claude/scripts/auto-push.sh` Bash 語法檢查通過。
  舊版店務檢查 QA 頁仍引用缺少的 `qa-assets/` 圖檔，已記錄但未刪除或補造。
- 經驗 / 給下一位的提醒：正式接手先讀 `../AI協作中心/00_WEBSITE_INDEX.md`，
  再讀目標站 `PROJECT_HANDOFF.md`。**這則之後 Claude 又在同一天（07-29）繼續動了
  `gas/Code.gs`（恢復通行碼、日報解析回退）跟新增 `home.html`**，上面的「🔴 進行中／
  待辦」已經是合併兩邊之後的最新狀態，不是本則提到的舊快照——正式部署、GAS 線上版本
  與 Liam 驗收仍須各自取得證據。

## 2026-07-29｜Claude｜新增導覽首頁 home.html（Liam 智慧管理中心）

- 做了什麼：新增 `home.html`，四張卡片連到既有四個系統，給**門市同仁**當跳轉入口。
  純靜態、不含資料、不呼叫 GAS、不做登入——**權限一律由各系統自己把關**。
- **刻意沒做的事**：沒有把它變成 `index.html`。門市同仁的書籤都指向 index.html（每日回報），
  換掉等於他們每天多點一次。所以走獨立網址 `home.html`，**非破壞性、隨時可回頭**。
  Liam 若之後想讓它變成真正的預設首頁，那是另一個決定（要一併處理既有書籤）。
- 卡片標籤刻意標「督導專用 · 需通行碼」：同仁看得到 Liam情報站的卡片，
  先講清楚進不去，省得他們點了跳密碼框以為壞掉來問。
- 驗證：四個連結目標檔案都存在（逐一檢查）、HTML 標籤閉合無誤、
  Playwright 實跑淺色/深色/手機三種情境截圖，**無 JS 錯誤**，日期腳本正常。
- 給下一位的提醒：這頁是**唯一公開給同仁的入口**，改它要特別小心——
  任何時候都不要在這裡放門市清單、員編、KPI 數字或密碼。
  另外它用 `Microsoft YaHei` 當首選字型（Liam 指定），改字型前先問他。

## 2026-07-29｜Claude｜恢復 Liam情報站的通行碼保護（推翻昨天的「維持免密碼」決定）

- 背景：Liam 決定要做一個「工具導覽」首頁給**門市同仁**用，方便他們在四個系統間跳轉；
  但 Liam情報站（原巡店系統）只給他自己看。既然首頁會被同仁看到、Liam情報站的卡片也會露出，
  免密碼就不再安全，Liam 明確要求恢復真的密碼保護。**這推翻了昨天那則日誌「不要加回通行碼」
  的決定**——不是我自己反悔，是需求變了（首頁要對同仁公開），下一位接手不用糾結兩則日誌矛盾。
- 做了什麼：`ptAuthorized()` 從 `return true` 改回原本（2026-07-23 之前）的檢查邏輯：
  `return PT_KEY !== 'CHANGE_ME' && e.parameter.key === PT_KEY;`
- **沒做的事，且是刻意的**：Liam 在對話裡直接給了他要用的密碼明碼，但我**沒有把它寫進
  `gas/Code.gs`**。repo 的 `PT_KEY` 仍是 `CHANGE_ME` 佔位字——這是專案既有鐵則
  （見 `AGENTS.md`：密碼只存在 GAS 編輯器裡，不進 repo），git 歷史一旦寫入明碼就洗不掉，
  尤其這個 repo 會被 GitHub Pages 讀取。**Liam 貼 Code.gs 進 GAS 編輯器後，
  要自己手動把 `PT_KEY` 改成他要的密碼再存檔部署**——這一步沒有人能代勞。
- 給下一位的提醒：看到「巡店免密碼」的舊記錄（AGENTS.md/CLAUDE.md 都改過來了，但如果
  你是從對話歷史或舊 commit 訊息看到的）不要照做，**現況是有密碼保護**，`PT_KEY` 只有
  Liam 自己知道。

## 2026-07-29｜Claude｜patrol.html 改名「Liam情報站」，確定不再分享給其他督導

- 做了什麼：`patrol.html` 從「督導管理系統」再改名為「Liam情報站」（個人化名稱），
  只動 `<title>`／`<h1>`，GAS 的 `PT_TITLE`（副標題）依慣例不動。
- **關鍵決策（已跟 Liam 確認）**：
  1. **不加回通行碼保護**——`ptAuthorized()` 維持 `return true`。前端還留著「請輸入通行碼」
     的提示框、`PT_KEY` 也還會送出，**但這只是介面殘留，後端完全不檢查**，任何人拿到網址、
     隨便輸入什麼都能進去。這不是新發現的漏洞，是 Liam 2026-07-23 的明確決定，2026-07-29
     再次確認維持現況，**不要主動幫他加回密碼檢查**。
  2. **`patrol-guide.html`（給其他督導的操作手冊）正式停止維護**——分享計畫確定不做了。
     檔案還在 repo 裡（懶得刪，也沒有壞處），但內容已經過時（還寫著「督導管理系統」、
     「每人自建試算表分享」），**看到它不代表現在還要維護多督導共用的設計**，不用因為
     它跟 patrol.html 現在的名稱兜不起來而去「修正」。
- 給下一位的提醒：**這個系統現在是 Liam 的個人工具，不是共用產品**。以後改
  `patrol.html` 標題／文案時，不用再考慮「其他督導看到會不會奇怪」這件事。

## 2026-07-28｜Claude｜日報少了一張工作表，解析器加自動回退

- 症狀：0728.xlsx 只有 **25** 張工作表（往常 26），少的正是
  `上線數KPI_個人達成率_明細`——**個人資料的唯一來源**。
  舊解析器（本機 py 與 GAS `kpiCalcParseReport`）都是直接 throw「找不到工作表」，
  等於**個人資料整個斷掉**，而且 GAS 排程一旦復活也會天天失敗。
- 解法：回退到 `上線數KPI_個人達成率_店點`（依門市分群的版面）。
  先在 **0727**（兩張表都有）做交叉驗證：**40 人全對、逐項 3000 格完全一致**，
  確認可安全替代後才用。兩個落差另外補：
  1. `_店點` 沒有**店代碼** → 用店點表的「店名→代碼」對照
  2. `_店點` 沒有**職稱** → 沿用上一份已發佈 JSON（新增 `kpiCalcPrevRoles()`）
- 版面陷阱：`_店點` **不是固定 4 欄一段**（Netflix 那段因合併儲存格佔 5 欄），
  照舊的 `c += 4` 掃會整段錯位。改用 `kpiCalcBandsPairs()`：
  先抓名稱列的段起點，再在段內找「實際數／目標數／權重」的實際欄位。
- 驗證：GAS 那段邏輯**逐行用 Python 模擬**跑真實檔案，與已驗證輸出比對
  **3160 格全等**；本機解析器對 0727 重跑，輸出與原檔**位元組相同**（沒動到舊路徑）。
- 給下一位的提醒：**日報格式會變，而且是「整張表消失」這種變法。**
  解析失敗時先 `wb.sheetnames` 印出來比對，不要假設欄位錯位。
  另外「兩張表內容是否真的一樣」一定要拿有兩張表的那天做交叉驗證再換來源，
  不要因為看起來像就直接換。

## 2026-07-28｜Claude｜patrol.html 改名「督導管理系統」（刻意不動 gas/Code.gs）

- 做了什麼：`patrol.html` 已不只巡店（巡店看板＋每月班表＋半月督導檢查＋督導檢查大盤），
  改名為「督導管理系統」。只動 `patrol.html` 的 `<title>`／`<h1>`，以及 `patrol-guide.html`
  的 title／標題／footer。
- **關鍵決策：GAS 的 `PT_TITLE` 故意不改。** 它是副標題（其他督導各自填自己的區名），
  改它就得為改名再貼一次＋再部署一次 Code.gs。維持不動 → Liam 只需貼一次、部署一次，
  之後不會再有「為了改名要重貼」的第二輪。驗證：`git diff --name-only` 不含 `gas/Code.gs`。
- 經驗 / 給下一位的提醒：**前端改名時先問「這個字串是不是從 GAS 回傳的」**。
  patrol.html 的 `subTitle` 與門市清單都由 `ptread` 的 `title`/`stores` 覆蓋，
  動到那兩個就等於動到部署，成本從「改 HTML 推一下」變成「Liam 進 GAS 貼＋部署」。

## 2026-07-23｜Codex｜修復貼上巡店明細切換大盤後還原

- 根因：切換「督導檢查大盤」時會自動執行 `ptread`。貼上後的 `ptwrite` 尚在背景寫入時，該讀取可能取得舊資料並直接覆蓋 `rawDetails`，所以畫面會先更新、切頁後又還原。
- 修復：大盤切頁只重繪目前已解析的 `rawDetails`，不再另觸發雲端重讀；`ptwrite` 收到成功回覆後也不再用立即重讀覆蓋畫面。手動「重新載入」仍保留作為明確的雲端刷新動作。
- 驗證：新增回歸案例，確認已有雲端舊資料時貼上新明細、切換大盤仍保留新資料且不新增 `ptread`；完整 Playwright 43/43 通過。

## 2026-07-22｜Codex｜巡店大盤到店次數與異常門檻

- 做了什麼：每間門市在大盤標示本月到店次數（不同到店日期計一次）。
- 結果：巡店異常明細只統計本月已檢查至少 10 個不同題號、且到店至少 5 次的門市；門檻未達的異常不納入該總數。
- 經驗 / 給下一位的提醒：到店次數不可用明細列數計算，否則同一次到店多題會被重複計次；不適用項目也視為已檢查題號。

## 2026-07-22｜Codex｜巡店大盤名稱釐清

- 做了什麼：將督導檢查大盤中的「每月盤點」改稱「每月檢查一次項目」。
- 結果：完成；僅調整題 14–17 在大盤的說明與完成統計名稱，計算規則及原本「每月盤點提醒」功能不變。

## 2026-07-22｜Codex｜督導檢查大盤改採巡店明細

- 做了什麼：督導檢查大盤改直接讀取「貼上巡店紀錄」與 `ptread` 雲端明細，不再以另一份半月檢查表作為大盤依據；資料貼上、載入或重新同步後立即重算。
- 結果：完成。上／下半月依原規則採計第 2–13 項、每月盤點採第 14–17 項、雙月全盤獨立採第 18 項；每店可看到巡店明細筆數與缺漏／異常。
- 經驗 / 給下一位的提醒：此頁是原 33 項巡店紀錄的週期大盤，不應與半月督導檢查的 18 項表單資料混合；原半月表單、媒體與歷史回放仍維持原資料來源。

## 2026-07-22｜Codex｜督導檢查上下半月／雙月大盤

- 做了什麼：新增「📊 督導檢查大盤」頁籤，按門市分開呈現上半月第 1–17 項、下半月第 1–17 項，以及第 18 項固定雙月全盤；可選月份，並顯示完成、缺漏與異常數。
- 結果：完成；不更動既有逐項填寫、照片／影片、歷史回放及雲端資料結構。
- 經驗 / 給下一位的提醒：第 18 項不可併入上下半月，雙月區間採固定 1–2、3–4、5–6、7–8 月；門市名稱以去除台北前綴／杭州南尾碼正規化，避免班表和歷史名稱不同造成漏計。

## 2026-07-22｜Codex｜防止半月檢查附件連結遺失

- 查核結果：復興南當期 18 題雲端紀錄仍在，但附件數為 0。先前媒體上傳回覆 unknown action 時，照片尚未寫入私有 Drive；重新整理後暫存檔無法由雲端救回。
- 修復：上傳成功即同步該題附件連結；仍有待上傳檔案時阻擋本期同步；GAS 遇空白附件欄保留既有 Drive 連結。第 19 版 Apps Script 已部署，GitHub Pages `ba28d01` 已發布。
- 驗證：本機媒體契約 4/4、完整 Playwright 41/41，且正式 Pages 原始碼已讀到防呆標記。待原始照片由手機相簿重新上傳後，驗收實際 Drive 預覽、歷史回放與 Excel 連結。

---

## 2026-07-22 ｜ Claude（門市動物圖案第二次還原）
- 做了什麼：門市反映動物圖案又不見了。追查發現 2026-07-17 的動物改動（8c00629，已進 main）
  被 Codex 的 65c8a25「Publish KPI battle aggregate…」整檔覆蓋洗掉（從舊版 index.html
  分岔，把 store-card 9 個圖案全改回原本 emoji）。重新在最新 main 上套回動物
  （通化🐯 酒泉🐻 三創🦅 萬大🐘 六張犁🦌 復興南🐺 永吉🐲 大稻埕🦁 杭州南🐎），
  改 store-card＋selectStore icons map 兩處。
- 結果：成功（Playwright 驗證店卡與副標）。
- 經驗 / 給下一位的提醒：**⚠️ 重要協作坑——不要「整份 index.html 從舊版覆蓋」**。
  Codex 產 index.html 時若從自己的舊基準整檔輸出，會默默洗掉別人已 merge 的小改動
  （這次是動物圖案，第二次被洗）。改 index.html 請 base 在最新 main、只動自己那幾行。
  門市圖案有兩份（HTML store-card＋JS icons map），改要同步。

## 2026-07-25 ｜ Claude（自動更新停擺 4 天：根因與補救管道）
- 做了什麼：稽核發現 kpi.html 資料自 0721 起停更 4 天（0722~0725 日報都有上傳，但私有資料檔
  modifiedTime 停在 7/21）。**根因：GAS 編輯器被貼成舊版程式碼**，kpiCalc* 函式消失 →
  11:00 觸發器空轉、也不會寄失敗信（同仁登入仍正常，因為走已部署的舊網頁版本，與編輯器脫鉤）。
  補救：(1) 本機解析 0725 產生 JSON、Liam 經「督導發佈區」上傳，資料補到 07/24（已驗證
  檔案 83,395 bytes 與 modifiedTime 相符）；(2) `kpiCalcAccess` 讀取改為
  `kpiCalcLatestDataFile()`——掃私有資料夾取 `north12b-kpicalc-*.json` 中**最後更新最新**者，
  相容舊的 `-private-latest.json`，並讓外部工具（AI 經 Drive 連接器）可直接補
  `north12b-kpicalc-<日期>.json` 當緊急管道。
- 結果：語法檢查通過、挑檔邏輯單元驗證正確（正確排除 north12b-dashboard-* 與非 json）。
  **需 Liam 貼最新 Code.gs＋部署新版本**才生效。
- 經驗 / 給下一位的提醒：**時間觸發器跑「編輯器最新存檔」的碼，貼到舊版會無聲停掉自動化**——
  貼 Code.gs 前務必確認是 repo 最新版（可用 grep testKpiCalcAutoUpdate 驗證）。
  這次 4 天沒被發現是因為 `setupKpiCalcWatchdog()` 從未啟用，務必補跑。
  環境限制：雲端 Claude 的 proxy 封鎖 script.google.com（實測 403 CONNECT），無法代跑 GAS；
  但 **Drive 連接器可寫入私有資料夾**（已實測），故緊急補資料可繞過 GAS。

## 2026-07-22 ｜ Claude（追分策略頁改為「督導試算區」＋督導限定＋全區試算＋日目標）
- 做了什麼：(1) kpi.html 第三頁籤改名「🎯 督導試算區」，**僅督導本人可見**——GAS
  `kpiCalcAccess` 回傳 `profile.isTrusted`（用 `DASHBOARD_TRUSTED_EMPLOYEE_ID` 判斷），
  前端據此顯示/隱藏頁籤，非督導看不到也切不進去。(2) 保留原追分策略（潛力分排行/流量分配/
  建議），下方**新增「全區彙總試算」**：督導在各項輸入假設「試算今日」量，看全區明日預估
  總達成率如何變化（以官方區平均為錨點、試算今日移動增量，標近似值）。(3) 每項多一欄
  **「日目標」**：自動＝區月目標÷本月天數，可手動覆蓋；試算今日 ≧ 日目標標「達日目標」。
- 結果：成功（Playwright：isTrusted=true 顯示頁籤+全區試算即時運算+日目標自動值20.3=628/31、
  isTrusted=false 完全隱藏、無 JS 錯誤）。**需 Liam 重新部署 GAS（新版本）才會回傳 isTrusted**。
- 經驗 / 給下一位的提醒：isTrusted 走 doPost 的 kpiCalcAccess，改動要部署新版本才生效。
  全區彙總試算用 DATA.stores 加總+店級 floors，與各店官方加總非完全一致（近似），已標註。
  localStorage：LS.stratSim（試算日/試算今日/日目標覆蓋）。

## 2026-07-22 ｜ Claude（KPI 自動更新中午巡檢）
- 做了什麼：`gas/Code.gs` 新增 `kpiCalcWatchdog()`：每天 12:30（台北）巡檢當日資料，
  (1) 資料夾沒有今天的 `MMDD.xlsx` → 寄「今日尚未上傳」提醒；(2) 今日檔存在但
  `KPICALC_LAST_IMPORT` 對不上（11:00 更新沒跑成功）→ 寄「可能未更新」提醒；(3) 正常則
  靜默不寄信。補足「忘了上傳」「靜默漏更新」這兩種原本不會觸發 ❌ 信的缺口。
  啟用：執行一次 `setupKpiCalcWatchdog()`（同授權、不需重新部署）。
- 結果：成功（Node 語法檢查通過）。GAS 端需 Liam 執行 setup 啟用。稽核當下確認
  0720/0721 自動更新皆成功（成功信＋期間逐日推進、9店40人完整解析）、無失敗信，
  0722 檔已上傳待 11:00 觸發。
- 經驗 / 給下一位的提醒：巡檢不重試（避免與 11:00 的 ❌ 信重複），只偵測+提醒。
  時間觸發器跑最新存檔碼、不需重新部署。成功信的「期間」比檔名少一天屬正常（D-1 資料）。

## 2026-07-21 ｜ Claude（kpi.html 新增「🎯 追分策略」督導頁籤）
- 做了什麼：kpi.html 加第三頁籤「🎯 追分策略」（督導區用，同資料無需重登）。功能：
  (1) **潛力分排行**——區彙總各項（Σ各店目標/實績），算「潛力分＝權重×(100%−目前達成率)」
  排序，點出拉哪項對總分最有感；(2) **各店流量分配**——選定項目後把區缺口(T−A)按流量
  分級權重（高:三創/通化 1.5、中:萬大/杭州/復興 1.0、低:六張/酒泉/永吉/大稻埕 0.6，可調）
  重新分配，並對照各店「自身缺口」找出高流量又落後的優先店；(3) **動態補充建議**——依即時
  數據生成優先追分/防退控管/激勵加分門檻差距/流量原則/衝刺節奏。
- 結果：成功（Playwright：潛力分＝權重×落後幅度正確、分配加總=區缺口、建議精準點出
  「升轉率29.8%差0.2%達標」等、切回試算頁無誤、無 JS 錯誤）。
- 經驗 / 給下一位的提醒：策略頁用 DATA.stores 全區彙總＋DATA.meta 的月天數/到位日算 f，
  不吃 per-entity 的今日輸入。流量分級用店名 substring 判斷（trafficTier），開新店要補。
  防退類與激勵加分不進潛力分排行（無法靠「多做」追），改列建議區另計槓桿。

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
