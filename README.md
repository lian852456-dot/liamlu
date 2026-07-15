# 北一二B 每日回報系統

單一檔案 HTML App（`index.html`），部署於 GitHub Pages。後端為 Google Apps Script（`gas/Code.gs`）＋ Google Sheets。

## 功能頁籤

- `📝 填報（店長）`：門市每日回報；台獎填報欄位已更新為目前協作的 10 台機款。
- `📊 彙整大盤（督導）`：當日回報與門市彙整。
- `🕐 日期回放`：單日歷史回放。
- `👤 個人追蹤`：個人回報與追蹤牆。
- `📈 區間彙整`：讀取 OneDrive 每日報表的 `上線數KPI_每日上線`，呈現 AQ／A999／好速／RT／R1399 等日動能趨勢、掛蛋與下滑提醒。
- `🏅 台獎提醒`：讀取最新 10 台機款的店點實際、目標、達成率與缺口。

## 分析資料更新

每日報表流程可用下列工作區腳本，把 OneDrive `TWM每日戰報` 的日期報表整理成網站資料；原始 Excel 不會被修改：

```bash
python3 /Users/liamlu/Downloads/liam-agent/report-automation/work/build_github_pages_data.py
```

輸出會更新：

- `data/daily-momentum.json`
- `data/phone-awards-latest.json`

完成後用 `.claude/scripts/auto-push.sh` 發布 GitHub Pages。

## patrol.html 受保護工作頁籤與個資邊界

`patrol.html` 除原有巡店看板外，另有兩個需要 Microsoft 365 登入的私有頁籤：

- `每月班表`：從登入後的私人資料服務讀取 OneDrive `TWM 班表`，支援每日、每週、每月檢視與 Excel `.xls` 匯出。
- `半月督導檢查`：督導可逐題填寫 33 項檢查、缺失與改善說明，選取照片／影片，並匯出完整紀錄與缺失改善追蹤 Excel。

安全規則：GitHub Pages 只放介面程式，不放員工姓名、班表、檢查紀錄、照片／影片，也不接受 `data/schedule.json` 或 `data/schedule.js` 公開載入。正式環境須在部署設定注入 `PATROL_PRIVATE_CONFIG`，由私有服務驗證 Microsoft 365 access token，再從 OneDrive／SharePoint 讀寫資料；不要把 client secret、token 或密碼提交到 GitHub。

班表資料更新：

```bash
cd /Users/liamlu/Downloads/liam-agent/github-pages-liamlu
python3 scripts/build_schedule_data.py
```

腳本輸出到被 `.gitignore` 保護的 `private-data/schedule.json`，不再輸出到 `data/` 或產生可被 GitHub Pages 直接讀取的 JavaScript。私有資料服務需自行驗證 token；未設定服務時，頁面只允許本機草稿，不會假裝已同步雲端。

舊版巡店 GAS 網址可保留在頁面作為資料服務端點；網址本身不含資料或密碼，實際巡店資料仍由 GAS 的 `PT_KEY` 驗證。`PT_KEY` 與 `NOTIFY_EMAIL` 必須留在 Apps Script 設定，不要提交實際值。
