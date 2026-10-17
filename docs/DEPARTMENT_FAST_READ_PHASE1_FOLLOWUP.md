# 部區讀取跟進：舊快照成本與正式驗收

本文件記錄2026-10-16的候選跟進。第一階段前端仍未正式發布；先前已發布的後端版本不代表瀏覽器已啟用版本協定。本輪沒有發布前端、更新正式GAS或寫入正式資料。

## 已確認的差異

正式公開的部區頁面與三個讀取腳本尚未使用`SessionReadManager`或`knownVersion`，共用管理器網址仍為404。因此不能將目前正式返回速度當成候選版本讀取的量測。原第19版後端來源備份已具備版本協定，但仍須在有效登入後核實目前正式來源及回應。

首次載入仍包含驗權、完整來源讀取、傳輸、驗證及呈現。現有合成數據不能證明正式15至21秒的歷史等待由哪一段主導，也沒有首載加速的正式證據。`knownVersion`主要省去未變版本的完整回應；它不讓冷頁免讀來源。

舊快照相容路徑會先解析原檔，再計算版本，即使最後回覆`notModified`仍會讀取完整舊檔。與已分版資料不同，不能僅憑舊檔的修改時間省去內容核對；同時間、同長度的更正亦須被識別。

## 本次修正

`DepartmentGoldMonthly.gs`沿用這次請求已解析並驗過的私有資料夾，直接選取原規則下最新的舊快照，再走原檔案ACL與JSON檢查。移除經舊helper重複尋找來源資料夾的工作；不新增跨請求快取，不改session、期限、授權函式、資料結構、版本值或發布流程。`gas/`與`patrol-gas/`為同一邏輯模組的相同鏡本。

隔離實際GAS程式的呼叫計數：冷讀及同版本讀取的`DriveApp.getFileById`均從4次降至2次，資料夾sharing/owner/editors/viewers各從2次降至1次；原檔案的完整ACL及blob讀取仍各保留1次。完整回應與短回應的序列化雜湊均與原第19版相同。這是合成呼叫成本，不是正式延遲或保證的秒數。

測試fixture改為建立實體的合成舊快照，經真正的reader及ACL讀取，避免stub跳過本次受影響路徑。新增16個案例驗證呼叫成本、同時間同長度更正、來源移除、最新檔選擇、壞JSON、權限拒絕與完整receipt讀回。83項Node及56項Chromium/WebKit回歸通過；瀏覽器後端均為隔離合成來源，不是正式畫面或實體iPhone驗收。

```sh
node --test tests/session-read-manager.test.cjs tests/department-version-read.test.cjs tests/department-legacy-read-cost.test.cjs tests/department-ops.test.cjs tests/department-gold-monthly.test.cjs tests/department-scores.test.cjs tests/department-ops-integration.test.cjs tests/department-store-presentation.test.cjs
```

## 正式驗收順序

1. 先在原頁完成原督導登入；保留同一裝置及網路。讀回目前正式來源、版本、月份、店點、人數，確認使用舊快照或已分版資料，不能由程式或公開資產推定私有active狀態。
2. 先核對目前正式GAS的兩個原模組與已保存第19版基準。這次額外差異只在`DepartmentGoldMonthly.gs`的舊來源helper；發現任何其他來源漂移就停止套用。不要整份覆蓋PatrolCode、改Properties或變更部署設定。
3. 使用既有同源受保護候選頁驗證原來源逐值一致，分別量冷頁開啟、首次金牌、首次店務成績、同版本返回、更新版本返回、已載入篩選。先核對候選是否送出已知版本及收到版本協定，再解讀耗時；不將HTTP200或部署成功當驗收。
4. 冷讀分開記錄驗權完成、資料回應、JSON/資料驗證完成、首個正確畫面出現。既有驗收計時僅能說明所覆蓋的資料請求，不足以直接拆出GAS執行與網路時間。若後端仍慢，先取得不含身分、憑證或原始payload的分段證據，再決定後續修正；不能以放寬timeout或安全檢查處理。
5. 同版本返回必須在後端核權前保持私有畫面鎖定，確認只用記憶體中的同版本資料；舊快照仍核對新內容，已分版來源仍逐檔核對ACL。跨頁登出、到期、切換身分、專用測試身分撤權及晚回應不得復活資料。
6. 對照原始來源完成單月、季度、四區、門市、同仁及缺月驗證；再核Excel、可編輯PPT/PDF、原檔上傳、完整讀回及回復。正式測試只用已核准來源及可回復流程，不以合成資料覆蓋營運資料。實體iPhone Safari/PWA另列實測。
7. 上述證據齊備後才依既有授權發布，保留當次前端與GAS回復點；發布後重驗版本與畫面。PR235登入及締結率匯入、每日接龍金牌同步均不在本次程式修改內。
