# 業務登入核驗失敗後的恢復

`dashboard-b-shell.js` 在既有會話核驗或資料讀取失敗後，仍清除私有畫面並保持 `pending`。此時顯示原有員編／指定密碼表單，使用者可選擇「重新核驗」原會話，或自行提交正常登入。不自動登出、重新登入、切換通道或移除會話／裝置證明；原固定期限、失效清除及後端驗權保留。使用者自行提交登入時，仍執行原有的新舊會話替換流程。

錯誤提示只使用固定分類，不顯示回應內容或原始例外文字：

| 分類 | 可確認的狀況 |
| --- | --- |
| NETWORK | 瀏覽器未完成 fetch；無法據此區分離線、CORS 或其他網路問題 |
| SERVICE | HTTP 回應未成功；不把它推論為特定帳號／角色問題 |
| RESPONSE | 回應不是可讀的預期 JSON 結構 |
| TIMEOUT | 原有 90 秒請求期限已到 |
| AUTH | 服務未回傳驗證成功，或原會話／資料契約未通過；不推測具體原因 |
| UNKNOWN | 其他未分類失敗；仍保持鎖定 |

所有分類都明示「尚未確認失敗原因」。顯示表單不授予資料存取權；成功核驗後才恢復原畫面，表單重新收起。此修補沒有變更正式後端、資料元件、角色、裝置綁定、密碼或期限。

合成驗證見 `tests/business-login-errors.test.cjs`、`tests/business-login-recovery.spec.js`，涵蓋 1280px／390px 的失敗、表單恢復、原會話重試、本人提交登入、原期限與證明不變、無自動登出／通道回退，以及不顯示原始錯誤內容。合成測試不是正式帳號或實體手機驗收；正式資料讀回仍須本人有效業務登入。

本修補保留既有 GitHub workflow；上述兩個新增測試尚未納入 CI。可分別執行 `node --test tests/business-login-errors.test.cjs` 與 `npx playwright test tests/business-login-recovery.spec.js --workers=1`，驗證紀錄須與既有 CI 結果分開報告。
