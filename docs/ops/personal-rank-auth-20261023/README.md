# 排名發布簽章相容層

現行runtime使用不可匯出簽章helper產生`north12b-automation-hmac-v1`封包；正式v74的管理路由只讀`adminSecret`，因此原有簽章請求遭拒。本修正只接上既有簽章契約，不變更使用者登入、密碼、憑證值、既有scope設定或裝置綁定。

`gas/PersonalRankAutomation.gs`限四個排名必要action：管理狀態、private snapshot、protected KPI讀回，以及帶有`rankPatchBase64`的排名白名單寫入。它使用既有Script Properties中的簽章身分與key、audience、scope及撤銷狀態；不提供bootstrap、建置身分、變更scope、撤銷或整批發布路由。缺設定必須拒絕，不能自行補憑證。

簽章精確涵蓋版本、identity、audience、timestamp、nonce、action及原始Base64 payload的SHA256。只接受300秒內時間、與目前Web App及既有設定相同的audience、既有必要scope；nonce在ScriptLock內寫入既有600秒ledger，重放／損毀ledger／容量滿均拒絕。只有nonce ledger可更新，不寫認證設定。內外payload欄位白名單防止混入adminSecret或替換action。

hook放在既有部署隔離檢查後、一般驗證分流前；未帶automation欄位者仍走原流程。驗證成功的排名寫入仍呼叫v74原白名單writer，保留完整身份集合、來源日期、protected及完整快照父hash、鎖、稽核與非排名資料逐值保護。沒有硬填排名或一般登入例外。

測試包含合法HMAC互通、所有簽章欄位篡改、過期／未來、錯audience／scope、撤銷／缺設定、防重放、損毀ledger、非排名action拒絕與實際rank writer整合。正式部署後必須先用既有helper取得合法管理status，再用fresh讀回建立排名intent。未知寫入回條先讀回，不重送。

部署只在當時正式來源增兩行hook及此新模組，原其他檔與manifest保留。回復需先核後續版本，再將同一Web App deployment切回v74，編輯器只撤除此hook與模組。正常登入、runtime與正式資料不需回復；若排名已更新，資料回復必須另用最新父hash及排名白名單，禁止舊快照整份覆寫。
