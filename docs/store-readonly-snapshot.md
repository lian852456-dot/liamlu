# 門市HTML快照

主管唯讀看板的「一鍵匯出門市HTML」下載單一、自含的HTML檔，可由使用者作為郵件附件轉交。這個動作不寄信、不發佈檔案、不呼叫新的API，也不變更原業務登入與Liam情報站權限。

## 分享範圍

- 全區與北一二B九店的KPI、締結率、來客數及同期MoM比較。
- 僅匯出目前已核驗的資料；個人姓名、職級、個績、個人／區店獎金、金牌餘額、主管專屬指標、登入資料與原始bundle均不包含。
- KPI採 `readonly-store-snapshot.js` 中的24項明確白名單。來源新增未知欄位時不會自動進入快照。
- 產出前重新投影欄位；即使傳入物件混有其他私有資料，也不整包序列化。
- 實績、目標、達成率與公司排名採原來源；缺值顯示 `—`，不補零。未取得締結率來源時明確標示未包含該表。

檔案內的九店都可離線篩選。「唯讀」表示沒有營運資料編輯、上傳或回寫功能；下載的檔案可被複製、轉傳或由持有人修改，不能視為可撤銷的權限連結。

## 日期與離線行為

每表列出統計起訖、資料截止，另列匯出時間（台灣時間）。KPI與締結率來源截止可以不同，不以匯出日代替截止。來源期間與截止衝突時停止匯出。

同期比較只在原來源完整期間及同一店點範圍可用；部分日期不套用整段上月總量。上月若只有期間總量，只有兩個已觀測區間的MoM比較，不畫上月逐日線。零分母與零基期不產生虛假的百分比變化。

HTML內含資料、現有CSS、轉換核心與純離線呈現程式，沒有外部腳本、字型、API或圖片依賴；CSP另禁止連線與表單提交。一般瀏覽器可切換區店與日期。有些郵件預覽不執行JavaScript，仍可看到預先呈現的完整期間資料；互動篩選請下載後以瀏覽器開啟。

快照不自動更新，後續資料需重新匯出。原看板在未登入、載入中、背景、登出或原登入到期時不允許匯出；不延長原會話，也不把憑證放進下載檔。

## 維護與驗證

`readonly-store-export-assets.js` 只含原有公開CSS與 `readonly-dashboard-core.js`。變更這兩個來源後執行：

```sh
npm run build:store-readonly-export
```

單元測試涵蓋欄位排除、來源完整性、缺值、日期與HTML逃逸。瀏覽器測試涵蓋原登入下的一鍵下載、到期停用、離線篩選、手機／桌面排版、無外連、無JavaScript預覽及原主管版回歸：

```sh
node --test tests/readonly-store-snapshot.test.cjs tests/readonly-dashboard-core.test.cjs tests/readonly-dashboard-adapter.test.cjs
TEST_BASE_URL=http://127.0.0.1:8000/ npm test -- tests/readonly-store-snapshot.spec.js tests/readonly-dashboard.spec.js
```

真實資料HTML與截圖只保留於私有交付位置，不加入repo、PR或GitHub Pages。此變更不包含GAS、名冊、資料發布、郵件流程或權限設定。
