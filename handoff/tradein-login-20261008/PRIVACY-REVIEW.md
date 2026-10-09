# 本次公開交接的去敏檢查

範圍僅 README 明列的十八個 allowlist 檔案（原七檔加新套件十一檔）與从既有公開 main 建立的這條純交接提交鏈；沒有整個既有公開儲存庫或歷史的個資保證。

逐檔人工核對與工具掃描已完成：

| 檔案 | 核對结果 |
| --- | --- |
| INTEGRATION.patch | 只有 UI/controller/合成測試及 CI 程式；employeeId/password 欄名是接口，沒有真實值或內嵌來源資料。價格 URL 為既有公開入口，沒有私有 Script/Sheet/Drive ID／正式設定值 |
| GasBClient.js | 取自最新 e857c5f 的 client 並匹配來源 manifest SHA；URL 為 caller 參數，無硬編碼 credential/真實 proof，無持久或 log bearer |
| owner-read-boundary.example.patch | 歷史示例，已明列不可單獨採用；沒有名冊、真實 payload 或完整 editor／設定 |
| LOGIN-INTERFACE.md | 人工重寫去敏契約；不複製含真實識別的原交接文件，不記具名身份／私有資源／設定值 |
| README.md | 只有已公開 repo 基底、採用與驗證狀態，無本機私有絕對路徑或資料連結 |
| PRIVACY-REVIEW.md | 只記類型、範圍及結果，不列任何檢出的私人值 |
| SHA256SUMS | 僅上述檔案 SHA-256，無資格表、token 或 verifier |

工具對本次檔案掃描已知來源識別值、API/password/bearer/private-key 型態、email/電話、真實 secret 欄位字串值、私有資源 ID、本機敏感路徑；沒有命中需要阻擋的值。差異中的樣例 fixture 為既有明確合成測試，沒有用真實人名／員編替代。

未交付：原 LOGIN 文件、原 manifests/receipts、私有 identity impact、真實資料／來源 Excel、settings/Properties、salt/digest/token、截圖與下載報表、隔離資源／OAuth證據、整個本機目錄或本機登入提交歷史。它們不能用整目錄 push／Git bundle 方式加入公開分支。

檔案中出現 password/token/member 等 schema 名稱不代表含秘密；真正 credential 或人員資料仍只在原私有流程。公開提交只代表這些 allowlist 檔案可以交接，不代表個績或登入已正式啟用。

新增 owner-code-20261009 十一檔已逐檔人工及掃描核對：兩份可套用 patch、四件模組、純合成測試與公開採用／manifest文件。沒有真實姓名、員編、績效、班表、密碼、key/token、私有 fixture／實測收據或設定值。原 executable code/test 與登入 owner 完成包完全相同；只有 README／manifest／去敏文件的公開狀態與稱呼更新。完整 applied GS 與所有 internal 收據均只留本機。新增後端碼已獲獨立批准，本輪只公開交接，不 merge／部署。
