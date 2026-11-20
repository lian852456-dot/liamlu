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

## 私有來源保留與發布接線

來源持久化到原私有資料夾的 `north12b-insurance-source-private.json`（`insurance-source-state/v1`），與每日回覆檔及 KPI latest 檔分開。原 KPI 自動更新、快速上傳與既有 JSON 覆寫完全不需要改動；它們無法清除這個檔。個人率與員編不加入普通 KPI 產物、郵件附件、公開網站或分享包。兩條既有 KPI 回應的 redaction 保留，防止先前含 sidecar 的私有 payload 外露。

只有原管理者授權可呼叫 `insurance_source_status / insurance_source_begin / insurance_source_complete`，沿用原 auth owner 及交易鎖；不增加 B 使用者權限。status 只回版本、批次與筆數，不回員編或率。begin 先以 expectedVersion 做 CAS，持久化 pending 並保留舊值；complete 逐人／店驗證後合併。缺值、無效身分／期間及截止倒退不取代舊有效值；店級待核不清個人、亦不碰週金牌。

寫後逐字讀回；complete 失敗回復到已持久化的 pending 及舊值。相同來源 hash 與內容重跑不重寫；同日更正原檔 hash 可更新。相同原檔已成功的內容不能偷偷改寫；修正解析器需另作經審核更正，不能繞過冪等驗證。網路結果不明先讀 status 對帳，不盲重送。若連 begin 都無法確認，不能宣稱已記錄失敗；保留原資料及日期，由既有發布負責人查核。

以既有唯讀來源選取最新已正式產出的原報，核日期、Drive 版本及原檔雜湊。使用原名冊的 DashboardUsers A:E 欄，將已驗證的原檔及名冊提供給獨立的 `insurance_report_preview.py`，在新的私有目錄產生預覽檔。只允許同店、唯一、有效的員編對應率。店級截止另核。正式接入時由既有受權管理者使用 `publishInsuranceIntent` 核對來源並讀回，普通同仁沿既有 B 登入讀取本人範圍。

## 發布順序與回復

1. 核實現役部署版與 saved HEAD 完整私有備份，包含 manifest、Console-only 檔。repo 不代表正式副本。
2. 在現役私有副本加入 `InsuranceConsultation.gs`、`InsuranceConsultationStore.gs`、`InsuranceSourceCore.gs`、`InsuranceSourcePublication.gs`。`Code.gs` 只套 B allowlist、受保護 dispatch、兩條 KPI redaction 及三個管理者來源動作的一行 dispatch；保留現役額外的 `employee_city_handoff` context、聯名卡及所有專有檔。manifest／URL／權限不變，不能整檔覆蓋。
3. 在受保護環境驗證最新原報預覽、後端授權、來源交易讀回及回復。通過發布門檻後才部署同一既有指標，先驗本人來源再開放填寫。
4. 發布前端後，以正式身份驗本人頁首、門市角色、一般兩時段；首次真實回覆讀回另驗，不向正式資料寫假紀錄。公開 HTML／舊換新 Preview 不代替正式登入。09:00 日報來源仍須另外對帳才切換。
5. 回復先停止新的來源發布接點並撤下新入口，再回復備份的部署指標及前端；獨立私有來源檔和每日回覆檔均保留。若舊 KPI 檔已有 sidecar，回復無 redaction 後端前須先由原受權流程移除該 sidecar，或保留 redaction。不要刪除歷史／回填／改權限。

本機 repo overlay、私有副本與合成測試不能代替正式完整比對、發布來源及登入讀回。本次修改不進行正式部署或任何正式資料寫入。
