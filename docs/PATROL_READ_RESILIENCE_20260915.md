# 巡店看板唯讀穩定性修正

## 狀態

GAS 已於 2026-09-15 19:18 (Asia/Taipei) 部署正式第9版，原 Deployment ID／權限不變。pthealth HTTP 200；隔離候選頁正常登入後，新 ptdashboard 正式契約驗證完成，重新整理保留 session，舊月份讀取可用。Pages 與正式網址新版驗收待完成。

## 基線與直接原因

- Repository: `lian852456-dot/liamlu`；基線 `9acdd6a34fc0a1bd34ed39d4261cfadf320efeb4`，由最新 origin/main 建立 `fix/patrol-read-resilience-20260915`。
- 原共享 checkout 在舊分支且 dirty；本次使用同一 repo 的獨立 worktree，未覆寫其未提交修改。
- 前端唯讀 transport 沒有有限重試；舊追蹤器把包含 HTTP 404 的所有例外記為 network-error。這可解釋暫時失敗後需要使用者再觸發請求，不能證明每一筆 404 的基礎設施來源。
- Apps Script Deployment 與 Google 轉址節點何者回傳 404 仍無足夠 trace，維持未知。
- 另移除既有 `cloudWrite` 失敗後自動重送一次，避免模糊失敗造成重複寫入。

## 修改

- patrol.html：共用唯讀 wrapper，僅 ping/pthealth/ptsummary/ptdetail/ptmileage/ptmileage2/sread/hread/ptdashboard 允許 404、429、500、502、503、504、網路或 timeout 重試；2s/5s，最多三次。
- 明確 AUTH 原因優先於 HTTP；只有 EXPIRED/REVOKED 開啟重驗。寫入、登出、登入、媒體均不自動重送。既有寫後逐鍵 readback 保留，摘要與里程刷新在成功回覆後背景進行。
- sessionStorage 快取僅包含月份、契約、ISO 更新時間、總店數／有到店數／完整完成店數；不保存人員、店名、明細或內容。按月／契約隔離，登出、撤銷、契約錯誤清除；快取永遠標示上次成功資料。
- 診斷只含 timestamp/action/attempt/durationMs/httpStatus/redirected/contentType/responseUrl（無 query/hash）/exceptionType/retrySucceeded。移除舊 mileage report console 輸出，不記 body 或資料值。
- gas/Code.gs、Patrol bundle：新增 `ptdashboard`，一次讀 A:L 後在後端彙整，summary-only，最多 5000 筆來源、九店、月份與版本檢查。只在新後端明確 unknown action 時回退 ptsummary + ptdetail；完整記錄仍按需讀取。
- 新舊 fixture parity 保留九月25題、只有V完成、NA未完成、第10題雙月、每月兩次且間隔至少7天；八月及以前使用原33題模型。

## 備份與部署候選

- 已由既有 clasp 唯讀取回正式 v8 與 editor HEAD；兩者 PatrolCode SHA-256 相同：`8667d0fe01ef8b16989429a3cd99f0bb9a11fcaa27e62aa2ff726d489ccb9078`。
- 正式 Deployment：`AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax`，本輪前版本 **8**，本輪已部署 **9**。這是目前 patrol.html 的隔離 Patrol 後端，不能使用早期 v58 共用後端交接代替。
- 私有備份：工作區 `private-backups/patrol-read-resilience-20260915/{editor,v8,candidate}`，不納入 repo。未備份或輸出 Script Properties、通行碼、token 或正式巡店資料。
- Candidate 從 live editor 備份加入最小增量；原92個函式保留，新16個函式，各存在一次；逆向移除增量後與原備份逐位元一致。HalfMedia 與 manifest 原樣保留。
- 共用 gas/Code.gs 原本229個函式定義中 `kpiCalcPct` 有2個，基線即如此，本次未動；指定 KPI自動化/watchdog/巡店/班表/半月/每日回報/通知關鍵函式仍各1個。不得宣稱共用大檔所有函式皆唯一，也不將它整份部署至隔離 Patrol。

## 正式發布待辦

1. 恢復可操作的 Apps Script 管理介面，重新核對 editor/v8 與備份一致；僅套 candidate 增量，不替換 Script Properties 或存取權限。
2. 儲存 → 部署 → 管理部署作業 → 編輯現有正式 Deployment → 新版本 → 部署，保持原ID／權限。
3. 唯讀驗證 pthealth、正常登入／session、舊讀取、新 ptdashboard；不建立正式測試資料。
4. GAS通過後才合併修正及發布 Pages，核對線上版本，再驗首次開啟／reload／月份／店點／摘要／里程／班表／到店檢查。正式結果目前均未驗證。

## Rollback

- GAS：管理部署作業編輯同一 Deployment，選回版本8；若已儲存候選 editor，還原本輪 editor 備份，保留 Script Properties、Deployment ID和權限。勿重建部署。
- Pages：本輪尚未發布。發布後以 revert 本輪功能 commit 產生新提交、部署 Pages，還原至本輪前 `9acdd6a` 的相關檔案狀態；不要 reset 或覆蓋其他後續修改。

## 本機驗證

- 巡店／auth／bundle／read model／新版contract／cache／retry，加上共用GAS日期與半月契約：156/156 PASS。
- 原巡店與登入 Chromium：93/93 PASS；新增故障恢復／reload快取／新API單次讀取：4/4 PASS。
- 每日回報入口最小 Chromium smoke：4/4 PASS；六個入口 inline JavaScript syntax、GAS syntax與diff check PASS。
- 以正式v8增量候選執行相同GAS parity/單次scan測試：2/2 PASS；來源工作表不存在時直接失敗，不建立工作表。
- 所有fixture與端點皆為合成／mock，未為驗收寫入正式巡店資料。匯入、寫入readback、里程、班表、到店檢查、面談入口、媒體與登入登出包含於93項瀏覽器回歸；這是本機零新增回歸證據，不是正式各功能驗收。
- 舊版整檔GAS hash鎖定與已移除「尚缺檢核項次」卡片斷言已更新成目前契約；過期後写入自動續傳斷言依本次要求改為不重送，仍檢查本機內容與已成功批次保留。

## 19:30 部署前正式驗收補記

- 第9版 PatrolCode／HalfMedia 回讀與 candidate 位元組相同；manifest JSON 語意相同（僅格式差異）。v9 私有備份已保存。
- 正式獨立 GAS 仍有歷史店碼別名；新前端補用舊讀取已有的限定別名轉換，未知碼仍拒絕。新增回歸通過，最新 Node 156/156、新瀏覽器4/4。
- 早先頁面「通過正式後端驗證」是登入說明，不能當登入證據；實際舊 session 已明確 EXPIRED。正常重新驗證後，候選頁 ptdashboard 正式讀回成功，再次reload無須重登。
