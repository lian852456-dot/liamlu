# Liam Supervisor iOS 1.0 Final Security Review

日期：2026-08-11  
狀態：程式差異審查完成；真人 Approved Device／正式資料 smoke test 留待安裝後執行。

## Scope

- App 1.1 正式資料解鎖 release commit：`c5756412c3b1ec156a2d75bb456c42694a29b0c6`
- 比較基準：`7458c0e03a09b21502b87cf760052bbe366f0b73`
- Native shell：正式 origin allowlist、外部連結、lifecycle state update、NetworkMonitor 編譯修復。
- 未修改 OAuth、Cookie、Session、Approved Device server model、GAS 寫入、Sheet schema 或正式計算公式。

## Canonical App 1.1 Diff Scan

- Scan ID：`57be2f03-6827-414d-b077-c53dcd01cf7f`
- Snapshot：`codex-security-snapshot/v1:sha256:0430846078b17af13b6fb99f8ab23f283d6d4ba86ee20c98162bc02b61c90d7e`
- Coverage：`4/4` changed source files，有完整 completion receipts。
- Reviewed：`app.css`、`app.html`、`app.js`、`service-worker.js`。
- Candidate findings：`0`
- Unresolved High：`0`
- Unresolved Medium：`0`
- Reportable credential leak：`0`

檢查結果：

- `private_access` 成功前不會送出 KPI、台獎或回報摘要讀取。
- Approved Device 仍由既有伺服器流程強制驗證；前端狀態不能核准裝置。
- 首次啟用碼與督導通行碼在 request 等待前即清空，不寫入 persistent storage、Git、URL 或 log。
- 班表／巡店只保存既有短效 session token；逾時會清除 token 並要求重新驗證。
- 未授權時重設正式摘要模組並顯示解鎖 CTA，不把空白 KPI 當成成功。
- Service Worker 更新至 `realdata-v3`，只處理同 origin 靜態資產，不快取跨 origin GAS 回應。

## Native Shell Review

- App startup URL 是固定 HTTPS origin，沒有任意 URL 載入。
- WebView 只允許正式 App path 與必要 Google OAuth hosts。
- 其他 HTTPS 連結交由 system browser；`javascript:`、`file:`、HTTP 與任意 custom scheme 被拒絕。
- 沒有 JavaScript bridge、ATS 全域放寬、token injection、cookie downgrade 或 authentication challenge bypass。
- WKNavigationDelegate 的 ObservableObject 更新延後至下一個 MainActor turn，避免在 SwiftUI view update 期間同步 publish。

## Verification Evidence

- Node contracts：`121/121 PASS`
- Playwright App 1.1：`6/6 PASS`
- 390×844 horizontal overflow：`PASS`
- Browser console error：`0`
- npm audit：`0 vulnerabilities`
- Native static tests：`5/5 PASS`
- Simulator build：`PASS`
- Generic iOS device-architecture compile（不改 signing）：`PASS`
- Physical iPhone signing／install／launch：由 Liam 先前 Xcode 實機操作確認 `PASS`。

## Deferred Human Gate

以下需要 Liam 本人在 App UI 輸入既有憑證或核准 Native Device，因此不在夜間無人操作中假裝完成：

- Native Approved Device 首次核准與正式 KPI／台獎／回報讀回。
- 班表／巡店既有督導通行碼驗證。
- 安裝後 cold/warm launch、offline/online、logout/login 真人 smoke test。

未通過上述真人 Gate 前，不建立 `liam-supervisor-ios-1.0-pilot` final tag。
