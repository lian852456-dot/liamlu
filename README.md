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

## patrol.html 受保護工作頁籤

`patrol.html` 除原有巡店看板外，另有兩個沿用 `PT_KEY` 的通行碼保護頁籤：

- `每月班表`：由本機同步的 OneDrive `TWM 班表/*.xls` 產生瀏覽器資料，支援每日、每週、每月檢視與 Excel `.xls` 匯出。
- `半月督導檢查`：督導可逐題填寫 33 項檢查、缺失與改善說明，選取照片／影片並匯出完整紀錄與缺失改善追蹤 Excel。

班表資料更新：

```bash
cd /Users/liamlu/Downloads/liam-agent/github-pages-liamlu
python3 scripts/build_schedule_data.py
```

GAS `Code.gs` 新增 `hread` / `hwrite` 端點，修改後要在 Apps Script「管理部署作業」建立新版本。照片／影片原檔不直接寫入 Google Sheets，試算表只保存附件名稱，原檔留在填寫裝置。
