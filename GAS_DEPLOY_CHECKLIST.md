# GAS 正式部署前檢查清單 — savedAt 日期修正

**目的:** 避免用 GitHub 的 `Code.gs` 覆蓋掉正式 Apps Script 裡「GitHub 尚未收錄」的其他更新。本清單搭配 `MANUAL_GAS_DEPLOY.md` 使用——後者教怎麼改,本文負責**改之前先確認、改之後驗收、失敗就停、必要時回退**。

> 🚫 核心原則:**只套用 `readData()` 的最小差異,永遠不要整份覆蓋線上 `Code.gs`。** 線上可能含觸發器、巡店、KPI 自動更新等尚未進 repo 的邏輯,整檔貼上會默默洗掉(本專案已多次踩到「整檔覆蓋洗掉別人改動」的坑)。

---

## 1. 部署前人工確認（逐項打勾,全過才動手）

在 Apps Script 編輯器打開線上 `Code.gs`,對照本 repo 的 `gas/Code.gs`,逐項確認:

- [ ] **A. `readData()` 是否與正式版一致**
  搜尋 `function readData`。比對線上版與 repo 修正**前**的樣子(見 `MANUAL_GAS_DEPLOY.md` §2)。
  - 若**完全一致** → 可直接套用 §3 的修正後版本。
  - 若**不一致**(別人也動過 `readData`)→ **停,不要硬套整個函式**。只在其 `headers.forEach` 迴圈加入「savedAt 改用顯示值」那三處差異(§4 差異表),其餘保留線上原樣。

- [ ] **B. `savedAt` 欄位位置是否一致**
  確認資料靠**欄名**定位,不是寫死的欄號。修正碼用 `headers.indexOf('savedAt')` 動態取位;只要標題列有 `savedAt` 欄名即可,不依賴它排第幾欄。順手確認線上標題列確實有 `savedAt` 欄。

- [ ] **C. Sheet 欄位索引是否一致**
  確認 `readData()` 內 `dateIdx / storeIdx / segIdx / savedAtIdx` 都是用 `headers.indexOf(...)` 取得(非硬編號)。若線上版把任何一個改成寫死索引,先釐清原因再處理,勿直接覆蓋。

- [ ] **D. 正式版是否有 GitHub 沒有的新邏輯**
  掃線上 `Code.gs`,確認沒有 repo 裡看不到的函式/觸發器/區塊(例如新的 `doGet` action、巡店或 KPI 相關)。**只要有一處是 repo 沒有的,就代表不能整檔覆蓋**,只能做 `readData()` 的局部替換。

- [ ] **E. 是否還有其他 `getValues()` / `getDisplayValues()` 修改**
  搜尋 `getValues(` 與 `getDisplayValues(`。確認本次**唯一**要新增的是 `readData()` 內的 `range.getDisplayValues()`;線上其他地方的 `getValues()` 一律**不動**。若線上已有別人加的 `getDisplayValues()`,不要移除或合併,保持現狀。

> 只要 A–E 任一項無法確認一致或安全,**先停,回頭與擁有者/前一位開發者確認,不要部署**。

---

## 2. 部署前備份（一定要做,擇一或都做）

- [ ] **備份 1:複製整份線上 `Code.gs`**
  在編輯器全選 `Code.gs` 內容 → 複製 → 貼到本機純文字檔(如 `Code.gs.bak-YYYYMMDD.txt`),**保存在本機、不要 commit 進 repo**(避免把線上私有變更或憑證外流)。

- [ ] **備份 2:記錄目前部署版本號**
  「部署 → 管理部署作業」,記下目前「網頁應用程式」的**版本號**(如 v19)。Rollback 時可直接切回這個版本。

- [ ] **備份 3(選配):建立版本快照**
  部署前先按一次「部署 → 新增部署作業(或管理→新版本)」讓 Apps Script 存一個目前碼的版本點,確保有可回退的版本節點。

---

## 3. 僅套用最小差異的建議方式

1. **不要**清空線上 `Code.gs` 再貼整份 repo 版本。
2. 用 `Ctrl/Cmd + F` 搜尋 `function readData` 定位。
3. 只把 `readData()` 這**一個函式**替換成 `MANUAL_GAS_DEPLOY.md` §3 的版本(若線上 `readData` 與 repo 修正前一致);或只補入 §4 的三處差異(若線上 `readData` 已被別人改過)。
4. 三處差異即:
   - `const displayData = range.getDisplayValues();`
   - `const savedAtIdx = headers.indexOf('savedAt');`
   - 迴圈內 `if (idx === savedAtIdx) { obj[h] = displayData[i][idx]; return; }`
5. 存檔前用編輯器再看一次 diff 區域,確認**只有 `readData()` 有變**,其他函式一字未動。

---

## 4. 部署後驗收 Checklist

`{GAS_URL}` = 正式網頁應用程式網址(已在 `index.html` 的 `DEFAULT_GAS_URL`)。使用 **2026-07-20 16:00** 歷史資料。

- [ ] **新版已生效**:`{GAS_URL}?action=debug` 不回 `unknown action`
- [ ] **2026-07-20**:`{GAS_URL}?action=read&date=2026-07-20&seg=16` 回傳 **9 筆**資料
- [ ] **9 筆資料皆可回放**:正式 App 回放 2026-07-20 16:00,9 筆全部載入
- [ ] **savedAt 不出現 1899-12-30**:每筆 `savedAt` 為時間字串(如 `16:00:00`)
- [ ] **日期正常**:`date` 欄顯示 `2026-07-20`,無異常
- [ ] **回放正常**:歷史回放載入、切換無誤
- [ ] **彙整正常**:彙整表格數字與過往一致,無因本次改動而錯位

---

## 5. 驗收失敗時的停止條件

出現以下任一情況,**立即停止,不要繼續調整、不要再貼別的碼、不要嘗試「順手多修」**,直接進第 6 節 Rollback:

- `?action=read&date=2026-07-20&seg=16` **不是 9 筆**(變多、變少或空 `{}`)。
- 任一筆 `savedAt` 仍出現 **`1899-12-30`** 或變成空白/亂碼。
- `date` 欄、彙整數字或回放**出現本次部署前沒有的異常**。
- `?action=debug` 一直回 `unknown action`(新版本沒部署成功)——先確認是「版本沒建新版」還是碼有錯,勿反覆亂改。
- 發現線上其他功能(巡店、KPI、通知)在部署後異常——代表可能誤動到 `readData()` 以外的區塊。

> 停止原則:**回到已知良好的舊版**,把問題釐清後再重來,不要在正式環境上邊猜邊改。

---

## 6. Rollback 流程

不需改碼,依情況擇一:

1. **切回舊部署版本(最快、首選)**
   「部署 → 管理部署作業」→ ✏️ 編輯 → 「版本」下拉選第 2 節記下的**舊版本號** → 部署。線上立即回到部署前狀態,網址不變。

2. **還原碼再部署**
   把 `readData()` 貼回第 2 節備份的原始內容(或 `MANUAL_GAS_DEPLOY.md` §2 的修正前片段)→ 存檔 → 建立新版本部署。

3. **驗證回退成功**
   `{GAS_URL}?action=read&date=2026-07-20&seg=16` 回 9 筆,且行為與部署前一致。

> 風險評估:本次僅影響 `readData()` 回傳的 `savedAt` 呈現,不改寫入、不動 Sheet 結構、不改欄位,回退安全且不會遺失資料。

---

## 附註

- 相關文件:改法看 `MANUAL_GAS_DEPLOY.md`;驗證與交接看 `VALIDATION_REPORT.md`;背景看 `docs/COLLAB-LOG.md`。
- 本清單本身不含帳號、Script ID 或憑證;`{GAS_URL}` 為佔位,實際網址在 `index.html`。
- **未依本清單確認前,不得對外宣稱正式站已修復。**
