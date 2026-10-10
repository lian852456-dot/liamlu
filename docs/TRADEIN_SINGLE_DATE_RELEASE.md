# 舊換新單一日期查詢

選擇「回收日期」只顯示該日回收；「整月」恢復原月報。日期、店點與回收筆數多選共同套用到提醒複製、PNG 及 Excel。單日不重新計算月目標、達標或缺口。

公開讀取沿用 action `tradein_performance_public_read` 與月份，只有 `includeDays:true` 才回傳每日聚合。沒有這個旗標的舊前端維持原白名單。每日資料是 `recovered_days` 陣列，僅包含日期、台數及簡稱機款；合計必須符合月實績與機款。完整空陣列表示已核零筆；null／欄位缺失表示未知，停用單日匯出。日期限制在來源完整期間。

既有月快照以同一私有資料夾的 `north12b-tradein-days-<source_sha256>.json` 補充，需核對來源 SHA、名冊 SHA、月份、期間及逐人台數／機款。員編與交易資料不進入公開投影。讀取不更新月快照、registry 或 published_at；相同來源發布仍維持零寫入 no-op。

部署依既有模組 BEGIN／END 邊界，備份正式 editor 與目前部署版本，僅替換 TradeinReleaseA 中模組。保留同一 Deployment ID、執行身分、存取權限及其他檔案。回復上一版本即可撤回每日能力，舊月報繼續使用。

本機：320 個舊換新 Node 測試通過。瀏覽器契約涵蓋日期切換、店點／筆數交集、三種匯出、零筆與缺失每日來源。正式部署與實機驗收證據另存私有 release receipt。
