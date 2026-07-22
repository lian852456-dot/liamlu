# 手動部署指南 — savedAt 日期修正（無 clasp 版）

給**沒有 clasp、只用 Apps Script 網頁編輯器**的人,手動把「savedAt 顯示 1899-12-30」修正部署到正式 GAS。

> ⚠️ 本文不含任何帳號、Script ID 或憑證。你需要的只是「對該 Apps Script 專案有編輯權限的 Google 帳號」,自行登入編輯器即可。

---

## 0. 這次只改一個函式

**只需修改 `savedAt` 的讀取邏輯,其餘完全不動。**

> 🚫 **絕對不要用本 repo 的 `Code.gs` 整份覆蓋線上版本。** 線上的 Apps Script 可能含有其他人已部署、但尚未進到本 repo 的變更(觸發器、巡店、KPI 自動更新等)。整份貼上會默默洗掉那些變更(專案已多次踩過「整檔覆蓋洗掉別人改動」的坑)。**請只在編輯器裡定位到 `readData()` 這一個函式,替換它的內容。**

---

## 1. 要修改的檔案與函式

- **檔案**:Apps Script 專案裡的 `Code.gs`
- **函式**:`function readData(date, seg)`
- 用編輯器的搜尋(`Ctrl/Cmd + F`)輸入 `function readData` 直接跳到該函式。

---

## 2. 原始程式碼片段（修改前 / 線上目前可能長這樣）

```js
function readData(date, seg) {
  const sh = getSheet();
  const allData = sh.getDataRange().getValues();
  const headers = allData[0];
  const dateIdx  = headers.indexOf('date');
  const storeIdx = headers.indexOf('store');
  const segIdx   = headers.indexOf('seg');

  const result = {};
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    if (toDateStr(r[dateIdx]) === date && Number(r[segIdx]) === Number(seg)) {
      const store = r[storeIdx];
      const obj = {};
      headers.forEach((h, idx) => {
        const v = r[idx];
        obj[h] = (v instanceof Date) ? toDateStr(v) : v;
      });
      result[store] = obj;
    }
  }
  return result;
}
```

> 若線上的 `readData()` 與上面**不完全一樣**(例如別人也動過),請**不要硬套**。只需在「組裝 `obj` 的 `headers.forEach` 迴圈」裡,加入「savedAt 欄改用顯示值」的那段(見第 4 節差異說明),其餘保留線上原樣。

---

## 3. 修改後程式碼片段（貼上這個取代 `readData()`）

```js
function readData(date, seg) {
  const sh = getSheet();
  const range = sh.getDataRange();
  const allData = range.getValues();
  // savedAt 在試算表是「純時間」值，getValues() 會回傳 1899-12-30 基準的 Date 物件，
  // 若走 toDateStr() 會被格式化成「1899-12-30」。改用該欄的原始顯示字串（如 16:00:00）。
  const displayData = range.getDisplayValues();
  const headers = allData[0];
  const dateIdx    = headers.indexOf('date');
  const storeIdx   = headers.indexOf('store');
  const segIdx     = headers.indexOf('seg');
  const savedAtIdx = headers.indexOf('savedAt');

  const result = {};
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    if (toDateStr(r[dateIdx]) === date && Number(r[segIdx]) === Number(seg)) {
      const store = r[storeIdx];
      const obj = {};
      headers.forEach((h, idx) => {
        if (idx === savedAtIdx) {
          obj[h] = displayData[i][idx];
          return;
        }
        const v = r[idx];
        obj[h] = (v instanceof Date) ? toDateStr(v) : v;
      });
      result[store] = obj;
    }
  }
  return result;
}
```

---

## 4. 修改前後差異說明

修改只有三處,語意集中在「savedAt 欄改用顯示字串」:

| # | 變更 | 說明 |
|---|---|---|
| 1 | `const range = sh.getDataRange();` 取代原本直接 `.getValues()`;新增 `const displayData = range.getDisplayValues();` | 額外拿一份「顯示字串」版本的資料。`getDisplayValues()` 回傳的是儲存格**畫面上顯示的文字**(如 `16:00:00`),不是 Date 物件。 |
| 2 | 新增 `const savedAtIdx = headers.indexOf('savedAt');` | 找出 savedAt 欄的位置。 |
| 3 | `headers.forEach` 迴圈最前面加入:`if (idx === savedAtIdx) { obj[h] = displayData[i][idx]; return; }` | **只有 savedAt 欄**改用顯示字串;其他欄維持原本 `(v instanceof Date) ? toDateStr(v) : v`。 |

**為什麼能修好:** savedAt 是純時間,`getValues()` 會給 1899-12-30 基準的 Date;原程式對任何 Date 都套 `toDateStr()`(`yyyy-MM-dd`)→ 變成 `1899-12-30`。改成直接取 `getDisplayValues()` 的顯示文字,就能拿回原本的時間(如 `16:00:00`)。**寫入邏輯、其他欄位、Sheet 結構都不變。**

---

## 5. 存檔 → 建立新版本 → 部署

> ⚠️ **存檔 ≠ 部署。** 只按 Ctrl+S,線上跑的還是舊版。必須建立「新版本」部署才會生效。

1. 在 Apps Script 編輯器完成第 3 節的替換。
2. `Ctrl/Cmd + S` **存檔**。
3. 右上角 **「部署」→「管理部署作業」**。
4. 找到現有的「網頁應用程式」部署,按 **✏️(編輯)**。
5. 「版本」下拉選 **「新版本」**(New version)。
6. (可加版本說明,如 `savedAt display fix`)按 **「部署」**。
7. 完成。**網址不變**,不用改前端。

---

## 6. 正式驗收（URL 與預期結果）

`{GAS_URL}` = 目前正式部署的網頁應用程式網址(已寫在 `index.html` 的 `DEFAULT_GAS_URL`,本文不重複)。

| 步驟 | URL | 預期結果 |
|---|---|---|
| 1. 確認新版生效 | `{GAS_URL}?action=debug` | **不是**回 `unknown action`(回 `unknown action` 代表舊版還在跑,新版本沒部署成功)。 |
| 2. 讀歷史資料 | `{GAS_URL}?action=read&date=2026-07-20&seg=16` | 回傳 **9 筆**門市資料。 |
| 3. 檢查 savedAt | (同上回傳 JSON) | 每筆的 `savedAt` 為**時間字串**(如 `16:00:00`),**不得出現 `1899-12-30`**。 |
| 4. App 回放 | 開正式 App,回放 2026-07-20 16:00 | 9 筆皆可載入;彙整表格數字正確;日期、回放功能正常。 |

**驗收通過條件(全部成立才算修好):**
- [ ] 使用 2026-07-20 16:00 歷史資料
- [ ] 9 筆資料皆可回放
- [ ] savedAt 不顯示 1899-12-30(顯示正確時間)
- [ ] 日期、彙整與回放功能不受影響

---

## 7. 回復舊版（Rollback）

不需改碼,兩種方式擇一:

- **切回舊部署版本(最快):** 「部署」→「管理部署作業」→ ✏️ 編輯 →「版本」下拉選**先前的版本號** → 部署。線上立即回退。
- **還原程式碼再部署:** 把 `readData()` 改回第 2 節的原始片段 → 存檔 → 依第 5 節建立新版本部署。

風險極低:本次只影響 `readData()` 回傳的 `savedAt` 呈現,不改寫入、不動 Sheet 結構、不改欄位。

---

## 附:對照本 repo

本 repo `gas/Code.gs` 已含修正後版本(第 3 節),可作為**片段對照**用;但線上部署請依第 0 節,**只替換 `readData()`,勿整檔覆蓋**。相關驗證見 `VALIDATION_REPORT.md`。
