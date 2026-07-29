# 北一二B 每日回報系統

單一檔案 HTML App（`index.html`），部署於 GitHub Pages。後端為 Google Apps Script（`gas/Code.gs`）＋ Google Sheets。

## 功能頁籤

- `📝 填報（店長）`：門市每日回報；台獎填報欄位已更新為目前協作的 10 台機款。
- `📊 彙整大盤（督導）`：當日回報與門市彙整。
- `🕐 日期回放`：單日歷史回放，僅保留 16:00 與 21:00 正式時段。
- `👤 個人追蹤`：個人回報與追蹤牆。
- `🏆 KPI戰情`：以正式每日戰報呈現北一二B與各店KPI總達成、公司排名、A999／A1399／好速／R1399，並標示相較前一日的 DOD；各項明細固定顯示「實績／月目標／100%日目標／差異」，日目標依報表資料截至日計算。個績排名提供遮罩姓名、總達成率與排名 DOD，以及個人台獎預估／獎金排名。
- `🏅 台獎戰情`：督導獎金置頂呈現；每店顯示店長／督導預估、前三項優先補量與完整 10 機款下一獎階。補量規則先救差 1～3 台的店長 50% 門檻，其餘依可增加獎金除以所需台數排序。

兩個戰情頁籤都受保護：首次以「員編＋啟用碼」提出裝置綁定，必須由管理者核准；核准後，該員編只可在該一台手機或電腦輸入員編登入。重新核准新裝置時，舊裝置會立即失效。登入後可查看所有店點與個人 KPI／獎金資料，但所有姓名一律維持遮罩。

## 分析資料更新

每日報表流程可用下列工作區腳本，把 OneDrive `TWM每日戰報` 的日期報表整理成網站資料；原始 Excel 不會被修改：

```bash
python3 /Users/liamlu/Downloads/liam-agent/report-automation/work/build_github_pages_data.py
```

輸出會更新：

- `data/daily-momentum.json`
- `data/phone-awards-latest.json`

目前產生的 KPI／台獎 JSON 都保留在本機並由 `.gitignore` 排除；不得把它們放進 GitHub Pages。公開介面更新才可用 `.claude/scripts/auto-push.sh` 發布。

## KPI／台獎私有戰情部署與每日更新

私有資料已建立在 Google Drive 的系統管理資料夾，不分享給同仁，也不提交 GitHub。Google Apps Script 透過該資料夾提供登入後的快照。

第一次啟用時：

1. 將 `gas/Code.gs` 儲存到既有 Apps Script 專案。
2. 在「專案設定 → 指令碼屬性」設定：
   - `DASHBOARD_PRIVATE_FOLDER_ID`：私有 Drive 資料夾 ID。
   - `DASHBOARD_ADMIN_SECRET`：僅區主管持有的高強度密碼；不可放在程式或聊天室。
   - `DASHBOARD_BOOTSTRAP_CODE`：首次綁定碼（目前為 `0935`）。
3. 在 Apps Script 編輯器手動執行 `setupPrivateDashboard()` 一次，授權並建立登入名冊試算表。
4. 「部署 → 管理部署作業 → 編輯 → 新版本」重新部署 Web App；執行身分選自己、存取權選任何人。這只公開驗證入口，實際資料仍會驗證員編與綁定裝置。

每天兩封 Outlook 信都寄出、且 `寄件備份` 驗證附件成功後，才可把同一批資料發布到私有 Drive：

```bash
PRIVATE_DASHBOARD_GAS_URL='既有 Apps Script Web App URL' \
PRIVATE_DASHBOARD_ADMIN_SECRET='僅存於本機安全環境的管理者密碼' \
node /Users/liamlu/Downloads/liam-agent/report-automation/work/publish_private_dashboard_snapshot.mjs
```

這個命令會重新生成遮罩後 KPI／台獎快照與登入名冊、同步到私有 Drive；任一段失敗即非 0 結束，不會改動公開 GitHub 資料。

## patrol.html 受保護工作頁籤與個資邊界

`patrol.html` 除原有巡店看板外，另有兩個沿用既有 `PT_KEY` 通行碼的受保護頁籤（2026-07-21 合併決策：不採用 Microsoft 365／MSAL，避免新增另一套帳號與權限系統）：

- `每月班表`：解鎖後透過 GAS `sread` 讀取私有 Google Sheet 的班表封存，支援每日、每週、每月檢視與 Excel `.xls` 匯出（含店長／副店／休假顏色圖例）。
- `半月督導檢查`：督導可逐題填寫第 1–18 項檢查（原 33 項若仍需要，應另立「每月巡檢」清單，不與此混用）、缺失與改善說明，照片／影片可直接上傳私有 Google Drive 並在歷史紀錄回放，匯出 Excel 含「照片影片附件」頁籤與私有連結。

安全規則：GitHub Pages 只放介面程式，不放員工姓名、班表、檢查紀錄、照片／影片。班表與半月檢查資料都留在私有 Google Sheet／Drive，讀寫一律透過既有 GAS 部署並以 `PT_KEY` 通行碼驗證；`PT_KEY` 與 `NOTIFY_EMAIL` 必須留在 Apps Script 指令碼屬性，不要提交實際值到 repo。
