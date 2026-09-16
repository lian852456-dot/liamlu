# 巡店看板與 App 登入／unknown action 修復（2026-09-16）

## 已確認與未確認

- 使用者手機截圖多個巡店區塊出現 unknown action；不能將此視為通行碼錯誤。
- origin/main基線093d1e0；shared checkout仍dirty，本輪使用同repo独立worktree及fix/patrol-app-unknown-action-20260916分支。
- App仍指向歷史共享Patrol Deployment，authDeployment為patrol-auth-stateless-20260821；看板已使用Patrol獨立Deployment及patrol-isolated-v1。App與看板端點／session key沒有一起遷移。
- 正式Patrol編輯器PatrolCode／HalfMedia與昨日v9逐位元相同，Deployment清單仍原ID第9版。未發現程式或部署被覆蓋。
- 本輪最初兩次pthealth HTTP404，後續trace 302(script.google.com→script.googleusercontent.com)後HTTP200；不能由這份trace定位前兩次404來源。
- 正式看板正常登入曾在30秒時AbortError；修正候選單次60秒登入成功、ptdashboard契約驗證成功。
- 既有App在本輪稍後也可登入並讀取，因此沒有重現截圖當下的unknown action，不能聲稱端點差異是每次失敗唯一原因。

## 最小修正

- app.js Patrol端點與patrol.html一致，使用獨立後端session key；不沿用歷史共享端點token。每日回報／KPI／員工驗證端點不變。
- App巡店唯讀採404/429/500/502/503/504/network/timeout，2秒／5秒，最多三次；明確AUTH原因優先。其他private transport維持原規則。
- App ptauth／ptlogout改為單次request，移除既有自動retry；登入等待上限60秒。巡店到離店寫入仍單次。
- 看板登入等待上限60秒；驗證暫時失敗不清除password input，使用者可手動再按送出，無須重輸。密碼錯誤或驗證成功即清空；沒有保存到storage、repo或diagnostic。
- 更新App／Service Worker資產版本，避免iPhone持續載入舊App script。
- 本輪不修改GAS、權限、資料庫或正式巡店資料。

## 驗證／發布狀態

- 候選看板正常登入及ptdashboard正式讀回成功。
- 候選App正常登入後九店／25項進度、最近巡店與里程已渲染，unknown action未出現。
- 專項Node212/212、看板Auth／恢復Chromium13/13通過；App Chromium10/10通過，含登入後reload；正式發布待補。
- 全Node額外盤點398/404，有6個既有KPI／台獎fixture失敗；App全檔另有既有台獎摘要fixture失敗，不列為巡店通過。
- 兩項8月到離店fixture原受今天日期影響，固定fixture時鐘後保留原斷言，均通過。

## 備份與rollback

- 最新GAS私有備份：private-backups/patrol-app-unknown-action-20260916/editor，未讀取或保存Script Properties；部署仍v9。
- 前端回復基線093d1e0357414b8185cd5bb1a12d5468ba8cc589；以revert本輪功能提交回復，不reset或覆蓋他人修改。
