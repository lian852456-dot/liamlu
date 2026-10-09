# 本次 owner 純碼套件去敏檢查

範圍僅本補包十一檔 allowlist；此處公開的只有程式與重寫文件，不保證原公開 repo 或任何歷史資料。

- 兩個 patch 只包含 native owner 資格／鎖／寫入 fence 與 WORK wrapper 差異。原人員、業務快照、班表、績效明細、部署／Drive／Sheet IDs、Properties 值均未納入。既有 business body 保留在消費者自己的指定公開 base；不交付整個 GAS 檔。
- 三個原模組為既有 owner boundary／GAS state store／native provider 原碼；只有 schema／property 名稱及驗證規則，沒有實際 state、salt、digest、verifier、密碼或 bearer。第四個 adapter 只有直接 factory wiring，沒有 endpoint、RPC 或設定值。
- 測試只使用 SYNTH 前綴員工／裝置／遮罩／資料及明確非資源 owner 標記，在本機 VM 的 fake GAS services 執行。沒有真實名稱、員編、績效或取得測試 session 的值。
- 文件只記公開 repo／base 和純碼 SHA、依賴、批准 gate。原本機 source SHA 是來源查證，不是消費者依賴；私有絕對路徑不進 allowlist。
- 工具逐檔掃描私有資源 IDs、正式 deployment 型態、email、電話、私鑰／Google credential／token 型態、含真值的 secret assignment、私有路徑；任何 credential 欄名本身不是值。掃描只回 finding 類型與檔名，不輸出私密值。

目前 allowlist 未发现須移除的人員、實測 proof 或私有設定值；具體掃描收據留在上層 internal 文件，不供公開。主線已取得新增後端碼去敏後公開交接的直接批准。發布僅由 UI owner 執行；本輪只公開去敏純碼，未 merge 或正式部署；本機驗證不能替代正式驗收。
