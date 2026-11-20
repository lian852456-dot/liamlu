# 人偶拳擊 V2：隔離同款人偶演示與同源接入準備

2026-11-05 公開 QA 廣場：https://wiley-hope-respondent-less.trycloudflare.com/city.html

動作實錄：https://wiley-hope-respondent-less.trycloudflare.com/review.html

## 三層狀態

1. **隔離相同人偶演示：可玩。** server 為 QA 帳號指定兩種不同已發布外觀，直接重用 `20261104-two-refined.1` 的 p3/p5 renderer、臉、髮型 GLB、皮膚與衣服資產；來源檔 SHA 見 `evidence/avatar-source.json`。使用者輸入的暱稱不會決定別人的 UID 或造型。這不是本人員編登入。
2. **真本人同源接入：接口與隔離驗證完成，尚未安裝。** `integration/city-boxing-addon.mjs` 依原城市 session／CSRF 選本人 UID，沿 server 保存外觀；預設 disabled。前端 `city-boxing-entry.js` 提供同源 iframe 進擂台／回城生命週期，禁止跨來源，不帶 cookie/token/UID 到另一個 origin。接法與限制見 `integration/INSTALL_CANDIDATE.md`。
3. **共用城市已啟用：否。** 沒有重啟、改正式登入、改原角色、啟用真幣／金牌、開賣寵物或重發獎勵。原 current-guests 53／legacy-owners 23 人各自唯讀備份 integrity ok，放在原城市私有備份區；沒有將真人DB複製到這個候選。

## 試玩

從 QA 廣場輸入暱稱，移動幾步後按進擂台；第一人建立房間，將邀請連結交給另一台裝置、另一瀏覽器或無痕視窗。第二人加入並接受，三秒倒數後打60秒。J直拳、U勾拳、K防守、L閃身、I後撤，也可點手機按鈕。結束或取消後按回到進場位置，再重新整理可核對保存的位置。

同一瀏覽器多分頁仍是同一 QA 角色；顯示的造型由 server 選定，不能在表單冒用同仁。此輪公開入口只開 honor/0，合成押注介面及API均關閉；舊合成幣結算程式僅保留隔離回歸測試。

## 動作改良

- 原人偶身形、頭部、臉型與衣服不改；動作驅動加前踏直拳、彎肘勾拳、肩腰旋轉、重心及前後腳踏步。
- 暫戴紅／藍拳套；抬臂格擋、左右閃身及後撤；命中有短促後仰／退步，格擋有縮肩反應，落空回收。勝利舉手、敗方踉蹌與星星只保留4秒，不寫外觀資料。
- 直拳接觸時間240ms、勾拳320ms；伺服器到接觸點才檢查位置、有效距離、閃避及防守並計分。畫面與server共用 `combat-kinematics.js`，前端不能送勝負或分數。
- 兩人 anchor ±.66，直拳中心距離上限1.16、勾拳1.25；保留動作時間、冷卻、序號重放防護、斷線取消與退款邏輯。只作招式內踏步，沒有新增自由走位／重型物理系統。
- 人體上半身使用臨時動作pivot；必要手臂幾何只在初始化clone一次，來源geometry、材質和資產不改。卸除rig還原原階層及幾何，沒有永久換裝。

## 驗證證據

- `v2-focused-tests.tap`：7項涵蓋接觸延遲、直／勾拳、格擋／閃避／後撤、重放、同源會話／CSRF／偽造UID／停權、原city所有資料表指紋不變，以及保留的合成託管守恆／重啟退款。
- `v2-browser.json`：兩個獨立 Chromium context 使用不同人偶，完整60秒，雙端得分與賽果一致；回城及reload後UID、外觀、位置與錢包不變。這是在最後拳套／彎肘／站距精修前跑的完整流程。
- `v2-contact-tests.tap`、`v2-motion-final.json`、`v2-contact-final.json`：最後站距與動作精修的聚焦檢查及連續真圖，未為美術微調重跑無關全套。`review.html` 提供最終直拳／勾拳／格擋影片；閃身／後撤圖拍於相同動畫驅動的站距最後微調前，頁面有標註。
- 最終兩人觀測：146 draw calls、138 geometries、5 textures；新增手臂變形最多約1.9萬頂點/幀，角度沒變即跳過。手機版DPR上限1.2、約30fps節流，無每幀新mesh/material/texture；這些是桌面瀏覽器資料，不是iPhone效能驗收。
- 最終公開資產SHA讀回見 `evidence/v2-public-readback.json`；私有DB、bridge source及設定不對外供應。

## 尚未通過的驗收

尚無真實同仁同源登入、共用啟用、iPhone Safari／第二實體裝置／長背景返回或真人趣味驗收。動作仍是輕量程式rig，沒有完整足部IK與專業動作捕捉；快速動作的腳步貼地、擊中感與對戰節奏仍可依試玩回饋調整。不能把功能測試通過當作「好玩」已驗收。

## 執行及保存

Node24：`node server.mjs` → http://127.0.0.1:4810 。資料僅位於本候選 `.private-runtime/`；測試 `.private-qa/`；舊候選於 `.private-backups/20261105-v1/` 有備份。這些私有目錄不入Git。公開tunnel使用既有受控免費工具，不新裝技能或服務。

`node --test tests/avatar-combat.test.mjs tests/city-session-gate.test.mjs tests/boxing.test.mjs`（同源測試讀取 tests/store-base 的未修改GameStore依賴快照，不讀原城市DB）。退版只切回前版程式，不覆寫任何較新存檔。
