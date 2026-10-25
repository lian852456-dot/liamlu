# 舊換新月進度：獨立本機整合候選

本候選合併 main `0c2c6a056ffcce1992a39cbbe30f74e204533d52` 與 WORK PR179 `000912bb1ce6c3b189c22b3fb5d904d9029f0151`，沿用 WORK API、匯出及 owner 01／02。正式首頁、APP、查價及目標進度畫面保留 PR183／184。本候選未發布，未修改 WORK 分支、登入設定或正式資料。

## 計數與證據

有目標同仁每個日曆月 3 台；店長、代理店長免目標且保留實績。副店長、資深業務代表列同仁。新月重新計算，不帶入上月實績，歷史快照保留。角色、在職狀態及生效期間來自核定私有月名冊；登入名冊只決定讀取權限，不作月目標分母。

單銷、RT、AQNP 沿用候選計數。同回收碼去重，同銷貨單不同回收碼分別計數；衝突停止整批。上傳者須核实完整九店範圍，九店都有交易不能自行證明沒有篩選。

同月取消採原成交 +1／取消 −1，該筆月淨額 0。新來源從已核定的同月正式對照派生 `monthly-reset-same-month-net/v2`；已存在的精確來源對照不自動改寫，舊 `monthly-reset-no-cancellations/v1` 仍只准無取消來源。跨月取消的沖回月份尚待核定，任何一筆跨月即停止整批預覽／同步；舊核心「回沖原成交月」不能代替業務核定。

已由督導逐筆確認的跨店支援，店績依 SAR74 成交店，個績歸本人且保留原店名冊與目標。私有精確來源對照的 `support_approvals` 以交易 SHA-256、原人員／店點、成交店、日期及 verified 狀態核定；請求 payload 不得授權支援。新檔只能沿用相同交易，改寫或刪漏已核支援停止整批。私有快照保留雜湊支援證據；公開資料只增加九店支援流入／流出及逐日店績彙總，不公開員編、交易識別或核定對照。店績與原店個績可不同，以支援流向及全區台數分別對帳；日期查詢的店績不得由個人所屬店加總代替。

取消來源仍以完整月批次取代，不能對已扣除的結果再減一次。私有不可變快照加入 `cancellation_evidence`：每筆以穩定交易雜湊連結 +1／−1 事件、原人員／店點及日期，不保存原回收碼或銷貨單，不進入公開／個人讀取投影。相同交易重匯不新增扣數；同批取消日期衝突、後續完整來源漏掉或改寫已核取消，均停止。證據與快照一起由既有 C1／前版指標回復，舊歷史與其他月份保留。逐日仍顯示「截至核對日有效的原回收日」，取消交易移出原成交日，不把取消當日 −1 填入現有非負逐日回收欄。

SAR74 正規解析 CSV 引號及逗號，保留空白欄、來源員編與交易識別字串。員編可為五碼或 55 開頭的七碼，解析保留原字串，比對時兩者視為同一人。支援舊 30 欄合成格式及新摘要 29 欄格式（零基 15／18 空白，銷貨單 17、員編 23、取消 26）。未知欄數、重複必要欄、破損列、日期／期間／專案衝突停止。真檔完整 schema／bytes 須另驗，合成格式不代替真檔驗收。

九店正式店碼固定，通化為 DNB10174，不接受 DNB10059 別名；不改其他模組 ID。員編依 Liam 於 2026-10-11 核定的可選 55 前綴規則比對：僅七碼 55 開頭移除前兩碼，五碼原樣保留（即使五碼本身以 55 開頭）。同月首次成交可對應已核定月名冊中的七碼員編，仍驗證在職、店點與觀測日期。姓名、其他前綴及任意尾碼不作比對。

## 私有配置接口

配置只讀既有 PRIVATE／NONE 資料夾內已存在、已核實的檔案，不建配置、不初始化 state。真實員編、姓名、HR、交易原檔及映射不得提交公共 repo。

`north12b-tradein-monthly-roster-YYYY-MM.json` 包含：

- `schema_version: tradein-monthly-roster/v1`、月份、`review_status: verified`、核心 rule ID、權威來源 SHA-256。
- `people`：七碼 canonical 員編、遮罩名稱、九店店點、明確職務、active／inactive、ISO 生效起日及末日（無末日為 null）。
- 重複、未知職務、缺生效期間停止。未核定月中到離職／調職計法，因此 active 身分未覆蓋整月時停止，不自行按比例或猜目標。
- 所有月份讀回核對當月名冊 hash；基線異動停止讀取並要求重核，不拿當前登入名冊回填歷史。

`north12b-tradein-reference-<source SHA-256>.json` 包含：

- `schema_version: tradein-private-reference/v1`、原 CSV SHA-256、查詢起訖。
- 九組正式 `stores` 店碼／店名、`employees` 五碼 source ID、七碼 canonical key 及本批實際日期／店碼 observations。
- `counting_review_status: verified`、核心 rule ID、`counting_policy: monthly-reset-no-cancellations/v1`（無取消）或 `monthly-reset-same-month-net/v2`（同月抵銷）。
- 每筆對照吻合來源、日期與店碼；未知／重複／衝突拒絕整批。payload 不能代替 owner 配置或授權。

### 同月每日新檔更新

本批精確對照檔尚不存在時，後端可從同月目前已發布版本的私有對照產生新批次對照。必須通過原快照完整性、相同核定月名冊 hash、九店店碼、逐一員編映射及原觀測資料驗證；新來源截止日不得倒退。既有映射沿用，首次成交依可選 55 前綴規則對應核定月名冊；未在核定名冊、非在職或店點異動仍顯示待核組數並停止整批。新月份仍需核定首次來源，同月取消沿用上述抵銷規則，跨月取消整批停止。

預覽與 C1 檢查點只在記憶體生成對照，保持零配置寫入。同步在原 lock、預覽及 active 版本核對通過後，保存並回讀新批次私有對照，將其 hash 記入月索引，再切換新月快照。後續每日新檔直接沿用該已發布對照；相同來源不重複累加，舊對照、歷史快照與原 C1 回復流程保留。舊索引沒有對照 hash 時，僅允許從其現有私有檔及已核定月名冊驗證後沿用。

## 權限及目的地

讀取沿用 A trusted／核准裝置，只有既有 trusted 督導可看九店。一般同仁、店長、代理只回傳本人。月名冊角色不能授權九店。投影不含員編、回收碼、銷貨單、客戶資訊或私有 Drive ID。

預覽／同步／回復沿用 `reportUploadAuthorize_` 管理者密碼及員編白名單，不增加 OAuth、憑證、分享或登入設定。價格與績效 registry 分離，月彙總存於既有私有資料夾，獨立 `north12b-tradein-performance-registry.json`。原交易識別僅留當次記憶體，不存快照。

WORK head 已有 owner 01 foundation／02 完整 read fence，本次不重貼。生成後只修改 Code.gs 的 trade-in generated block；owner helpers 維持原碼、单一定義及 gate false。完整 read wrapper 保留 registry、snapshot、月名冊及投影邊界。未加入 B、peer RPC、transport 或 state 初始化。

同月完整批次取代，重新驗證來源、名冊、預覽及預期 active hash，保存後讀回。同源同結果 no-op。回復交換當月 active／previous，保留歷史檔案及其他月份；月名冊基線不合時仍拒絕讀取。

## 本機驗收與正式差距

`node scripts/preview-sar74.mjs --file <private local CSV>` 唯讀輸出結構、期間、hash、列／人／店／取消列數。UTF-8 失敗後嘗試 Big5。它不輸出員編或交易值，實績／目標／尚缺均為 null，不呼叫 API 或寫資料；拒絕不得轉成零。

合成離線測試用真核心／真 GAS API，Drive 與權限依賴為合成替身。瀏覽器測試才把 pending 回覆改 ready，攔截全部外部請求，驗證上傳→預覽（零寫入）→同步→區／店／人→複製 API→PNG／XLSX→重新整理／APP 讀回及 1280／390／320px。正常複製 API 在 isolated test context 模擬，未觸碰 owner 剪貼簿，不代表實機。

正式頁面仍 pending，GAS 未採用增量。正式前需確認實際 owner 部署、已批准 native state、所有 Users／Requests writers、runtime 正反向及恢復、editor 增量 hash；禁止以 repo 全檔覆蓋 editor。正式私有配置、真原檔驗收、既有管理者正式寫入與部署批准仍須完成。跨月沖回政策及正式部署仍須另行核定；同月抵銷不改存取權限。

回復保留原 GAS／Pages 版本，資料回復至當月前一版；auth 恢復不得重設 deny／generation。正式發布另記精確 Pages commit、GAS 新舊版本、state 恢復點及逐值讀回證據。
