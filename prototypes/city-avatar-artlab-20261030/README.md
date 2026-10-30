# 短髮重製第二版：保留原造型的三版比較

依使用者確認，以程式化 `head-integrated.1` 短髮為造型基準重製 Blender 第二版；保留原版與 Blender 第一版。七束主瀏海的起點、走向與長短節奏沿用原版，再縮薄截面、增加細分束；側後髮使用連續髮流與細緻表面，搭配原長度的臉側內外層及少量自然髮尾，避免第一版的粗厚花瓣與光滑髮殼。

[可旋轉三版預覽](https://ken-mae-base-always.trycloudflare.com/) 支援「程式化原版／Blender 第一版／Blender 第二版」、正面／45 度／側面／背面及獨立城市。完整比較與驗證見 [本輪報告](evidence/blender-hair-v2/REPORT.md)。美術效果留待使用者確認，不把整合成功當作已超越原版。

第二版資產與可編輯來源位於 `assets/hair-glb-v2/`，可用現有 Blender 4.5.15 LTS 執行 `tools/blender-hair/build_hair_v2.py` 重現。未安裝新工具／技能。第一版 GLB、Blender 源檔與建模腳本未改；其 factory/helper 只另存並更換命名空間，保持實際畫面可比。

原版眼睛、臉型、五官、皮膚、2.5 頭身、身體／肩頸與動畫保留。僅獨立示範角色使用此版本，沒有修改正式城市、原角色、登入、金幣或多人資料契約。`base/world.js` 只有獨立 artLabFocusCharacter 的背面視角分支新增。

本機入口 `http://127.0.0.1:4714/`；臨時 HTTPS 仍於台北 **2026-10-31 23:59** 關閉。實體 iPhone Safari 驗收依使用者安排延後。

`npm test` 執行精確基準保留與 GLB 生命週期檢查；`node hair-v2-clearance.cjs` 對實際 GLB 與凍結頭部作背面射線檢查；`node hair-v2-integration-browser.cjs`、`node hair-v2-memory-browser.cjs`、`node hair-v2-performance.cjs` 分別驗證玩法、三版資源切換與分開暖機的 Mac WebKit 對照。桌面測試不代替手機或全城 GPU 驗收。

---

以下保留第一版與更早的歷史說明；本輪入口、版本與證據以上段及本輪報告為準。

# Blender＋GLB 單一短髮示範

以使用者確認的 `head-integrated.1` 為基準，只重製短髮（bob）。原眼睛、臉型、皮膚、2.5 頭身、身體與肩頸、動畫均保留。其他髮型、普通同伴與 NPC 沿用原系統。

[可旋轉 3D 比較](https://ciao-wrap-joel-sydney.trycloudflare.com/) 可切換「目前程式化髮型／Blender 精緻髮型」，也可進入獨立城市。比較、成本及驗證見 [本輪報告](evidence/blender-hair-v1/REPORT.md)。預覽仍於台北 **2026-10-31 23:59** 關閉，實體 iPhone 依使用者安排延後驗證。

Blender 4.5.15 LTS 實際建立可編輯控制網格、細分曲面、UV 與貼圖，匯出 `assets/hair-glb/short-bob-v1.glb`。這是以 Blender Python 定義造型並使用 Blender 建模／匯出工具的示範，不宣稱美術師手工雕刻。保留 `.blend`、建模腳本與校驗收據；沒有新增技能或付費工具。GLB 單一 primitive、單一不透明材質；不通過既有會丟棄 tangent 的模型合併流程。

`avatar-deluxe-integrated.js` 是確認版的精確凍結；`hair-glb.js` 只管理共用模型／貼圖與各角色的髮色材質。`avatar-deluxe.js` 只在選擇 bob 時掛上 GLB。載入失敗保留原程式化短髮，不更動 profile 或多人協定。示範採全新獨立存檔，正式城市及原角色資料未開啟或修改。

本機入口 `http://127.0.0.1:4694/`。`npm test` 驗證固定基準與資源生命週期，`node hair-integration-browser.cjs` 驗證玩法，`node hair-memory-browser.cjs` 測試實際 GLB 的 40 輪切換，`node hair-performance.cjs` 分開暖機比較 Mac WebKit。這些桌面引擎與繪圖資源計數不等於實體 iPhone 或 Safari 程序記憶體驗收。

---

以下保留前版歷史紀錄，入口、版本與驗證以上段及本輪報告為準。

# 頭部整合比較版：原版眼睛＋精緻髮型與皮膚

依本輪確認方向，眼睛完整還原定版原始眼白、虹膜、瞳孔、高光比例與材質；保留前版精緻皮膚與立體髮型。側髮控制點／髮尾小幅整理，頭髮反光更柔和。2.5 頭身、臉型、五官位置、身體與肩頸保持定版。

[可旋轉比較預覽](https://wings-screening-agenda-ghz.trycloudflare.com/) 可切換「前版精緻頭部／整合比較版」。正面、45 度、城市日夜與驗證見 [本輪報告](evidence/head-integrated-v1/REPORT.md)。只供獨立美術確認，正式城市與原角色資料未修改。

新 helper `CozyHeadArtIntegrated` 與凍結前版 `CozyHeadArt` 共用六張 skin/hair maps；前版虹膜圖只供舊版比較，整合眼睛沒有使用。兩個版本的材質和髮型 builder 獨立，切換可真實比較前後差異。

本機入口 `http://127.0.0.1:4684/`。免費預覽依原期限於台北 2026-10-31 23:59 關閉。實體 iPhone 仍依使用者安排延後驗證。

---

以下保留前版歷史說明，本輪標籤、入口與證據以上段為準。

# 高精緻頭部美術示範 v1

以定版 2.5 頭身、臉型、五官位置、肩頸與身體比例為基準，只升級頭髮、虹膜、膚色與材質。連續 UV 髮面搭配少量封閉髮束；共享 7 張最大 512² 的色彩／法線／粗糙度貼圖，區分柔和皮膚、髮絲與眼睛亮膜。

[可旋轉 3D 預覽](https://bookmark-gear-screw-litigation.trycloudflare.com/) 可切換定版原頭部／精緻頭部，拖曳旋轉 360°，並進入獨立城市近看。工作室與城市日／昏／夜的實際比較、技術評估、效能及參考圖差距見 [完整報告](evidence/head-art-v1/REPORT.md)。

本輪是待美術確認的獨立候選，不修改正式城市、不覆蓋角色資料。使用者已將實體 iPhone 驗證延後；Mac WebKit 的手機尺寸測試不代表真機驗收。免費預覽仍依原期限於台北 2026-10-31 23:59 關閉。

本機入口 `http://127.0.0.1:4674/`。`npm test` 檢查保留範圍、材質／UV、共享貼圖及換裝資源生命週期；`node head-performance.cjs` 量測分開全新 context、暖機後的 Mac WebKit 對照。7 張 PNG 來源圖可由 `node export-head-atlas.cjs` 重現於 `assets/head-art/`；執行階段只建立一次同樣像素的共享 DataTexture。

---

以下保留先前版本歷史說明，本輪版本、入口與證據以上段為準。

# 第四版衣領最後微調示範

以已認可的肩頸修正版為基準，僅降低衣領、薄化領緣與後頸，並柔化衣領向肩膀的曲線。脖子本體、頭部位置／尺寸、臉型、髮型、2.5 頭身、身高、腿長及其他造型全部保留。

「目前肩頸版／衣領微調版」分別對應凍結的 `avatar-deluxe-neck-v1.js` 與 `avatar-deluxe.js`。45 度與側面比較、轉頭檢查及本輪驗證見 [衣領微調報告](evidence/neck-v2/REPORT.md)。獨立示範待本人確認，未切換原肩頸版或正式城市入口。

本機入口 `http://127.0.0.1:4664/`；免費臨時入口依原期限於台北 2026-10-31 23:59 關閉。

---

以下是前版歷史說明，本輪入口與版本標籤以上段為準。

# 第四版肩頸局部修正版

只修改頸部底座與衣領，將較短的外露頸部藏入有厚度的包覆式領口。第四版的臉型、眼睛、髮型、頭部位置／尺寸、2.5 頭身、整體身高、腿長、上衣其他部位、手臂及褲鞋均保留。

預覽的「第四版／肩頸修正版」分別使用凍結的 `avatar-deluxe-v4.js` 與 `avatar-deluxe.js`。完整三視角與近看比較、轉頭檢查及功能證據見 [肩頸修正報告](evidence/neck-v1/REPORT.md)。只供獨立確認，未切換正式城市或原第四版入口。

目前本機入口 `http://127.0.0.1:4654/`，免費臨時入口仍於台北 2026-10-31 23:59 自動關閉。`npm test` 檢查保留範圍及肩頸幾何間距。

---

以下保留先前版本歷史說明；本輪版本標籤、入口與證據以上段為準。

# 北一二B 小城：第四版衣著輪廓示範

以已認可的第三版 2.5 頭身為基準，固定臉部、髮型、頭部尺寸、整體身高、腿長與樞紐，只調整寬鬆褲管、袖口到手掌、上衣厚度／曲線下擺及圓潤鞋頭。

畫面的「第三版／第四版」對應凍結的 `avatar-deluxe-v3.js` 與新版 `avatar-deluxe.js`。本輪比較、試玩與驗證以 [第四版報告](evidence/body-v4/REPORT.md) 為準。正式城市與原第三版預覽未切換；美術基準沿用第三版，第四版待本人確認。

目前本機入口為 `http://127.0.0.1:4644/`。下方保留先前版本歷史說明，連接埠與版本標籤以本段為準。

---

# 北一二B 小城：第三版 2.5 頭身示範

本輪優先測試第三版2.5頭身：頭部幾何與尺寸保留，腿部縮短約20%，軀幹略為展寬加厚、四肢配合比例調整。

畫面的「第二版／第三版」對應凍結的 `avatar-deluxe-v2.js` 與新版 `avatar-deluxe.js`。量測以不含髮尖的頭頂至下巴為一單位，第二版約2.724頭身，第三版2.500頭身；不是把整個人物等比縮小。

本輪比較與驗證以 [第三版報告](evidence/body-v3/REPORT.md) 為準；以下保留第二版歷史說明。正式城市、第一版及第二版公開預覽均不切換。

---

本輪保留已認可的第一版臉型、五官、髮型與動畫；只重做斜肩、軀幹、衣袖手掌、褲管與鞋楦。畫面的「第一版／第二版」對應 `avatar-deluxe-v1.js`／`avatar-deluxe.js`，不是最早的積木角色。

第一版檔案保留原始 SHA；新舊共用原 profile、燈光、相機及動作介面。對照圖片與驗證請見 [第二版報告](evidence/body-v2/REPORT.md)。原第一版公開預覽與正式城市均未切換。

---

以下為第一版技術基線與共用操作說明；歷史驗證數字保存在原 evidence/REPORT.md。第二版以 evidence/body-v2/ 為準。

這是待美術確認的獨立 Art Lab。未覆蓋原城市、原角色、原存檔或正式員工登入，未合併至正式網站。全面套用須另經使用者確認。

## 試看內容

- 新舊原生 3D 模型切換；正面、側面、45 度；拖曳旋轉。
- 眨眼、微笑、呼吸、行走、揮手、坐下與原有擊掌動作。
- 現有髮型／服裝 ID；獨立城市的原手帳換裝、多人同步與家具互動。
- 新版只套到帶有 `artLabDemo:true` 的本機示範角色；街坊、其他玩家與載具騎士保留原 factory。
- 相機近看是 Art Lab 專用功能，可用遊戲「回正」回到原視野；不影響移動、碰撞或位置保存。

## 本機使用

使用 Node.js 24 或更新版本：`node server.mjs`，開啟 `http://127.0.0.1:4634/`。伺服器預設只聽 loopback。

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
