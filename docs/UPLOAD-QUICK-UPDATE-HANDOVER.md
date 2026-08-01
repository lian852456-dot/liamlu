# 戰報快速更新 — 交接文件（給小榮）

**建立** 2026-07-31（Claude）　**狀態** JSON 緊急更新雛形（測試版，未驗收、未部署）

---

## 1. 目前分支

```
claude/report-data-freshness-hotfix     ← 現行開發分支（基底：claude/quick-report-upload-clean bc9301b，base main adf7542）
```

- 舊分支 `claude/quick-report-upload-feature-elyajz` 含 bde4c6b 事故授權歷史，**已停用，不得再開發**。
- 本分支由「去污染驗收」後的 `claude/quick-report-upload-clean` 建出，**不含任何 bde4c6b 授權內容**
  （`reportSessionRequired_`／`report_auth`／`REPORT_SESSION_TTL` 全檔 0 次，有檢查證據）。
- **未建立 PR、未合併 main、未部署正式 GAS**（Liam 明確指示）。
- 接手前先 `git fetch origin && git checkout claude/report-data-freshness-hotfix && git pull`。

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

## 7.9 🔍 2026-07-31「網站顯示舊資料」現場診斷（實查 Drive，Liam 已確認）

**結論：不是程式壞掉，是當天來源檔沒上傳。** 查 KPI 來源資料夾
`createdTime > 2026-07-30T12:00Z` → 空集合；最新來源仍是 07-30 上傳的
`0730.xlsx` 與 `01-08-03`／`01-08-04`。07-30 的排程其實成功
（KPI JSON mtime 07-30 11:51，`meta.sourceFile=0730.xlsx`，9 店／40 人／25 項齊全）。

### 🚨 KPI 有兩條完全獨立的管線（最容易誤判的地方）

```
0730.xlsx ──(GAS 11:00 雲端排程)──▶ north12b-kpicalc-private-latest.json ──▶ kpi.html
01-08-03/04 + Y26 ──(Liam 本機 Mac report-automation → private_publish)──▶
    north12b-dashboard-private-latest.json ─┬─ kpiBattle   ──▶ index.html KPI戰情
                                            └─ awardsBattle ──▶ index.html 台獎戰情
```

證據：正式快照的 `awardsBattle.source_files` 寫著
`/Users/liamlu/Downloads/liam-agent/report-automation/input/google-drive/phone-awards/…`，
`source_mode = "01-08-03/01-08-04 -> Y26 tabs -> screenshots"`、
`visibility = "private-local-preview"`。
**「KPI 更新了但 index.html 沒變」是正常現象——兩者不是同一份資料。**

### 隨之確認的三件事

1. **GAS 端零台獎自動化**，也**沒有任何巡檢**盯台獎沒更新（KPI 有 12:30 watchdog，台獎沒有）。
2. **`Y26重點台獎手機.xlsx` 就是獎階表**：正式快照 `items[]` 帶
   `next_label`／`next_threshold`／`incremental_award`／`monthly_award_max`／`units_needed`／
   `gap`／`status`，全是兩份日報 Excel 沒有的欄位；每店恰 10 機款（45 選 10）。
3. 排程只認 `/^(\d{4})\.xlsx$/`，`01-08-*`／`Y26` 放同資料夾**不會**被 KPI 排程誤讀。

### 第二優先「綜合戰情一致化」方案比較（尚未實作，待 Liam 拍板）

| 比較項 | 方案 A：index.html KPI 頁籤改讀 kpicalc JSON | 方案 B：KPI 發布後同步改寫 snapshot 的 kpiBattle |
|---|---|---|
| 權限安全 | `kpicalc_access` 與 `private_access` 同一名冊＋裝置綁定，等級相同 | 同左，但 GAS 需寫 snapshot |
| 修改範圍 | 只改 index.html 前端（讀取＋渲染） | 改 GAS 寫入邏輯＋新部署 |
| 依賴本機 Mac | **KPI 頁籤不再依賴**（台獎仍依賴，另案） | 仍要（snapshot 其餘欄位仍由 Mac 產） |
| 需重新部署 | 只需 Pages；**GAS 不用**（kpicalc_access 已在第 15 版上線） | GAS 要新版本 |
| 失敗保護 | 唯讀改動，可保留 snapshot 為回退 | 兩處寫入，出錯會產生「半份 snapshot」 |
| 單一真相 | ✅ 兩頁讀同一份 KPI JSON | ❌ 產生第二份 KPI 副本，會漂移 |
| 明日可完成 | 前端工作量中等（見下方限制），可行 | 不建議急做 |

**✅ 2026-07-31 Liam 拍板：方案 A，已實作。** kpicalc JSON 定為 **KPI 唯一正式資料來源**；
dashboard snapshot 僅保留給台獎頁籤與舊版回復。缺少欄位（company_rank／DOD／加掛分／
個人排名／個人台獎／保險搭售率）畫面一律顯示「**尚未同步**」或隱藏（DOD 直接不出現），
**不得沿用 snapshot 舊數字**——有 Playwright 反向斷言把關。
來源說明列同時顯示：資料日期／區間／來源檔／更新時間（尚未同步＋讀取時間）／來源標示
「與 kpi.html 同一份」。後續由 parser 擴充從同一份 Excel 補 company_rank／DOD／加權分，
不建立第二份 KPI 正式資料。

實作位置：`index.html` 的 `kpicalcToKpiBattleView()` 轉接層＋`kpiPendingCell()`；
登入時台獎先渲染、kpicalc 失敗只影響 KPI 頁籤。測試：`tests/kpi-battle-source.test.cjs`
11 條（含轉接層實際執行，驗證不發明數字）＋ `tests/app.spec.js` KPI 戰情段落改寫。

## 7.10 ✅ 正式驗收清單（等 Liam 建立新 Deployment 後執行）

### A. 部署前置（Liam 操作，§11 有逐步說明）

- [ ] GAS 貼上 main 合併後的 `Code.gs`（**先跑 FILE-MAP §6 函式完整性檢查**）
- [ ] 「部署 → **新增部署作業**」建立上傳專用 Web App → 取得新 /exec URL
- [ ] 指令碼屬性：`REPORT_UPLOAD_DEPLOYMENT_URL` ＝ 新 URL、`REPORT_UPLOAD_ALLOWED_EMPLOYEES` ＝ 員編白名單
- [ ] `report-upload.html` 的 `UPLOAD_GAS_URL` 填入新 URL（取代 CHANGE_ME）→ Pages 部署
- [ ] 每日回報 Deployment **確認仍為第 15 版、全程未被編輯**

### B. 隔離驗證

- [ ] `新URL?action=ping` → `{"status":"ok","app":"report-upload"}`
- [ ] `新URL?action=read&date=...&seg=16` → `route-not-available-on-upload-deployment`
- [ ] 舊每日回報 URL 的 `?action=ping` 與門市回報照常（第 15 版行為不變）

### C. 真實 KPI 檔驗收（Liam 指定十項）

- [ ] 1. 上傳當日 `MMDD.xlsx` 按「① 檔案檢查與預覽」→ 私有 Drive 的正式 JSON **mtime 不變**（預覽不改正式資料）
- [ ] 2. 預覽的「報表資料日期」＝檔內期間截止日（檔名日期減一天屬正常，畫面有說明）
- [ ] 3. 預覽顯示店點 **9** 家、人員約 **40** 位、25 項欄位齊全
- [ ] 4. 按「② 確認發布」→ `north12b-kpicalc-private-latest.json` 更新（mtime／內容）
- [ ] 5. kpi.html 重新登入 → 顯示新資料日期
- [ ] 6. index.html KPI 戰情重新登入 → 顯示**相同**資料日期與來源檔（方案 A 同一份）
- [ ] 7. index.html 缺少欄位顯示「尚未同步」，**沒有任何舊 snapshot 數字**
- [ ] 8. 上傳錯誤檔（如台獎 01-08-03）→ 被擋在預覽，正式 JSON 不變
- [ ] 9. 按「↩ 回復上一個成功版本」→ kpi.html 回到前一份資料
- [ ] 10. 全程結束後：門市每日回報（index.html 回報頁）讀寫照常、巡店照常

### D. 台獎資料到齊後的接續順序（本輪不動工）

前置檔案（缺一不可，**拿到前不寫台獎解析器**）：
`update_phone_awards.py`（或欄位對照邏輯）→ 真實每日台獎 Excel（01-08-03／01-08-04 當日版）
→ 正確台獎 JSON（同日 `north12b-dashboard-private-latest.json`）→ `Y26重點台獎手機.xlsx` 獎階內容。

1. 用 update_phone_awards.py 對照 §7.3 盤點，確認每個 awardsBattle 欄位的計算來源（不反推）。
2. 以同一天的「兩份 Excel＋Y26＋正確 JSON」做黃金樣本：解析器輸出必須逐欄重現正確 JSON。
3. 依 §7.7 規格實作 `phone-awards-normalizer`（獎階一律由 Y26 表注入，不內建常數）。
4. 台獎預覽（§7.8 十二項資訊）→ Liam 驗收數字 → 才接上發布。
5. 過渡期間：**既有的台獎 JSON 上傳（安全預覽／發布）保留為人工備援**，本機 Mac 流程照舊。

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

## 11. 正式部署步驟（只有 Liam 能做）—— 獨立上傳 Deployment 版

**核心原則（2026-07-31 Liam 指示）：每日回報 Deployment 固定第 15 版不動。
快速上傳走同一個 Apps Script 專案的「另一個新 Deployment」，兩者互不影響。**

程式端已實作部署隔離閘 `reportUploadIsUploadDeployment_()`：
當指令碼屬性 `REPORT_UPLOAD_DEPLOYMENT_URL` 等於「目前服務中 Deployment 的 /exec URL」時，
該 Deployment 的 doPost **只放行** `report_upload_preview/commit/log/rollback` 四個路由，
doGet 只回 `ping`（帶 `app:'report-upload'` 識別）——read/write/巡店/戰情一律拒絕。
屬性未設定時隔離不啟用，主部署行為完全不變（安全預設）。

1. 本分支驗收合併後，`git checkout main && git pull`，跑 FILE-MAP §6 函式完整性檢查
   （新增三個要為 1：`reportUploadIsUploadDeployment_`、`REPORT_UPLOAD_ALLOWED_ACTIONS` 所在段、隔離測試通過）。
2. 貼 `gas/Code.gs` 進 GAS 編輯器存檔。
   ⚠️ **不要動「管理部署作業」裡的每日回報 Deployment——它停在第 15 版，貼碼存檔不影響它。**
3. 確認左側「服務」已有 **Drive API**。
4. 設定指令碼屬性（§12，含新的白名單與部署 URL 兩項——URL 先留空，第 6 步才有值）。
5. **部署 → 新增部署作業 →（型別：Web 應用程式）→ 部署**：這會產生一個**全新的 Deployment ID 與 /exec URL**。
   （是「新增部署作業」，不是去 ✏️ 編輯既有的每日回報部署！）
6. 把第 5 步的 /exec URL 填進：
   a. 指令碼屬性 `REPORT_UPLOAD_DEPLOYMENT_URL`（啟用後端路由隔離）；
   b. `report-upload.html` 的 `UPLOAD_GAS_URL` 常數（取代 CHANGE_ME），commit → Pages 部署。
7. 驗證隔離：瀏覽器開 `新URL?action=ping` 應回 `{"status":"ok","app":"report-upload"}`；
   開 `新URL?action=read&date=...&seg=16` 應回 `route-not-available-on-upload-deployment`；
   舊每日回報 URL 的 read/write 行為不變（仍是第 15 版）。
8. 函式選單執行一次 `reportVersionStatus()` 確認版本狀態可讀寫。
9. 開 `report-upload.html` 登入，**先只按「① 檔案檢查與預覽」**用真實日報驗證預覽數字，
   正確後才按「② 確認發布」→ 重新登入 kpi.html 應立即看到新資料。

**回滾**：出問題就把 `REPORT_UPLOAD_DEPLOYMENT_URL` 清空＋封存新 Deployment 即可，
每日回報部署從頭到尾沒被動過。

## 12. Apps Script Properties 設定

| 屬性 | 必要性 | 值 |
|---|---|---|
| `REPORT_UPLOAD_ALLOWED_EMPLOYEES` | **本次新增，必設** | 逗號分隔員編白名單。不設則只有 `DASHBOARD_TRUSTED_EMPLOYEE_ID` 能用 |
| `REPORT_UPLOAD_DEPLOYMENT_URL` | **本次新增，必設** | 新上傳 Deployment 的 /exec URL；設定後該部署只服務上傳路由。未設定＝隔離未啟用 |
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
