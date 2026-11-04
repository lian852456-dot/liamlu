# A 款貓狗獨立 3D 候選

公開預覽：https://february-missouri-palm-dis.trycloudflare.com/

2026-11-04：A 款貓 60 金幣、狗 75 金幣，各有四種毛色，同款各色同價。貓：橘白／虎斑／黑白／灰白；狗：奶油／棕白／黑白／深棕。由既有幾何、材質與頂點色切換，不新增每色模型。

可拖曳旋轉、四視角、走／跑／坐、領巾、既有跟隨路線。這是可操作的真實 3D，並非概念圖片。模型 `pet-art-a.3` 的胸頸接面、毛束仍偏程式化，尚未達 A 參考圖的 CG 細緻度。

## 邊界

- 公開 server 只有靜態預覽及唯讀 `/api/products`。`/api/purchase` 一律 403，不載入 store、不讀任何城市資料庫。
- 新款採獨立商品 ID `pet-cat-a-v1`／`pet-dog-a-v1`。舊貓 40／狗 55 的商品與所有權不變；不自動補扣、不發金幣。舊款升級與買後改色條款未定，沒有自設收費流程。
- `candidate-store.mjs` 僅供隔離測試，強制 DB 位於本資料夾 `.private-qa/`；未註冊到共用城市 API。購買允許清單、價格、同款唯一所有權、毛色 metadata 和扣款在同一交易；請求重送保持冪等。無法用購買替已擁有寵物改色。
- 公開預覽選色不建立所有權；不會因點選而購買。候選保存的 `variant` 可由另一個 server store instance 讀回，尚未接入共用城市 WebSocket 訊息及多人實機驗收。
- 實體 iPhone Safari、長時間記憶體及正式購買 UAT 尚未完成。原共用城市、角色和錢包皆未修改。

## 有界驗證

- `evidence/functional.json`：手機尺寸桌面 Chromium 的拖曳、走跑、坐下、領巾、跟隨、卸載檢查；幾何冷態88／暖態92／跟隨184／離開93（多一個路線標記）。不是實體手機測試。
- `evidence/color-browser.json`：公開網址 8 色按鈕、價格60/75、無橫向溢出；切色幾何88、貼圖1保持不變，pageerror 0，購買禁用。
- `evidence/color-public-readback.json`：7 個公開資產 SHA 一致，私有路徑404。
- `evidence/purchase-variants.tap`：隔離購買／保存／同款禁止重買／不足餘額／無效毛色／偽造價格／請求衝突／重開與第二讀取端投影。
- `runtime/store-base` 為現行 store 的未修改依賴快照，SHA見 `evidence/store-base-provenance.json`。僅用合成 QA 帳號，測後刪除 DB。

Node24：`node server.mjs` → http://127.0.0.1:4806 。測試：`mkdir -p .private-qa && node --test tests/purchase-variants.test.mjs`。
公開 tunnel 啟動器只適用本機既有受控 cloudflared 設定，需現有 stable 私有 config；不含任何憑證或資料庫。Git 版本保留程式與去識別證據，排除私有 runtime。
