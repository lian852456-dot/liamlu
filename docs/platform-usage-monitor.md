# 平台使用概況：候選與啟用門檻

基準 main `28acc62cb1547c69d381910a9b7bf014508e853d`，已包含 PR258 `6193b7b1a64bc1edbe8960be2c06cdc55df26c3e`。本任務不修改登入、名冊同步、裝置綁定、個績或 GAS 催報。

設計依據：Library HTML `libfile_7cf90609d5248191a9cd677bcbcaaa19`、已批准 PNG `libfile_6d2697b4cbcc8191a790c0e46f5d1711`；已以支援流程在本機取回並實際檢視。

目前是預設關閉的本地候選，尚未收集正式事件。第一期不開匯出、不寄通知、不接外部分析服務。完成前端、可測試算法與拒絕預設的隔離後端契約後，再更新驗證收據。

## 必須先批准的安全設定

現行 `gas/Code.gs` 的 `privateDashboardIsTrustedEmployee` 只比對既有主帳號員編；B session 的 `trustSource` 為 `password-bound`。主帳號可跨裝置，手機 grant 的首次綁定也只依據該登入。巡店共用通行碼沒有唯一個人 subject。以上均不足以獨立證明只有本人。

建議新增本人 Google 帳號 step-up（固定 issuer / audience / subject，驗簽、nonce、到期、撤銷與每次 usage:read 核驗）；既有員工登入保持原樣。需要另行批准：OAuth client 與回呼來源、本人 subject 綁定、短效監控 session 與撤銷儲存、管理者及權限、私有 usage 儲存、保留／備份到期設定。尚未建立或配置上述項目，不可用 B 主員編、共用密碼、前端 isOwner 或手機 grant 取代。

安全設定批准前，只可用合成帳號驗證。production adapter 不提供、API 不掛接既有路由、收集與查詢旗標保持關閉、不得合併發布真實監控後台。

### 建議批准單（本 PR 不執行）

1. 在本人控制的 Google Cloud 專案建立此監控台專用 OAuth Web client，限定正式網站 origin／callback；只申請 `openid` 身分驗證，不要求郵件、Drive 或 offline access。由本人完成登入並核實固定 Google `sub`，不以員編或前端 email 值綁定。後端必須驗證簽章、issuer、audience、nonce 與到期。既有 Google／GAS 正式設定須先 fresh 盤點，網址及 client ID 經本人確認後才配置。
2. 新增隔離 `usage:read` 短效權限（建議 15 分鐘）與撤銷紀錄，每次查詢都重新核驗；不讀取或改寫原 B verifier、手機 grant、裝置綁定或督導通行碼。不提供以舊驗證降級的路徑。這會新增本人 Google 驗證步驟及私有安全狀態，必須單獨批准。
3. 在既有本人私有資料層建立獨立 usage 儲存與日期化名冊快照，沿用原 owner、無新增共用者；管理者及可讀範圍須列出。新增 HMAC actor 對應、collection lease、事件交易／冪等、日彙總與刪除／備份到期作業，均與業務資料分隔。不得把現行名冊倒推為歷史名冊。
4. 同仁告知、保留期與小範圍真實試用批准後，才掛接首頁、KPI／台獎／個績及 App 相同 feature ID。採集停止不影響業務流程。新增 trigger、OAuth grant、持久憑證或部署存取權限不在本次一般上線授權內。

目前只有可注入伺服器 verifier／transaction 的候選 factory，沒有實作或配置正式 OAuth verifier、collection lease 簽發、私有持久儲存、HMAC 金鑰、日彙總排程或清除 trigger。不能將合成 adapter 的成功讀取當成本人驗證或正式後端已完成。

## 指標與告知

臺北日；10 秒前景有效活動才算合格使用，60 秒閒置截止，30 分鐘無活動結束工作階段。同帳號重疊時間採區間聯集；跨功能重疊無法可靠歸屬時列未歸屬，不重複分配。日期化名冊缺漏時使用率未知；未接入、未啟用、未取得與真正 0 分開。無歷史追蹤，不補造過去紀錄。

告知文字：平台使用紀錄用於改善工具與排查問題，記錄已驗證帳號代號、功能、時間、合格次數、估計有效停留及固定錯誤分類。監控查詢限本人獨立驗證，私有後端管理者仍可能具技術管理能力。禁止鍵盤／輸入內容、客戶資料、座標、畫面錄影及平台外活動。不用作考勤、工作績效排名或自動扣牌。如需詢問或更正，請聯繫蔚榮。

最小事件保留 30 天、個人日彙總 90 天、後台查詢稽核 180 天。第一期不建立 180 天可回推個人的小群體彙總。瀏覽器 queue 僅記憶體，最多 200 筆／24 小時，登出或換帳號即清除；不複製 token 至事件。正式啟用時間由後端設定後顯示，未設定前顯示尚未啟用。

## 發布與回復

尚未部署、尚未驗證真人資料。待本人驗證與告知／儲存批准後，另做正式 adapter、安全測試、容量與配額測試、本人實際登入與 readback，再決定發布。回復保留目前 main，停用新增旗標與入口，不還原舊登入 verifier、名冊、綁定或既有營運資料。

## 本地候選與驗證收據（2026-10-23）

- Draft PR：[#261](https://github.com/lian852456-dot/liamlu/pull/261)。只新增督導入口及隔離介面／算法／factory／測試，原 `gas/Code.gs`、登入、名冊、手機憑證與個績來源不變。
- Node：監控契約、首頁導覽與提醒模型 66/66；含 5 人名冊、DAU=2／WAU=3／60%、跨日、轉離資格、事件當時門市、缺名冊、未知 vs 0、重複／跨裝置聯集、未歸屬、30 分鐘 session、事件白名單、部分 ack、換帳號／過期／撤銷、保留期及拒絕預設。
- Chromium：監控 13/13、首頁 42/42；1440／390／320px、無頁面水平溢出、篩選、連點、失敗重試、延遲結果、logout／pagehide／BFCache／撤銷／到期清除。原首頁卡片預期由 8 更新為 9，其餘入口順序保留。正式端點未用於測試。
- 語法／靜態檢查：三個 JavaScript `node --check`、GAS factory `new Function`、`git diff --check`。本庫沒有獨立 lint script；未聲稱執行不存在的 lint 工具。
- 設計 PNG 與最終桌機／手機截圖均實際檢視。截圖有明確「合成資料預覽／尚未上線」標示。第一次瀏覽器啟動遭 macOS 沙箱阻止，經允許在外層執行同一合成測試後通過；不是測試程式失敗。
- 第一階段報表查詢最多 30 日，raw 已刪除的期間維持未知。`prune` 只驗證刪除演算法；尚無正式儲存或清除作業可宣稱已生效。日彙總 90 天為待配置保留上限，尚未建立正式日彙總。
- 不包含：正式效能／配額與容量驗證、正式負向 API 測試、真實帳號／資料、實體 iPhone／第二裝置與真人 UAT。跨頁採集 mount 尚未接線；正式資料起算仍為「尚未啟用」。
- 部署狀態：`NOT_DEPLOYED_PENDING_OWNER_VERIFICATION_APPROVAL`；合併 0、Pages／GAS 發布 0、正式事件 0、新安全設定 0。正式入口尚未發布，不提供候選網址冒充正式入口。
- 外部 AI 協作中心已讀相關記憶與現有來源，未修改共用 dirty checkout 或外部交接文件（不在本任務 writable scope）。此文件與 PR 作為可接手的本次紀錄。
- 桌機合成驗證截圖 Library ID：`libfile_64cba5a389b08191865fb3bd817421b8`，本機 identity metadata 已保存。手機與未啟用截圖保留在本次工作區 `evidence/`，未宣稱已建立其 Library ID。
- GitHub 拒絕包含新增 workflow 的第一次候選推送：既有 OAuth App 沒有 `workflow` scope，遠端 ref 未更新。未擴充權限、未換其他憑證或介面繞過；保留原本地候選，從已推送的規劃 commit 建立不含 workflow 的等價程式 commit，再 fast-forward 推送同一 draft PR。新增監控測試由本地收據證明；既有 CI 狀態另行讀回，不宣稱新 workflow 已安裝。
