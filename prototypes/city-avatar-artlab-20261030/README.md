# 北一二B 小城：單一角色美術預覽

這是待美術確認的獨立 Art Lab。未覆蓋原城市、原角色、原存檔或正式員工登入，未合併至正式網站。全面套用須另經使用者確認。

## 試看內容

- 新舊原生 3D 模型切換；正面、側面、45 度；拖曳旋轉。
- 眨眼、微笑、呼吸、行走、揮手、坐下與原有擊掌動作。
- 現有髮型／服裝 ID；獨立城市的原手帳換裝、多人同步與家具互動。
- 新版只套到帶有 `artLabDemo:true` 的本機示範角色；街坊、其他玩家與載具騎士保留原 factory。
- 相機近看是 Art Lab 專用功能，可用遊戲「回正」回到原視野；不影響移動、碰撞或位置保存。

## 本機使用

使用 Node.js 24 或更新版本：`node server.mjs`，開啟 `http://127.0.0.1:4614/`。伺服器預設只聽 loopback。

初次進入「城市試玩」會透過原訪客 API 建立一名「美術試玩」角色，資料僅保存於此專案 `base/.private-v42-artlab/`。續訪保留這個測試角色；不讀取或搬移原遊戲的卡片、cookie 或資料庫。原有續玩介面仍保留。

免費 HTTPS 預覽由 `start-preview.mjs` 選擇性啟動，使用另一本地資料夾及固定期限，台北 **2026-10-31 23:59** 自動關閉。沒有永久主機、付費方案或期限延長。

## 模型與擴充

`avatar-deluxe.js` 提供與舊人物相同的 `group/head/arms/legs`、`setAppearance/setColor/setHairStyle/animate/dispose` 介面。頭部、表情、髮型、軀幹、四肢各自保留樞紐；只合併不會單獨動的細節。更換髮型只重建髮型群組，更換服裝只重建衣物與肢體衣料，不重製整個角色。

`avatar-candidate.js` 將選定的一名本機角色接到新模型。切換版本只改渲染物件，不增加 profile 欄位、不送新同步封包、不寫入錢包／庫存／金幣。預設仍保留其他角色的原 factory。新增造型可擴充髮型 builder 與服裝配方，維持原 ID／資料契約。

基準為 `20261030-employee.3` 的公開資產。`base/world.js` 僅新增本機 opt-in 標記及 Art Lab 專用近看鏡頭方法；原 `models.js` 保留。`baseline-manifest.json` 記錄來源與目前封裝 hash。原隔離遊戲 server 與 ws/Three.js 授權來源一併保留，以便重現。

## 驗證與限制

`npm test` 執行真實 Three.js 的模型／資源所有權測試。瀏覽器驗證可用 `npm run test:integration` 與 `npm run test:preview`；先安裝開發依賴及相容 Playwright 瀏覽器。已有本機 runtime 時可設定 `PLAYWRIGHT_MODULE` 與 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`，不必變更使用者的既有工具。

實際結果見 [驗收與效能報告](evidence/REPORT.md)。Mac 上的 WebKit／Chromium、手機尺寸與受控模型 buffer 統計，不代表 iPhone 的 Safari GPU／記憶體驗收。全城既有效能負擔、實體 iPhone 長走、背景返回與本人美術確認仍待完成。

本輪不處理正式金牌、額外獎勵、員工核身、全角色替換或正式遊戲入口切換。李舒緩既有 +200 不再發放。
