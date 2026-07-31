# 戰報快速更新 — 交接文件（給小榮）

**建立** 2026-07-31（Claude）　**狀態** JSON 緊急更新雛形（測試版，未驗收、未部署）

---

## 1. 目前分支

```
claude/quick-report-upload-feature-elyajz
```

- **未建立 PR、未合併 main、未部署正式 GAS**（Liam 明確指示）。
- 接手前先 `git fetch origin && git checkout claude/quick-report-upload-feature-elyajz && git pull`。

## 2. 已完成項目

| # | 項目 | 驗證方式 |
|---|---|---|
| 1 | 台獎 `.json` 緊急更新（上傳→驗證→預覽→確認→更新） | Playwright 情境 2 |
| 2 | KPI `.xlsx` 上傳（**GAS 端**解析，重用 `kpiCalcParseReport`） | 契約測試＋**真實 0730.xlsx 解析驗證通過**（§6）；寫入端未驗 |
| 3 | 9 項檔案驗證（副檔名／大小／工作表／欄位／日期／區域／筆數／早於正式版／疑似錯報表） | 契約測試 12 項 |
| 4 | 三種備份：原始檔、更新前正式資料、操作紀錄 | FILE-MAP §3 |
| 5 | 失敗保護：驗證失敗不寫、階段失敗不留半套、讀回失敗自動還原 | Playwright 情境 5~13 |
| 6 | 回復上一個成功版本 | Playwright 情境 15 |
| 7 | 權限：員編白名單＋管理者密碼，前後端雙檢 | Playwright 情境 14 |
| 8 | **防衝突：11:00 排程不覆蓋 10:55 手動上傳** | 契約行為測試 9 項 |
| 9 | 測試版標示（頁面橫幅＋home.html 卡片） | Playwright 1 項 |

**測試現況**：契約測試 50/50、Playwright 上傳情境 28/28、既有 Node 契約 20/20 全綠。

## 3. 未完成項目

| # | 缺口 | 阻塞原因 |
|---|---|---|
| 1 | 台獎 Excel 解析 | **無樣本、無欄位規格** |
| 2 | 瀏覽器本機解析工作簿 | 需選定套件並自帶（不可用 CDN） |
| 3 | 共用解析模組（離線版共用） | 尚未建立 |
| 4 | `.xls` 支援 | 需先確認是否真的還有此格式 |
| 5 | KPI 端到端真實驗證 | 解析層已用 0728＋0730 驗證（§6）；**寫入／發佈端仍只有 Liam 能驗** |
| 6 | 「更新既有 Google Sheet」 | KPI／台獎正式資料不在試算表裡，需 Liam 定義要不要建 |
| 7 | 工作簿盤點模式（只看工作表/欄位、不解析） | 建議作為小榮第一個任務 |

## 4. 現有 JSON 架構

### KPI（`north12b-kpicalc-private-latest.json`）

```jsonc
{
  "meta":  { "period": "2026/07/01 ~ 07/31", "snapshotDay": 31,
             "monthDays": 31, "month": "2026-07", "sourceFile": "0731.xlsx" },
  "items": [ { "key": "5G銷售數", "short": "5G", "step": 1 } ],      // 25 項，順序同 KPICALC_ITEMS
  "stores":[ { "code": "DNB01", "name": "通化", "official": 1.0234,
               "items": { "5G銷售數": { "t": 目標, "a": 實績, "w": 權重 } },
               "bonus": { "aqA":0,"aqT":0,"dnHiN":0,"dnHiD":0,"upN":0,"upD":0 } } ],
  "persons":[{ "store": "DNB01", "role": "門市人員", "pname": "王O明",
               "official": 0.98, "items": { ...同上... } }]
}
```

產生者：`kpiCalcParseReport()`（`gas/Code.gs`）。
**新 normalizer 必須逐欄輸出相同結構，否則 kpi.html 會壞。**

### 台獎（`north12b-dashboard-private-latest.json`）

```jsonc
{ "kpiBattle": { "report_date": "2026-07-31", ... },
  "awardsBattle": { "stores": [ { "store": "通化", "items": [...] } ] } }
```

產生者：**Codex 環境的 `update_phone_awards.py` / `build_github_pages_data.py`（不在本 repo）**。
內部欄位除 `report_date` 與 `stores[].store` 外**皆未確認**——本次只驗證這兩者，其餘不碰。

## 5. Excel 上傳缺口與建議方案

### 5.1 repo 現況

`grep -rni "sheetjs|xlsx|exceljs|papaparse"` → **repo 內沒有任何 Excel 解析套件**。
`node_modules` 只有 `@playwright/*`。GAS 端則是靠 `Drive.Files.create()` 轉成
Google 試算表再讀，不是 JS 套件。

### 5.2 前端本機解析方案（建議）

| 項目 | 建議 |
|---|---|
| 套件 | **SheetJS `xlsx`（社群版）** |
| 授權 | **Apache-2.0**（社群版）。⚠️ 發布通道已從 npm 移至自架 CDN，取用方式需確認 |
| 替代 | `exceljs`（MIT，僅 `.xlsx`，體積較大、API 較重） |
| **不依賴外部 CDN** | 把 UMD build **vendor 進 repo**（例：`vendor/xlsx.full.min.js`），以 `<script src>` 相對路徑載入。**絕不可**指向任何外部網域——GitHub Pages 上等同引入第三方，且離線版會直接失效 |
| `.xls` | SheetJS 社群版可讀 BIFF8 `.xls`；`exceljs` **不行**。若確定要支援 `.xls`，就只能選 SheetJS |
| 體積 | `xlsx.full.min.js` 約 900KB。建議只在 report-upload.html 載入，不要進 index.html |

> ⚠️ 決策點：**vendor 第三方程式碼進 repo 需要 Liam 同意**（repo 公開）。
> 先問，不要自己決定。

### 5.3 模組切分（Liam 要求三）

```
js/report/
  report-file-reader.js        // 檔案 → {sheetNames, sheets:{name: rows[][]}}；不認得業務欄位
  kpi-normalizer.js            // 工作簿 → KPI JSON（結構須等同 kpiCalcParseReport）
  phone-awards-normalizer.js   // 工作簿 → 台獎 JSON（待樣本）
  report-validator.js          // 9 項驗證，純函式，網站版與離線版共用
```

規則：**無副作用、不碰 DOM、不碰 network、不讀 localStorage**，
以 UMD 或純函式匯出，讓離線版能直接 `require`／`<script>` 共用。
**不要把解析塞進 `report-upload.html`。**

### 5.4 原始 Excel 如何安全送往 Drive 備份

目前作法（可沿用）：瀏覽器 `FileReader.readAsDataURL` → 取 base64 → POST 給 GAS →
`Utilities.base64Decode` → `folder.createFile()`。
注意：GAS `doPost` 有 payload 大小上限，base64 會膨脹約 1.37 倍。
現行上限 `REPORT_UPLOAD_MAX_BYTES = 12MB`（解碼後），preview 另擋 `encoded.length > 12MB×1.4`。
**若真實日報超過 12MB，需改為分塊上傳——請先量測實際檔案大小再決定。**

### 5.5 Apps Script 接收方式

已實作：`report_upload_preview` 收 `{kind, fileName, fileBase64}`。
改成前端解析後，建議改收 `{kind, fileName, fileBase64, normalized}`，
GAS 端**只驗證與寫入、不解析**，並在過渡期間比對
`kpiCalcParseReport(rawFile)` 與 `normalized` 是否逐欄一致（見 SPEC §3 的一致性風險）。

## 6. KPI 樣本：0728 + 0730 已驗證，byStore 定為第一版正式格式（2026-07-31）

Liam 提供 Drive 的 `0730.xlsx` 與 `0728.xlsx`（來源資料夾即 `KPICALC_SOURCE_FOLDER_ID_DEFAULT`）。
**樣本只在本機暫存目錄使用，未進 git、未推 GitHub、未寫任何正式資料。**

### 已確認的結構（不含任何業績數字）

| 項目 | 結果 |
|---|---|
| 檔案 | 2.18 MB，25 張工作表，**無隱藏工作表** |
| `上線數KPI_店點達成率_明細` | ✅ 存在（23 列 × 236 欄，388 個合併儲存格） |
| `上線數KPI_個人達成率_明細` | ❌ **不存在** |
| `上線數KPI_個人達成率_店點` | ✅ 存在（120 列 × 192 欄，500 個合併儲存格） |
| → 實際走的路徑 | **`byStore` 回退分支**（與 0728 相同，非 `detail` 主路徑） |
| 資料期間 | 第 4 列第 5 欄命中 `yyyy/MM/DD ~ MM/DD` |
| 解析結果 | 店點 **9** 家、人員 **40** 位、加權項目 **25** 項 |
| 25 項必要欄位 | ✅ 店點表與個人表皆齊全 |
| 5 個加分項 band | ✅ 齊全（AQ 加分項、RT 降轉／升轉各 2） |
| 公式儲存格 | **0**（不必擔心快取值問題） |
| 百分比格式 | 店點表 359 格、個人表 3216 格，`kpiCalcPct` 轉換正確 |
| 重複 band 名稱 | ✅ 無 |
| 個人表段寬 | **不是固定 4 欄**：45 段寬 4、**1 段寬 5** → 證實 CLAUDE.md 的警告，`kpiCalcBandsPairs` 逐段偵測是對的，**不可改回 `c += 4`** |
| 空白列／`合計` 列 | 82 空白列、9 個 `合計` 列，parser 均正確略過 |
| JSON 結構 | ✅ 與正式 `{meta, items, stores, persons}` 逐欄一致 |

### ⚠️ 本次靠真實樣本抓到的 BUG（已修）

報表店名帶前綴（`台北酒泉`／`台北通化`…，三創是 `台灣大哥大數位生活台北三創`），
而 `STORES` 常數是 `酒泉`／`通化`／`台北三創`。
原本 `reportUploadValidateKpi_` 用 `STORES.indexOf(name)` **精確比對** →
**9 家全部落空 → 真實日報被判定「疑似上傳其他區資料」而擋下。**

修法：新增 `reportUploadStoreMatch_()` 改為雙向包含比對，實測 9/9 命中；
另加測試確認外區店名（板橋／中壢／光復…）仍會被擋。
**這個坑只有真實樣本才會踩到，`STORES` 或報表店名變動時請重看這條。**

### 0728 vs 0730 逐項比對（2026-07-31，Liam 指示）

| # | 比對項目 | 結果 |
|---|---|---|
| 1 | 工作表名稱 | ✅ 25 張，名稱與順序完全一致；兩份**都沒有** `_個人達成率_明細` |
| 2 | 工作表結構 | ✅ 維度、合併格數、個人表段寬分佈全部一致 |
| 3 | 日期位置 | ✅ 都在店點表第 4 列第 5 欄 |
| 4 | 店點欄位位置 | ✅ 第 15 列起、D/E/H 欄，9 家列號與代碼完全一致 |
| 5 | 個人分組方式 | ✅ 段首列號與門市名一致（唯一差異是期間文字 `~07/27` vs `~07/29`，非結構差異） |
| 6 | 25 項 KPI 欄位 | ✅ 兩份都齊全且欄位位置相同；**但 5 個 RT 升降轉率加分項欄位會漂移**（見下） |
| 7 | JSON schema | ✅ 10 項結構檢查全部一致（含 items 順序） |
| 8 | 9 家門市命中 | ✅ 兩份都 9/9 唯一命中，無歧義 |
| 9 | 網站完整資料 | ✅ 兩份都：店 9／人 40／每店 25 項、權重與目標 225/225 非零、bonus 六鍵齊全 |

### 🚨 欄位順序不穩定（本次新發現）

`RT降轉率_降轉數(前約 V+D 1399(含)以上)` 等 **5 個加分項 band 在兩份報表的欄位位置不同**
（欄 160→148、148→164、164→160、152→168、168→152）。名稱集合相同，只是順序被換過。

`kpiCalcParseReport` 以**名稱**查表所以不受影響，但這代表：
**任何未來的 normalizer 都不可以用固定欄號取值。** 這條比「段寬不是 4」更嚴格。

### 樣本狀態：KPI 已足夠

**不需要再找 `_明細` 版本**（Liam 2026-07-31 確認該格式在實務上不存在）。
程式保留相容分支即可，但不是正式格式的條件。
唯一還沒確認的是 `.xls` 是否真的會出現；若否，直接不做。

### 檔名日期 ≠ 資料日期（已確認的規則）

| 檔名 | 期間 | dataDate |
|---|---|---|
| `0728.xlsx` | `2026/07/01 ~ 07/27` | **2026-07-27** |
| `0730.xlsx` | `2026/07/01 ~ 07/29` | **2026-07-29** |

兩份都差一天，證實：**檔名 = 報表產出日，內容 = 統計截止日。**
版本比較一律以 meta 解析出的 `dataDate` 為準，**不用檔名推算**。
預覽畫面已同時顯示「原始檔名／報表資料日期／上傳時間／是否晚於正式版本」四項，
並附說明避免使用者以為日期讀錯。

## 7. 台獎報表盤點（2026-07-31，01-08-03 / 01-08-04 兩份真實樣本）

### 7.1 樣本來源

兩份都在 KPI 來源資料夾（`KPICALC_SOURCE_FOLDER_ID_DEFAULT`）內，與 `MMDD.xlsx` 並存：

| 檔案 | 大小 | 層級 |
|---|---|---|
| `01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx` | 28,347 B | **店點層級** |
| `01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx` | 54,220 B | **個人層級** |

**兩份都只有 1 張工作表**（由 zip 內只有 `xl/worksheets/sheet1.xml` 確認）。
工作表名推測為 `上線數KPI_店點達成率_明細`／`手機競賽_個人達成率`
——**推測**，因為本輪用的文字擷取工具不標示工作表邊界。

> ⚠️ **合併儲存格數、隱藏工作表、公式數量本輪無法取得**。
> 這些需要二進位檔＋openpyxl；本環境唯一的 Drive 取檔管道對這個大小的檔案
> 會直接回傳 base64 到對話中，人工轉錄實測會截斷（30,452／37,796 字元，已驗證失敗並刪除）。
> **請小榮在能直接下載檔案的環境補這三項。**

### 7.2 共同結構

| 位置 | 內容 |
|---|---|
| 第 1 列 | 工作表標題＋「此報表僅供業績追蹤，實際獎金結算以營管提供 D+30 為最終版」 |
| 第 2 列 | `手機競賽 店點達成率＆空機數`／`手機競賽 個人上線數＆空機數` |
| 第 3 列 | `202607` ＋ **`2026/07/01 ~ 07/29`** ← 資料日期，格式與 KPI 日報**完全相同** |
| 機款帶 | `上線數_01_…` ~ `上線數_45_…`，接著 `空機數_01_…` ~ `空機數_45_…` |
| 子標題 | 店點表 `實際數／目標數／推估 達成率`；個人表 `實際數／**店**目標數／**店**推估 達成率` |
| 每列尾 | `實際總獎金`、`推估原始總獎金 (不含排名權重獎金)`、`排名`、`領獎與否` |

**共 45 個機款**，上線數與空機數各一組（空機數只有實際數，無目標／達成率）。

> ⚠️ **個人表的目標與達成率是「店目標數」「店推估達成率」**，
> 也就是**每個人列上重複的是店層級數字，不是個人目標**。做個人達成率時不要誤用。

### 7.3 欄位對照

**店點表（01-08-03）**

| 欄 | 內容 |
|---|---|
| 3 | 北一區（大區） |
| 4 | 北一二區 |
| 6 | **北一二B** ← 營業區域 |
| 7 | 店代碼 `DNB…`（區總計列此欄為空） |
| 9 | 店名 |
| 之後 | 每機款 `實際數／目標數／推估達成率` |
| 末四欄 | 實際總獎金／推估原始總獎金／排名／領獎與否 |

第一筆資料列是 **北一二B 區總計**（無店代碼、無店名），其後才是 9 家門市。

**個人表（01-08-04）**

| 欄 | 內容 |
|---|---|
| 1 | 北一二區 |
| 2 | **北一二B** ← 營業區域 |
| 3 | 店代碼 `DNB…` |
| 4 | 店名 |
| 5 | **職稱**（店長／代理店長／副店長／業代／業務代表(I)／業務代表(II)／銷售人員） |
| 6 | **員編**（含 `558I082`／`558S420`／`558V707` 這類含字母的） |
| 7 | **姓名——來源已遮罩**（如 `X*X`），不需另外遮罩 |
| 8 | 數值或 `到職後9M`／`到職後3M`（**用途未確認**，疑似目標基準或年資係數，需 Liam 說明） |
| 之後 | 每機款 `實際數／店目標數／店推估達成率` |
| 末四欄 | 實際總獎金／推估原始總獎金／排名／領獎與否 |

### 7.4 區域與門市辨識

- 兩份樣本**只含北一二B**，每列都帶固定的 `北一二B` 欄位 → 可直接用該欄過濾，
  比 KPI 的店名比對更可靠。
- 店代碼與店名**與 KPI 日報完全一致**（`DNB10062` 台北酒泉 … `DNB10307` 台灣大哥大數位生活台北三創），
  因此 `reportUploadStoreMatch_` 可直接沿用，9/9 命中。
- **9 家門市全部到齊**；個人 **40 位**，與同期 KPI 日報的 40 位一致。
- ⚠️ **本樣本未出現其他區資料**，所以「是否可能混入其他區」**未確認**——
  解析器仍應以 `北一二B` 欄位過濾，不要假設整份檔案都是本區。

### 7.5 與 `awardsBattle` 的落差（關鍵）

消費端契約來自 `index.html` 的 `renderAwardsBattle` / `renderAwardUnit` / `renderAwardModel`：

| awardsBattle 欄位 | Excel 是否有 | 說明 |
|---|---|---|
| `supervisor.actual_total` / `projected` / `rank` / `award` | ✅ | 取店點表的**北一二B 區總計列**末四欄 |
| `stores[].store` | ✅ | 店名 |
| `stores[].award.actual_total` / `projected` / `rank` / `award` | ✅ | 各店末四欄 |
| `stores[].items[].display_name` / `actual` / `target` / `rate` | ✅ | 機款帶 |
| `stores[].items[].difference` | ⚠️ 需計算 | 頁面註明「實際數－50%目標台數（無條件進位）」，**規則需 Liam 確認** |
| `stores[].items[].next_label`（下一獎階） | ❌ **無** | 需獎階表 |
| `stores[].items[].incremental_award`（會增加多少獎金） | ❌ **無** | 需獎階表 |
| 「10 台重點機款」的挑選 | ❌ **無** | Excel 有 45 款；頁面只顯示 10 款，且「前三台依本月最高台獎順位」 |
| `stores[].priorities`（補量優先順位） | ❌ **無** | 由上述規則導出 |
| `overall` | ⚠️ | 頁面有預設值可回退，但正式資料是否提供**未確認** |

**結論：兩份 Excel 提供了實際／目標／達成率／獎金總額／排名／領獎與否，
但「獎階、單機款獎金級距、10 款挑選規則」完全不在裡面。**

### 7.6 因此還缺什麼

1. **獎階／獎金級距對照表** —— 決定 `next_label`、`incremental_award`、10 款挑選。
   → **強烈建議提供 `Y26重點台獎手機.xlsx`**（同資料夾，412 KB，檔名即指向「重點台獎手機」）。
2. **確認 `difference` 規則**：是否仍為「實際數－50%目標台數，無條件進位」。
3. **確認個人表第 8 欄**（數值／`到職後9M`）的意義。
4. **確認 `supervisor` 是否就是區總計列**，或另有督導個人獎金來源。
5. **確認是否可能混入其他區資料**。

**在 1~5 釐清前不撰寫台獎解析器**——否則就是在猜台獎計算規則。

### 7.7 解析器規格草案（待 Liam 確認後才實作）

```
phone-awards-normalizer(storeWorkbook, personWorkbook, awardTierTable)
  → { kpiBattle:{report_date}, awardsBattle:{supervisor, overall, stores[]} }

步驟（全部以「欄位標題文字」定位，不用固定欄號——KPI 已證實欄序會漂移）：
  1. 從第 3 列抓 `yyyy/MM/DD ~ MM/DD` → report_date（統計截止日，非檔名日）
  2. 以 `北一二B` 欄過濾，丟棄非本區列
  3. 店點表：無店代碼的列 → supervisor；有 DNB 代碼的列 → stores[]
  4. 機款帶：以 `上線數_NN_機款名` 切段，取 實際數／目標數／推估達成率
  5. 個人表：以 店代碼＋員編 為鍵，職稱與姓名直接取用（姓名來源已遮罩）
  6. difference / next_label / incremental_award / 10 款挑選
     ← **一律由 awardTierTable 決定，normalizer 不得內建常數**
```

**紀律**：與 KPI 相同，`reportUploadStoreMatch_` 沿用、欄位一律以名稱查表、
歧義回 `ambiguous-store-match` 不自行選擇。

### 7.8 台獎預覽畫面最小資訊（Liam §五）

| 欄位 | 來源 |
|---|---|
| 報表日期 | 第 3 列 `~ MM/DD` 解析出的 dataDate |
| 原始檔名 | 上傳檔名（與 KPI 一致，檔名≠資料日期，需並列顯示） |
| 上傳時間 | `privateDashboardNow()` |
| 北一二B 店點數 | 過濾後的 stores 筆數（預期 9） |
| 人員數 | 個人表過濾後筆數（預期 40） |
| 手機機款數 | 機款帶數量（預期 45；若與獎階表對不上要提示） |
| 店點台獎總額 | 各店 `實際總獎金` 加總 |
| 個人台獎筆數 | 有 `實際總獎金 > 0` 的人數 |
| 無法辨識的門市 | `reportUploadStoreMatch_` 回 `none` / `ambiguous-store-match` 的清單 |
| 無法辨識的機款 | 不在獎階表內的機款名 |
| 與目前正式版本的差異 | 沿用 `reportVersionDecide_`，顯示 rule 與是否需強制覆寫 |
| 是否可發布 | 無 `block` 級檢查且版本判定 accept 才顯示確認鍵 |

## 7.9 🔍 2026-07-31「網站顯示舊資料」現場診斷（實查 Drive，非推測）

### 結論先講：**這不是程式壞掉，是今天的來源檔沒上傳。**

`parentId = 1zs4flck…`（KPI 來源資料夾）查詢
`createdTime > 2026-07-30T12:00:00Z` → **回傳空集合**。
也就是說 **2026-07-31 一整天沒有任何新來源檔進到資料夾**，
最新的仍是 07-30 02:17~02:18 上傳的 `0730.xlsx` 與 `01-08-03`／`01-08-04`。

### 兩份正式資料的實際狀態

| 項目 | `north12b-kpicalc-private-latest.json` | `north12b-dashboard-private-latest.json` |
|---|---|---|
| 消費端 | **kpi.html** | **index.html** 的 🏆KPI戰情＋🏅台獎戰情 |
| 讀取函式 | `kpiCalcAccess` → `kpiCalcLatestDataFile` | `privateDashboardAccess` → `privateDashboardSnapshot` |
| Drive 最後更新 | **2026-07-30 11:51（台北）** | **2026-07-30 14:19（台北）** |
| 資料日期 | `meta.period = 2026/07/01 ~ 07/29`、`sourceFile = 0730.xlsx` | `report_date = 2026-07-30`、`source_as_of_date = **2026-07-29**` |
| 產生者 | **GAS `kpiCalcAutoUpdate`（雲端 11:00 觸發器）** | **Liam 本機 Mac 手動流程**（見下） |
| 內容 | 9 店／40 人／25 項，職稱 40/40 齊全 | kpiBattle 9 店＋personal 31 人；awardsBattle 9 店×10 機款 |

**兩邊的資料截止日其實一樣，都是 07/29。** kpi.html 的 11:51 正是 CLAUDE.md 記載的
「`.atHour(11)` 無 `nearMinute`，實測落在 11:51」——**07-30 那天排程是成功的**。

### 🚨 最重要的發現：index.html 的 KPI 戰情**不是** GAS 產的

`awardsBattle.source_files` 直接寫出了來源路徑：

```
/Users/liamlu/Downloads/liam-agent/report-automation/input/google-drive/phone-awards/
    01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx
    01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx
    Y26重點台獎手機.xlsx
awardsBattle.source_mode = "01-08-03/01-08-04 -> Y26 tabs -> screenshots"
visibility = "private-local-preview"
```

所以 **KPI 有兩條完全獨立的管線**：

```
0730.xlsx ─(GAS 11:00 雲端)→ north12b-kpicalc-private-latest.json ─→ kpi.html
01-08-03/04 + Y26 ─(Liam 本機 Mac 手動)→ north12b-dashboard-private-latest.json
                                          ├─ kpiBattle  ─→ index.html KPI戰情
                                          └─ awardsBattle ─→ index.html 台獎戰情
```

**GAS 端完全沒有任何台獎自動化函式**（`grep` 全檔無台獎更新函式），
台獎與 index.html KPI戰情**只能靠本機那條手動流程**產出後以 `private_publish` 發佈。
這就是為什麼「KPI 更新了，index.html 還是舊的」——它們根本不是同一份資料。

### 這也回答了 §7.6 的缺口

`Y26重點台獎手機.xlsx` **確認就是獎階表**：正式快照的
`items[]` 有 `next_label`／`next_threshold`／`incremental_award`／`monthly_award_max`／
`threshold`／`threshold_target`／`units_needed`／`gap`／`status`，
全部是兩份日報 Excel 沒有、只能由 Y26 表推出的欄位。每店剛好 **10 機款**（45 選 10）。

### 明日排程實際會做什麼（以**目前線上部署的舊版**為準）

| 項目 | 實況 |
|---|---|
| 執行時間 | `kpiCalcAutoUpdate` `.atHour(11)` **無 `nearMinute`** → 11:00~12:00 任意時間，實測 11:51；`kpiCalcWatchdog` 12:30 |
| 搜尋資料夾 | `KPICALC_SOURCE_FOLDER_ID`（預設 `1zs4flck…`） |
| 檔名規則 | **`/^(\d{4})\.xlsx$/`** —— 只認 `MMDD.xlsx`。`01-08-03`／`01-08-04`／`Y26` **一律掃不到** |
| 挑檔依據 | **檔名數字**（`Number('0731')`）挑最大者 |
| 資料日期依據 | **報表內容**（`meta.period`），非檔名 |
| KPI 更新函式 | `kpiCalcAutoUpdate` → `kpiCalcParseReport` → 寫 `north12b-kpicalc-private-latest.json` |
| 台獎更新函式 | **不存在** |
| 成功後哪些網站變 | **只有 kpi.html**。index.html 兩個頁籤都不會變 |
| 失敗是否保留上一版 | 會。解析丟例外 → `catch` → 寄 ❌ 信，**不寫入** |
| 錯誤紀錄 | `kpiCalcNotify` 寄信（`DASHBOARD_NOTIFY_EMAIL`／`NOTIFY_EMAIL`）＋ `console.log` |
| 舊蓋新的可能 | **目前線上版有此風險**：手動 `kpicalc_publish` 不會更新 `KPICALC_LAST_IMPORT`，排程可能用舊 `MMDD.xlsx` 覆蓋掉手動發佈。**本分支的 `reportVersionDecide_` 已修掉，但本分支尚未部署** |

### 明日最可能失敗的位置

1. **來源檔沒上傳**（今天就是這樣）→ 排程靜靜略過，12:30 巡檢寄「⚠️ 今日尚未上傳」。
2. **台獎完全不會自己更新** —— 沒跑本機流程就永遠是舊的，且**沒有任何巡檢會提醒**。
3. Drive API 進階服務若被移除 → `Drive is not defined`（07-30 成功過，目前應無此問題）。

### 今晚的最小修復（只有 Liam 能做，且不需要動任何程式）

1. 把今天的 `0731.xlsx` 上傳到 KPI 來源資料夾 → 明天 11:00 自動進 kpi.html；
   想立刻生效就在 GAS 執行 `testKpiCalcAutoUpdate()`。
2. 台獎／index.html 戰情：在本機跑 `report-automation` 那條流程，再 `private_publish`。
   **這一步無法自動化，除非把該流程搬進 GAS 或雲端。**

## 8. 欄位對照待辦

| 待辦 | 依賴 |
|---|---|
| KPI 25 項加權欄位 → 工作簿欄位位置 | 已存在於 `kpiCalcBands`／`kpiCalcBandsPairs`，可直接移植 |
| KPI `_店點` 版面的合併儲存格處理 | 已存在於 `kpiCalcBandsPairs`（**不可用 `c += 4`**） |
| KPI 職稱回填 | `kpiCalcPrevRoles()` 沿用上一份 JSON |
| 台獎機款帶 → 實際／目標／達成率 | ✅ 已盤點（§7.3） |
| 台獎獎階／獎金級距／10 款挑選 | ❌ **仍缺**，需 `Y26重點台獎手機.xlsx`（§7.6） |

## 9. 11:00 排程覆蓋風險

**已實作防護。** 規則詳見 `UPLOAD-QUICK-UPDATE-SPEC.md` §4。摘要：

- 10:55 手動上傳 → 版本狀態記為 `manual-upload`。
- 11:00 排程解析後，寫入前先問 `reportVersionDecide_()` → 命中 `manual-wins` → **略過、不寫、寄 ℹ️ 通知信**。
- 隔天真正較新的日期照常更新，排程日常運作不受影響（有測試涵蓋）。
- 回復後記為 `rollback`，同樣受保護。

**殘留風險**：`REPORT_UPDATE_STATE` 是指令碼屬性，若被手動清空，防護會退回「首次寫入」而放行。
可用 `reportVersionStatus()` 在 GAS 編輯器隨時查看目前狀態。

## 10. 所有網站同步盤點

見 `UPLOAD-QUICK-UPDATE-FILE-MAP.md` §2。**已確認會同步**：kpi.html、index.html 戰情頁籤。
**未確認**：Liam AI 指揮室（頁面不存在）、`window.__*_BATTLE_DATA__` 本機回退、GitHub Pages 來源分支。

## 11. 正式部署步驟（只有 Liam 能做）

1. `git checkout main && git pull`，跑 FILE-MAP §6 的函式完整性檢查。
2. 貼 `gas/Code.gs` 進 GAS 編輯器存檔。
3. 確認左側「服務」已有 **Drive API**（缺了會報 `Drive is not defined`）。
4. 設定指令碼屬性（§12）。
5. **部署 → 管理部署作業 → ✏️ → 新版本 → 部署**（本次改了 `doPost`，非做不可）。
6. 函式選單執行一次 `reportVersionStatus()` 確認版本狀態可讀寫。
7. 開 `report-upload.html`，**先只按「① 檔案檢查與預覽」**，確認預覽數字正確再按確認。

## 12. Apps Script Properties 設定

| 屬性 | 必要性 | 值 |
|---|---|---|
| `REPORT_UPLOAD_ALLOWED_EMPLOYEES` | **本次新增，必設** | 逗號分隔員編白名單。不設則只有 `DASHBOARD_TRUSTED_EMPLOYEE_ID` 能用 |
| `REPORT_UPDATE_STATE` | 自動建立 | 不要手動編輯；要重置才清空 |
| `DASHBOARD_ADMIN_SECRET` | 既有 | 上傳頁的「管理者密碼」 |
| `DASHBOARD_PRIVATE_FOLDER_ID` | 既有 | 私有 Drive 資料夾 |
| `DASHBOARD_ROSTER_SHEET_ID` | 既有 | 稽核紀錄分頁寫在這裡 |
| `KPICALC_SOURCE_FOLDER_ID` | 既有 | 11:00 排程來源 |

## 13. 測試方式

```bash
npm install
node --test tests/report-upload-contract.test.cjs        # 46 項
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium \
  npx playwright test tests/report-upload.spec.js        # 28 項
```

⚠️ `tests/patrol.spec.js` 有 2~5 項 **既有 flaky** 失敗，每次失敗項目不同，
在未改動的 HEAD worktree 上重跑同樣會失敗。**與本功能無關，不要花時間追。**

## 14. 回復方式

- **畫面**：對應車道按「↩ 回復上一個成功版本」。
- **手動**：私有 Drive 把 `backup-north12b-kpicalc-<時間>.json` 內容複製回
  `north12b-kpicalc-private-latest.json`。
- **程式碼回退**：本分支未合併 main，直接不合併即可；`gas/Code.gs` 回退需在 GAS
  「管理部署作業」選回舊版本，**並注意時間觸發器跑的是編輯器 HEAD，不是部署版本**。

## 15. 建議執行順序

1. **先問 Liam 兩件事**（都會改變後續設計）：
   a. 「Liam AI 指揮室」是指 home.html 還是要新建頁面？
   b. vendor 第三方 Excel 套件進公開 repo 是否可接受？
2. **拿樣本**（§6、§7）。沒有樣本的工作不要開始。
3. **做工作簿盤點模式**：上傳 → 只列出 `sheetNames` 與前幾列，不做任何業務解析。
   這一步不需樣本就能做，而且做完就能拿真實檔跑出欄位清單。
4. 用盤點結果建 `report-file-reader` + `kpi-normalizer`，
   **與 `kpiCalcParseReport` 逐欄比對到完全一致**才算完成。
5. 一致後才討論「GAS 端是否改為只收標準化資料」（收斂為一套解析）。
6. 台獎 normalizer 最後做，且必須先有 §7 的全部資料。
7. 全部完成、Liam 驗收後，才拿掉「測試版」標示。

## 16. 禁止修改區域

| 區域 | 原因 |
|---|---|
| `kpiCalcParseReport()` 及其 helper（`kpiCalcBands*`／`kpiCalcNum`／`kpiCalcPct`／`kpiCalcParseMeta`） | 11:00 排程與上傳共用；改壞會同時弄壞兩條路 |
| `kpiCalcAutoUpdate()` 的解析與 `KPICALC_LAST_IMPORT` 邏輯 | 本次只加了防衝突把關，其餘不要動 |
| `privateDashboardPublish()` 改成硬擋 | 會打斷 Codex 每日管線，**需 Liam 決定** |
| `index.html`／`kpi.html`／`patrol.html` 的既有資料流 | 本功能不應改動它們 |
| `home.html` 放資料或登入 | CLAUDE.md 明文禁止 |
| 備份檔名前綴 `backup-` | 改了會踩 `kpiCalcLatestDataFile()` 的坑，有測試守著 |
| 既有 Google Sheet 結構（回報資料／巡店明細） | Liam 原則 2 |
| OneDrive／M+ 相關流程 | 不得刪除（**註：repo 內實際上找不到任何 OneDrive 程式碼**） |
