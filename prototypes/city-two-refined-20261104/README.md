# 共用城市兩位精緻造型發布 · 20261104-two-refined.1

嘉玲（5511180）採已確認修長身形、短鮑伯、淺色綁帶洋裝、耳環與 B 露齒笑；李舒緩（5514420）採側分長髮、黑色紋理 V 領、自然胸線及駝色高腰短裙。沿現有 server canonical preset 作顯示替換，不改存檔外觀欄位。既有其他角色資產與正式 auth／金牌保持原樣。

這是針對 `20261104-three-onstage.1` 的差異封裝，不是能獨立重建城市的完整專案。六個新模型模組／兩個 GLB 加入獨立 namespace，防止覆蓋原角色。嘉玲新增 stage projection；Li 的 canonical preset 不變。原 owner、game-only 首登與巡走去重邏輯沿用。

發布至原固定入口 https://lian852456-dot.github.io/liamlu/city-play.html ，Mac persistent 後端仍由既有 tunnel 提供。兩世界停寫後分別 SQLite backup、完整 fingerprint 前後一致：current 53、legacy 23；原 +200 receipt 仍 1 筆，沒有工具真人登入、建立真人角色、welcome 重發或資料遷移。Gateway 未重啟，後端正常短暫重啟，90 public asset HTTP／SHA 與版本讀回通過。

狀態：嘉玲 display-unlinked，待本人首登；李舒緩 linked-game-role。沒有代本人登入驗收。兩張城市截圖為相同資產於隔離合成角色的實景，與公開 manifest SHA 一致；不冒稱真人會話截圖。

驗證：2 focused stage tests、兩角色 WebGL 行走／揮手、已選 B／V 領與既有三種服裝顯示／還原／坐姿 API；公開 private paths 404。實體 iPhone Safari UAT 與開機自啟仍未驗證。服裝 theme 接在新版上衣／褲型上，保存選擇與費用契約沒有更動。

回復：私有 cutover receipt 保留原 public/runtime/backend/manifest 與兩份分開備份。必要時只回復程式資產，不將舊 DB 蓋回現有存檔。本 Git 記錄排除 UID、登入卡、憑證、真實 DB、完整名冊與私有授權對話。
