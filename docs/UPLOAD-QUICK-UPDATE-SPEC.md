# 戰報快速更新（網站上傳）規格

**建立日期**：2026-07-31　**作者**：Claude　**狀態**：第一階段實作完成，待 Liam 驗收

> ⚠️ **本檔是補寫的。** Liam 的任務描述要求先閱讀
> `docs/UPLOAD-QUICK-UPDATE-SPEC.md` 與 `docs/UPLOAD-QUICK-UPDATE-FILE-MAP.md`，
> 但這兩個檔在 repo、所有分支與完整 git 歷史中都不存在
> （`git log --all --diff-filter=A -- '*UPLOAD*'` 無結果）。
> 本檔依「現有程式碼的實況」補寫，並標明與原任務描述不符之處，供 Liam 校正。

---

## 1. 目的

在 M+／OneDrive 無法使用時，提供督導一條**備援**路徑更新戰報資料。
**既有流程全部保留、未被取代**：

| 既有入口 | 狀態 |
|---|---|
| GAS `kpiCalcAutoUpdate()` 每天 11:00 掃 Drive 日報 | ✅ 完全未改動 |
| GAS `kpiCalcWatchdog()` 每天 12:30 巡檢 | ✅ 完全未改動 |
| kpi.html 進階「督導發佈區」手動上傳 JSON | ✅ 保留 |
| 私有戰情 `private_publish` | ✅ 保留 |
| 本次新增：report-upload.html | ➕ **備援入口，非唯一入口** |

## 2. 與任務描述不符之處（重要，請 Liam 校正）

| 任務描述 | repo 實況 |
|---|---|
| 「Liam AI 指揮室」 | 不存在。最接近的是 `home.html`「北一二B 智慧營運中心」，是**純靜態導覽頁**，CLAUDE.md 明文禁止在其中放資料或登入。本次只在其「督導專區」加一張連結卡片，未放任何資料或密碼。 |
| 「不破壞 OneDrive 自動化」「與 OneDrive 共用同一套解析」 | repo 內**沒有任何 OneDrive／M+ 程式碼**。KPI 自動更新讀的是 **Google Drive** 資料夾（`KPICALC_SOURCE_FOLDER_ID_DEFAULT = 1zs4flck…`）中的 `MMDD.xlsx`。因此「共用同一套解析」實作為：**一律呼叫既有的 `kpiCalcParseReport()`**。 |
| 「台獎 Excel 上傳」 | repo 內**沒有任何台獎 Excel 解析器**可重用。台獎有兩條既有資料路徑：①門市同仁在 index.html 手動輸入 `tw_*` 欄位 → 回報資料試算表；②`awardsBattle` 戰情快照 JSON，由 **Codex 環境**的 `update_phone_awards.py` / `build_github_pages_data.py` 產生（不在本 repo）。 |
| 「更新既有 Google Sheet」 | KPI 與台獎的正式資料**都不存在既有試算表裡**，而是私有 Drive 的 JSON。既有試算表（北一二B每日回報／巡店明細）與這兩者無關。 |

### 台獎的處理決定

原則 5 明訂「**不得複製出第二套 KPI／台獎解析邏輯**」。由於沒有台獎 Excel 解析器可重用、
也沒有台獎 Excel 樣本或格式規格，**自行新寫一套會直接違反原則 5**，且無樣本必然寫錯。

因此第一階段的決定是：**台獎車道收 `awardsBattle` 戰情快照 JSON，不收 Excel。**
這條路徑沿用既有 `privateDashboardPublish` 的同一組必要欄位判斷，**沒有新增任何解析邏輯**。
待 Liam 提供台獎 Excel 樣本，或把 `update_phone_awards.py` 納入本 repo，
再把該解析器接上同一個 `report_upload_preview` 端點即可，前端與失敗保護不需改動。

## 3. 流程

```
督導登入（員編＋管理者密碼）
  → 選擇 KPI(.xlsx) 或 台獎(.json)
  → ① report_upload_preview
       原始檔落地私有 Drive（暫存）
       KPI：kpiCalcParseReport()  ← 與 11:00 自動化同一支函式
       台獎：JSON.parse + 快照結構檢查
       執行 9 項驗證 → 任一 block 即中止（正式資料一個位元都沒動）
       通過才寫暫存資料檔 + 發 token（30 分鐘有效）
  → 顯示檢查清單與資料預覽
  → 使用者確認
  → ② report_upload_commit
       1 原始檔備份（暫存檔改名保留）
       2 Google Sheet（本流程標示未執行，見 §2）
       3 備份目前正式資料 → north12b-*-backup-<時間>.json
       4 更新正式 JSON  ← 正式資料只在這一步被改寫
       5 讀回驗證（失敗自動還原上一版）
       6 智慧營運中心狀態
       7 寫入稽核紀錄
  → 顯示分項結果（成功／失敗／未執行／維持上一版）
```

## 4. 驗證項目（九項）

| 項目 | KPI | 台獎 | 失敗等級 |
|---|---|---|---|
| 副檔名 | `.xlsx` | `.json` | block |
| 檔案大小 | 非空、≤12MB | 同左 | block |
| 工作表名稱 | 由 `kpiCalcParseReport` 拋錯 | 快照區塊 | block |
| 必要欄位 | 25 項加權欄位 | `kpiBattle`＋`awardsBattle` | block |
| 資料日期 | `meta.month`＋`snapshotDay` | `kpiBattle.report_date` | block |
| 區域或店點 | 店代碼 `DNB` 開頭＋店名對得到 `STORES` | 店名對得到 `STORES` | block |
| 資料筆數 | 店≥5、人≥10 | 店≥1 | block |
| 早於正式版本 | 舊→block；同日→warn；新→ok | 同左 | block／warn |
| 疑似上傳錯報表 | 店點數落差>2 → warn | 格式已確認 → ok | warn |

`block` 一律不進入 commit；`warn` 顯示提醒但可由使用者確認後放行。

## 5. 失敗保護

- **預覽階段失敗**：暫存檔即時清除，正式資料完全未觸碰。
- **commit 階段失敗**：正式資料的改寫是**最後一步**，前面任一步失敗即 `skip`，正式資料維持上一版。
- **讀回驗證失敗**：自動用備份還原，並在畫面標示「已自動還原上一版」。
- **KPI／台獎互不影響**：一次 commit 只處理一個 kind，天然隔離。
- **回復上一版**：`report_upload_rollback` 取最新備份寫回，回復前仍檢查備份檔格式完整性。

## 6. 權限

- 後端 `reportUploadAuthorize_()`：管理者密碼（`DASHBOARD_ADMIN_SECRET`）
  ＋員編白名單（`REPORT_UPLOAD_ALLOWED_EMPLOYEES`，未設定時退回 `DASHBOARD_TRUSTED_EMPLOYEE_ID`）。
- 四個端點在做任何事之前都先授權（契約測試強制驗證順序）。
- commit 另檢查「預覽與確認是同一位操作者」。
- 前端也擋一次，但**後端那關才是真的**。
- 員編／密碼**不寫入 localStorage／sessionStorage**（沿用 Codex 2026-07-31 的資安基準）。

## 7. 已知限制

1. **台獎不收 Excel**（見 §2）。
2. **`kpiCalcAutoUpdate` 未加防退版保護**：若網站上傳了較新資料，而來源資料夾只有較舊的
   `MMDD.xlsx`，隔天 11:00 自動更新仍可能寫回較舊資料。這是**既有行為**（手動發佈區也有同樣風險），
   本次刻意未改動自動化（原則 3）。若要修，建議在 `kpiCalcAutoUpdate` 寫入前加一次日期比對。
3. **雲端 Claude 無法實測 GAS**：proxy 封鎖 `script.google.com`，且只有 Liam 能貼碼／部署。
   所有測試皆為本機契約測試與 route 模擬，**尚未經正式端點驗證**。
4. **智慧營運中心（home.html）本身不讀資料**，狀態列顯示的是 index.html 戰情頁籤的快照狀態。
