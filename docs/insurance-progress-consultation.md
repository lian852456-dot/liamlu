# 獨立保險搭售請益契約

入口是既有網站的 `insurance-consultation.html`，沿用 B 登入。一般門市 16:00／21:00 與個人銷售表單沒有保險請益必填；每日分子母、晚間掛蛋請益、聯名卡及考核維持原契約。兩份基本表單只調整密度 CSS。

## 正式來源與門檻

每日原報經既有 `extract.py` 產出私有 `meta.insuranceConsultationSource`，schema `insurance-consultation-source/v2`。店級讀「搭售達成率 (手機保險)」H，個人讀「搭售達成率 (手機保險) _個人」M，分別驗證身分與各自統計期。個人 D3 可獨立提供該個人頁統計起訖，不能當作店級截止。來源 SHA256、發布日與檔名須和私有 KPI 容器一致；版本由內容決定。無可信分子母時直接用正式公布率。

最新可用同月報表可以落後回報日，頁首顯示來源發布日及實際統計截止，不稱即時更新。原始率低於 50% 才要求五欄；49.9999% 仍要求，50% 免填，明確有效的 0% 要求。缺值、身份疑義、未知期間、跨月及未來批次為「資料待核」，不假算 0、不擋一般回報。來源更正後首次提交必須重新讀取版本；同批重跑不產生新任務。

11/20 原報的個人分頁有獨立期間證據，可供個人流驗證；店級沒有獨立期間證據時保留待核，不能因此攔住可驗的個人流。實際來源與稽核紀錄只留私有環境。

## 權限、一次提交與回讀

普通同仁只看本人個人率及回覆；店長／代理店長按既有角色可見本人與所屬門市；只有既有 trusted 督導可見九店及同仁核對清單。督導核對權不代表代填他人回覆；個人只可本人送出，門市只可所屬門市管理角色送出，回應的 `canSubmit` 明示此限制。後端以原 session、native user、店別及有效期驗證，不接受客戶端自稱角色或員編。公開回應沒有員編，`subjectKey` 是既有服務端秘密產生的不可直接還原識別鍵。

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

## 發布順序與回復

1. 取得現役正式部署版及 saved HEAD 完整私有備份，包含 manifest、Console-only 檔；核實當前版本，不把 repo 當完整正式副本。
2. 在私有副本加入 `InsuranceConsultation.gs` 與 `InsuranceConsultationStore.gs`，只套 `Code.gs` 的 B allowlist、受保護 dispatch、兩條 KPI 回應的 sidecar 移除片段。原 manifest／URL／權限不變，不整檔覆蓋。核對現役聯名卡等差異仍保留。
3. 後端先部署並用正式身份驗證自我範圍與 KPI redaction，再啟用既有私有發布流程的新 sidecar。缺店級期間保持 pending，個人依其獨立來源驗證。不變更排程、圖片或郵件。
4. 發布前端，正式登入驗本人頁首、門市角色、一般兩時段不受阻；以首次真實回覆讀回驗證，不在正式表寫假數字或假同仁。公開 HTML 與預覽成功不代替此驗收。
5. 回復先撤下新入口並停止產生新 sidecar，回復已備份的部署指標及前端；已發布 KPI 檔若含 sidecar，必須保留兩處 redaction 或先用原受權發布流程移除 sidecar，不能將含身分的新 payload 交給無 redaction 的舊後端。新每日私有提交保留，不刪除、不回填、不改權限。

本機 repo overlay 及合成測試不能取代正式完整比對、正式發布管線讀回及登入驗收。未過門檻維持草稿，不先上可填卻無法安全保存的前端。
