# 舊換新月進度：獨立本機整合候選

本候選合併 main `0c2c6a056ffcce1992a39cbbe30f74e204533d52` 與 WORK PR179 `000912bb1ce6c3b189c22b3fb5d904d9029f0151`，沿用 WORK API、匯出及 owner 01／02。正式首頁、APP、查價及目標進度畫面保留 PR183／184。本候選未發布，未修改 WORK 分支、登入設定或正式資料。

## 計數與證據

有目標同仁每個日曆月 3 台；店長、代理店長免目標且保留實績。副店長、資深業務代表列同仁。新月重新計算，不帶入上月實績，歷史快照保留。角色、在職狀態及生效期間來自核定私有月名冊；登入名冊只決定讀取權限，不作月目標分母。

單銷、RT、AQNP 沿用候選計數。同回收碼去重，同銷貨單不同回收碼分別計數；衝突停止整批。上傳者須核实完整九店範圍，九店都有交易不能自行證明沒有篩選。

取消沖回月份尚待核定。後端僅允許經核定的 `monthly-reset-no-cancellations/v1`，任何取消日期非空即停止整批預覽／同步。舊核心「回沖原成交月」及其合成單元測試不能作正式批准。

SAR74 正規解析 CSV 引號及逗號，保留空白欄、五碼員編與交易識別字串。支援舊 30 欄合成格式及新摘要 29 欄格式（零基 15／18 空白，銷貨單 17、員編 23、取消 26）。未知欄數、重複必要欄、破損列、日期／期間／專案衝突停止。真檔完整 schema／bytes 須另驗，合成格式不代替真檔驗收。

九店正式店碼固定，通化為 DNB10174，不接受 DNB10059 別名；不改其他模組 ID。員編使用 owner 私有逐筆精確對照，禁止全域前綴、姓名或尾碼推算。

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
- `counting_review_status: verified`、核心 rule ID、`counting_policy: monthly-reset-no-cancellations/v1`。
- 每筆對照吻合來源、日期與店碼；未知／重複／衝突拒絕整批。payload 不能代替 owner 配置或授權。

## 權限及目的地

讀取沿用 A trusted／核准裝置，只有既有 trusted 督導可看九店。一般同仁、店長、代理只回傳本人。月名冊角色不能授權九店。投影不含員編、回收碼、銷貨單、客戶資訊或私有 Drive ID。

預覽／同步／回復沿用 `reportUploadAuthorize_` 管理者密碼及員編白名單，不增加 OAuth、憑證、分享或登入設定。價格與績效 registry 分離，月彙總存於既有私有資料夾，獨立 `north12b-tradein-performance-registry.json`。原交易識別僅留當次記憶體，不存快照。

WORK head 已有 owner 01 foundation／02 完整 read fence，本次不重貼。生成後只修改 Code.gs 的 trade-in generated block；owner helpers 維持原碼、单一定義及 gate false。完整 read wrapper 保留 registry、snapshot、月名冊及投影邊界。未加入 B、peer RPC、transport 或 state 初始化。

同月完整批次取代，重新驗證來源、名冊、預覽及預期 active hash，保存後讀回。同源同結果 no-op。回復交換當月 active／previous，保留歷史檔案及其他月份；月名冊基線不合時仍拒絕讀取。

## 本機驗收與正式差距

`node scripts/preview-sar74.mjs --file <private local CSV>` 唯讀輸出結構、期間、hash、列／人／店／取消列數。UTF-8 失敗後嘗試 Big5。它不輸出員編或交易值，實績／目標／尚缺均為 null，不呼叫 API 或寫資料；拒絕不得轉成零。

合成離線測試用真核心／真 GAS API，Drive 與權限依賴為合成替身。瀏覽器測試才把 pending 回覆改 ready，攔截全部外部請求，驗證上傳→預覽（零寫入）→同步→區／店／人→複製 API→PNG／XLSX→重新整理／APP 讀回及 1280／390／320px。正常複製 API 在 isolated test context 模擬，未觸碰 owner 剪貼簿，不代表實機。

正式頁面仍 pending，GAS 未採用增量。正式前需確認實際 owner 部署、已批准 native state、所有 Users／Requests writers、runtime 正反向及恢復、editor 增量 hash；禁止以 repo 全檔覆蓋 editor。正式私有配置、真原檔驗收、既有管理者正式寫入與部署批准仍須完成。每月重新起算的確認不代表取消政策或新權限授權。

回復保留原 GAS／Pages 版本，資料回復至當月前一版；auth 恢復不得重設 deny／generation。正式發布另記精確 Pages commit、GAS 新舊版本、state 恢復點及逐值讀回證據。
