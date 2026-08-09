# Liam 情報站 App 1.0｜安全盤點與空殼建置

## 2026-08-09｜Liam Supervisor Pilot 1.0 上線範圍（取代空殼階段）

- 今日核心固定為 KPI、台獎、16:00／21:00 回報、班表、巡店；金牌、店務檢查、Viewer B、多人登入、推播、Face ID 與所有 App 內寫入均移至 Pilot 後 backlog。
- KPI／台獎／回報不複製資料或登入，直接沿用 `index.html` 正式頁與 approved-device 邊界。
- 班表／巡店前端 adapter 只重用既有 `ptauth` 30 分鐘短效 token，action allowlist 固定為 `sread`、`ptread`；通行碼不保存，回傳資料只留在記憶體且不進 Service Worker cache。
- 班表顯示今日日期、九店人員／班別、出勤／休假、店點篩選、前一天／今天／後一天與完整班表入口。
- 巡店顯示九店狀態、最近巡店日、本月到店、上下半月／月檢／雙月摘要、最近紀錄與既有看板／操作入口；adapter 失敗時明確 fallback，不阻擋原系統使用。
- 本機證據：Node 契約 3/3、390×844 Playwright 3/3；本機 HTTP／Service Worker 讀取成功、console error 0、npm audit 0。
- 尚未上調：正式部署、Liam approved-device 真資料頁讀回、班表／巡店各 3 店勾稽、iPhone Safari 與加入主畫面仍需後續 Gate 證據。

> 下方 2026-08-06 內容保留作為空殼階段歷史；其中「不可直接重用 session」與第二階段 BFF 建議不再代表本次 Pilot 決策。2026-08-09 的做法是同源前端重用既有 `ptauth` 契約，不新增後端或登入架構。

- 日期：2026-08-06
- 基準：`origin/main` `31857ca`（開工前 tag：`liam-intel-app-baseline-2026-08-06`）
- 範圍：只新增 PWA App 入口與 UI；未修改 GAS、Google Sheet、D1、R2、API、JSON 格式、資料來源、既有頁面或正式部署。

## 現有功能盤點

| 功能 | 現有入口／檔案 | 資料讀取／寫入 | 登入與權限 | 手機現況與 App 1.0 接法 |
|---|---|---|---|---|
| KPI | `kpi.html`；`index.html` KPI 戰情 | GAS `kpicalc_access` 讀私有 Drive 遮罩快照；督導 `kpicalc_publish` | 員編＋裝置綁定；管理者密碼僅既有後端 | 可先深連結；後續應新增只讀摘要 adapter，不讓 App 直接讀私有檔 |
| 台獎 | `index.html` 台獎戰情；`report-automation` 產物 | 同一私有快照；來源為 Y26 報表／自動化產物 | 同 KPI 私有戰情 | 可先深連結；13 款資料須沿用 active config，需受權限摘要 API |
| 金牌 | `index.html` 既有日報呈現 | 每日回報／既有前端彙整 | 依每日回報及戰情權限 | 可先從原頁導入；欄位定義待確認後才作摘要 API |
| 個人業績 | `index.html` 個人追蹤、`kpi.html` | `pread`／`pwrite`、私有 KPI 快照與本機備援 | 部分依既有登入／裝置綁定 | 不直接嵌入；先深連結，後續由受保護 API 回傳遮罩摘要 |
| 16:00／21:00 回報 | `index.html`；`gas/Code.gs` `read`／`write` | GAS + Google Sheet「回報資料」；JSONP/POST，localStorage 影子備援 | 現有系統設定與資料流 | 不重做表單；App 先導到既有頁，第二階段才考慮 Web Component / 安全轉接 |
| 班表 | `patrol.html`；`sread` | 受保護 GAS 讀私有 Google Sheet「班表明細」；無 App 寫入 | `ptauth` 短效 token | 可深連結；若 App 顯示今日班表，需新增 token-aware 只讀摘要端點 |
| 巡店看板 | `patrol.html`；`ptread`／`ptwrite` | GAS + Google Sheet「巡店明細」；JSONP 分批寫入 | `ptauth`，sessionStorage 短效 token | 可深連結；不可 iframe / 直接重用 session，需授權後 API adapter |
| 店務檢查 | 獨立 Sites：`store-ops-inspection-prototype/src/App.jsx` | D1 記錄、R2 媒體；瀏覽器只存草稿 | 督導碼保護跨店紀錄 | 外部連結可直接沿用；要整合摘要需跨站、只讀的受權限 API |
| 公告 | `home.html` 僅導覽；視覺 prototype 有展示 | 沒有已確認單一正式來源 | 無統一權限模型 | 先留 UI；需產品決策與公告來源後才新增 read API |
| 督導功能 | `index.html` 彙整／戰情、`patrol.html` 巡店／班表／半月檢查 | 多個既有 GAS action；巡店與每日回報共用 `Code.gs` | 私有戰情綁定＋巡店 `ptauth` 是不同邊界 | 不合併登入；App 先顯示督導入口，後續需建立 server-side federation / summary adapter |
| 自動化狀態 | `gas/Code.gs` `check16`／`check21`／`sendWeeklyPatrolReport`／`kpiCalcAutoUpdate`，以及 b-2 日報自動化 | Apps Script triggers、OneDrive 日報、Outlook、私有 Drive | 管理者／本機鑰匙圈；不得公開 | 先留狀態卡；須新增不含憑證與個資的管理者只讀 health API |

## 建議技術架構

```
PWA App Shell (app.html + manifest + service worker)
        │
        ├─ 第一階段：安全深連結至既有頁面／獨立店務檢查站
        │
        └─ 第二階段：authenticated read-only BFF / adapter
              ├─ 每日回報摘要（GAS / Google Sheet）
              ├─ KPI、台獎遮罩快照（私有 Drive）
              ├─ 巡店／班表摘要（PT token 邊界）
              ├─ 店務檢查摘要（D1 / R2 邊界）
              └─ 自動化健康狀態（不含密碼、token、名冊）
```

### 可直接沿用

- 原有網址與登入：`index.html`、`kpi.html`、`kpitry.html`、`patrol.html`、店務檢查正式站。
- 現有私有戰情裝置綁定、巡店短效 token、Google Sheet／Drive／D1／R2 資料邊界。
- 現有 16:00／21:00 通知、KPI 自動化、巡店週報與班表讀取。

### 需要新增轉接層的項目

- 首頁「未回報、KPI／台獎、班表、異常、公告」應由最小資料集的只讀摘要 API 提供。
- 督導的多系統統合不能共享或複製原有密碼／session；需要一個明確驗證後才聚合遮罩摘要的 BFF。
- 自動化狀態需專用 health contract，絕不向 App 傳送排程憑證、收件者、來源檔或私人資料。

## 風險與防護

| 風險 | 防護 |
|---|---|
| 共用 `gas/Code.gs` 被整檔覆蓋 | 第一階段完全不修改它；後續 adapter 獨立、最小差異且完整回歸 |
| 把私有資料帶到 GitHub Pages | App 不讀 `private-data/`，不含名冊、員編、密碼、token 或正式 JSON |
| 跨系統登入被錯誤共用 | 保持既有登入；未完成正式權限設計前只做深連結 |
| 靜態 UI 被誤當正式資料 | 所有摘要標示為預留／待接線；不提供任何寫入按鈕 |
| PWA 快取舊資料 | Service Worker 僅快取 App 空殼；不快取既有資料、API 或私有頁 |

## App 頁面架構

```
首頁
├─ 今日待辦／未回報／KPI 台獎摘要／公告／班表／異常
戰情
├─ KPI／台獎／金牌／個人業績 → 原系統入口
回報
├─ 16:00／21:00／個人業績 → 原系統入口
巡店
├─ 巡店看板／班表／督導檢查／店務檢查 → 各自原系統入口
我的
└─ 帳號安全說明／督導 UI 預覽／自動化狀態預留
   └─ 督導驗證後：Liam AI 指揮室（第二階段接入）
```

## 本階段檔案

- 新增：`app.html`、`app.css`、`app.js`、`manifest.webmanifest`、`service-worker.js`、`offline.html`。
- 新增：`app-assets/liam-intel-icon.svg`、PNG icon。
- 新增：`tests/liam-intel-app-shell.test.cjs`、本文件。
- 未修改：`index.html`、`home.html`、`kpi.html`、`kpitry.html`、`patrol.html`、`gas/Code.gs`、Google Sheet、私有 Drive、D1、R2、任何既有網址。

## 驗收方式

1. 靜態契約測試：五個底部頁籤、督導指揮室預留、manifest standalone、safe area、離線 fallback，且 App JS 不含網路寫入。
2. 手機尺寸（375px）檢查：無橫向捲動、底部導覽與所有主要按鈕至少 44px、iPhone safe area 正常。
3. Chrome Android：安裝提示或「加入主畫面」後以 standalone 開啟。
4. Safari iPhone：分享 → 加入主畫面，確認名稱、icon、全螢幕與離線提示。
5. 回歸：既有原系統頁面及網址仍可直接開啟；此階段不測試寫入，也不以靜態 UI 宣稱資料串接完成。

## 下一階段建議順序

1. 先定義只讀摘要 contract 與欄位資料分級。
2. 接「未回報＋今日回報狀態」摘要，維持原回報寫入不變。
3. 接 KPI／台獎的遮罩只讀摘要。
4. 接巡店／班表／店務檢查的督導專用摘要與統一授權設計。
5. 最後接公告與自動化 health，並以實機門市／督導驗收決定是否將 App 設為主要入口。
