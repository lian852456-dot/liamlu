# 同源本人接入準備（未安裝／共用開關關閉）

公開 trycloudflare 入口只使用隔離 QA session。任何員編、城市 cookie、token、UID 都不透過網址、postMessage 或另一個 origin 傳遞；公開 QA 造型不能當作本人核身證據。

準備好的接口：`createCityBoxingGate`／`attachCityBoxing` 直接呼叫原 `app.store.authenticate`，使用原 cookie 名稱、同源 Origin 和原 `x-city-csrf`。本人 UID、暱稱、已保存外觀只從 server store 取值，請求內容不可指定 UID／員編／外觀。停權／撤銷 session 依原資料表與驗證拒絕。初次登錄拳擊側庫只建榮譽參賽資訊，coins=0，不能存取或扣原 wallet。

## 可逆的接法

- 預設 `enabled:false`，此時 `attachCityBoxing` 不改任何既有 request listener。
- 真正同源 pilot 前，將此候選 module 與公開資產掛到同一城市服務的 `/boxing/`，API 固定 `/api/boxing/*`；`origin` 必須用該服務確定的 origin／現有受控 gateway 正規化後 loopback origin，不能從任意傳入 Host 推導。
- 沿用當下 `app` 與 `cookieName`，每個世界配置各自的拳擊 sidecar（位於 boxing module 下獨立 `.private-<world>/`），禁止共用或複製原城市 DB。既有員編 game-only 限制、active roster 驗證與業務權限維持。
- 只開啟 `CITY_BOXING_ENABLED` pilot；真幣／金牌入口不存在，所有非 honor/0 請求一律拒絕。
- 第一輪 renderer 只包含已驗證的 p3/p5 資產。其他角色會收到 `AVATAR_NOT_IN_PILOT`，不能假套別人造型；擴角色須接完整原 adapter 並另驗資產。

前端 `CozyCityBoxingEntry.create({enabled,csrf,getPose,setPose,pauseCity,resumeCity,arenaPath})` 必須由現有城市提供暫停輸入／渲染、恢復與 `W.setPose` 函式。按進場：server 記下當前 pose 到 sidecar；暫停城市，開同源 iframe。iframe 沒有新登入入口、讀原 session，POST 使用原 CSRF。按回城：server 回傳**當下城市位置**，關閉 iframe 後重新同步，避免另一裝置已更新位置時以舊座標覆蓋。`postMessage` 只含回城意圖，嚴格驗同源與 iframe source，沒有 cookie/token/UID。關閉同源功能不影響原城市正常遊玩。

原城市沒有 arena scene；不得把擂台座標寫到 `v42_positions`。回城也不重建角色、複製profile、重發獎勵或重寫物品／寵物。

## 本輪已驗與未驗

- 以既有 `GameStore.authenticate` 的合成城市帳號驗證正確 cookie／CSRF、錯誤 Origin／CSRF、偽造UID、停權與關閉開關；所有原城市表指紋前後相同。
- 公開 QA 進廣場→保存位置→進擂台→完整60秒→回廣場→重新整理：UID、appearance、pose及wallet不變。
- 真實同仁登入0、共用安裝0、共用開關未啟用；此證據不等於真人同源驗收。iPhone Safari、第二實體裝置、背景返回與真人趣味驗收仍待。
