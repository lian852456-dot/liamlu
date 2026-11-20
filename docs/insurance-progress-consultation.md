# 獨立保險搭售請益契約

入口是既有網站的 `insurance-consultation.html`，沿用 B 登入。一般門市 16:00／21:00 與個人銷售表單沒有保險請益必填；每日分子母、晚間掛蛋請益、聯名卡及考核維持原契約。兩份基本表單只調整密度 CSS。

## 正式來源與門檻

正式原報經獨立的 `insurance_report_preview.py` 產出獨立私有 `insurance-source-MMDD.json` 與 `insurance-publish-MMDD.json`，不再增加普通 KPI JSON 欄位。來源 schema 為 `insurance-consultation-source/v2`。店級讀「搭售達成率 (手機保險)」H，個人讀「搭售達成率 (手機保險) _個人」M，分別驗證身分與各自統計期。個人 D3 可獨立提供該個人頁統計起訖，不能當作店級截止。來源 SHA256、發布日與檔名須和獨立私有發布封套及原檔位元一致；版本由內容決定。無可信分子母時直接用正式公布率。

統計截止可落後發布日，頁首分別顯示兩者，不稱即時更新。尚未取得本日有效發布，或新批缺值／失敗時，保留前次率與日期並標示「舊資料／待核」，只供參考，不強制本日請益。原始率低於 50% 才要求五欄；49.9999% 仍要求，50% 免填，明確有效的 0% 要求。缺值、身份疑義、未知期間、跨月及未來批次為「資料待核」，不假算 0、不擋一般回報。來源更正後首次提交必須重新讀取版本；同批重跑不產生新任務。

11/20 原報的個人分頁有獨立期間證據，可供個人流驗證；店級沒有獨立期間證據時保留待核，不能因此攔住可驗的個人流。實際來源與稽核紀錄只留私有環境。

## 權限、一次提交與回讀

普通同仁的每日任務及回覆只開放本人。另有當日九店請益名單，沿用有效 B 登入與在職店別、角色名冊，按本期個人搭售率排序。清單只回店點、名冊顯示姓名、搭售率及表內截止；舊值與缺值分列，不參與排序。姓名沿用原名冊遮罩。店長／代理店長按既有角色可見本人與所屬門市；只有既有 trusted 督導可見九店及同仁核對清單。督導核對權不代表代填他人回覆；個人只可本人送出，門市只可所屬門市管理角色送出，回應的 `canSubmit` 明示此限制。後端以原 session、native user、店別及有效期驗證，不接受客戶端自稱角色或員編。公開回應沒有員編，`subjectKey` 是既有服務端秘密產生的不可直接還原識別鍵。

每個 `dataDate + kind + subjectKey` 一筆。`dataDate` 是台灣回覆日期，與較早的 `publicationDate`／`cutoff` 分開；昨天已填不算今天。後端只允許今天首次提交，且五個字串 trim 後各 1–2000 字；前端亦檢查。五欄穩定名稱：

| 欄名 | 畫面 |
| --- | --- |
| advisor | 請益對象 |
| icebreaker | 破冰方式 |
| tools | 運用工具 |
| approach | 建議話術／作法 |
| followup | 執行提醒／待確認 |

原 B 交易鎖內保存到原私有資料夾的獨立每日 JSON，schema `insurance-consultation-records/v1`；不新增 Sheet 欄、不改 BM 聯名卡、不覆寫一般回報。重複鍵回傳原有效回覆，不覆蓋內容；同日版本更正保留原提交來源與五欄，標記 `sourceChanged`。寫後逐字讀回，失敗不宣稱已完成。

B 動作 `employee_insurance_read` 接收 `dataDate`，回應 schema `insurance-consultation/v1`；`employee_insurance_submit` 再接收 `subjectKey, sourceVersion, values, submissionId`。穩定核對欄位是 `dataDate, scope, items[].subjectKey, kind, store, isSelf, requirement, status, progress, submission, sourceChanged`。`progress` 有正式 `publicationDate, periodStart, cutoff, sourceVersion, sourceSha256, sheet, column`；`submission` 凍結時間、來源、率與五欄。`status` 為 required/completed/exempt/pending；相同日有效提交才 completed。若最新來源改為 pending/exempt，仍保留 submission 可查看，不把舊文字當成現在必填。

日報核對必須使用受權督導讀取、當日日期與 opaque 唯一鍵；不可用遮罩姓名硬接。舊歷史日期若最新來源不能對應，需求狀態維持 pending，不能宣稱已核對當日低標名單。原 09:00 Excel／Gmail 直到正式來源、角色及提交讀回對帳完成才由原流程負責人切換；此改版不動它。

## 我的每週保險／金牌

每日 50% 請益與每週 55% 獎勵分開。W1 沿用既有結果；W2 55%（含）以上 +5，W3、W4 持續達標每週 +3，從 W2 連續達標累計 8／11。網站只呈現規則，不計入帳。

目前既有 daily gold 私有 schema 只有 personKey、遮罩、餘額與原因，沒有已核對的 employee ID、保險週期、週率及入帳映射；月度 company Final 是另一帳本。故 `insurance-weekly-self/v1` 目前全部明示待結，率、截止、加扣、累計為 null，尚未接上 W1 既有結果。待原金牌流程交接本人可核對的正式週報與入帳欄再接讀；不從餘額／原因反推，不補發追扣、不重算已結週。週期或中斷後再達標規則未核仍待結，不阻擋每日請益。

## 同一擁有者的固定 Drive 來源

同仁 API 從單一固定檔案 ID 讀取已對帳的私有 payload。現有管理者來源 API 的驗證、狀態檔與交易維持原契約。固定來源使用獨立檔名及位置，位於已核對擁有者的 My Drive 根目錄。原發布者先核對最新原報雜湊、報表日、個人分頁 D3 統計期間、M 欄搭售率及有效九店名冊，再產生保險專用 JSON。店級統計期間待核的資料不提供店級有效率。首次建立時先以無個資內容核對未共用及唯一 owner，再以相同 ID 寫入、下載比對整檔雜湊。單一發布者負責序列化寫入及保存前一版私有副本，結果不明先讀回。相同檔案內容直接核對，無須重寫。

### 發布前準備與回復

1. 原發布者於私有工作目錄備妥 `descriptor.json`，內容為已對帳的 fileId、ownerEmail、payloadSha256、sourceSha256、reportDate、cutoff 和 people。來源描述、實際檔案及產出的 GS 只留在受控私有環境。用 `node scripts/north12b/render_insurance_source.cjs <私有目錄>` 離線產生同目錄下的 `InsuranceFixedSource.gs`。目錄及 JSON 僅限擁有者讀寫，目錄須在 Git 以外，工具拒絕覆寫現有輸出。審閱時比對樣板，應只有常數宣告一行不同。
2. 先核實正式專案的編輯者、部署者及執行帳號，確認對含來源描述的程式具有相應授權。若無法核實，私有描述留在離線副本。發布者備份當時現役不可變版本與編輯版全部檔案，逐檔核對，在該私有副本最小套用保險差異，保留正式獨有程式。比對 manifest、Drive 服務、Scopes 及存取設定。核發新版本時核對版本內容，再用原 Web App URL 與既有權限指向該不可變版本。
3. 公開樣板預設關閉。新版本內每次本人讀取或提交，先由既有 B 路由核身，再檢查該版本綁定的當日報表、固定檔唯一 owner、完整 ACL、payload 與原報 SHA-256、同月實際截止、九店名冊及覆蓋人數。讀取末段再次驗 ACL、檔案版本及台灣日期，全部通過才可讀當日回覆、產生名單或寫入請益。來源設定與啟用狀態皆不讀寫 Script Properties。
4. 顯示前端入口前，用既有獲授權的一般 B 同仁工作階段唯讀驗本人、當日報表／實際截止及九店名單四欄。在管理者無適用角色時，由已有授權的人員操作既有登入。正式首筆寫回留待實際業務提交。前端與後端均核實後才開放入口。
5. 台灣換日或同日更正需要用新批次重做來源對帳、固定描述與版本核發。尚未有當日有效批次時，保險讀取及送出均關閉。失敗時先切回已備份的有效 Web App 版本，已發布的前端入口同步撤回。若曾換來源內容，從相對應的私有副本核對日期、雜湊及權限後復原；過期資料保持待核。保留已成立的請益與原日報紀錄。
