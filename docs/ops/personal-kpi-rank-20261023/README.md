# 個人 KPI 排名來源契約

正式個績工作表 I 欄有排名，但 protected kpicalc 不保存該欄；網站與 APP 的排名須由同來源快照補入。10/23 讀回的正式快照有41人、排名全空，且無個人語義標記。原個績 guard 正確拒絕把未核實的店長快照當個人成績。

`scripts/north12b/personal_rank_contract.py` 由正式 `_個人達成率_明細` I欄與前日相同員編取得排名及排名變化。必須核對欄頭、截止日、來源檔名、完整人員鍵、角色與原總達成率；修復既有快照時再比對 protected KPI。重複或無法唯一匹配的鍵拒絕；缺排名保留 null。來源 `?` 與既有顯示註記 `［來源缺字］` 僅做鍵正規化，不補字、不改姓名。

輸出改 `personal[].rank`、`rank_dod`，新增 `personal_rank_semantics: individual-rank-v1` 及含工作表、欄、來源檔、截止日與 SHA-256 的 `personal_rank_source`。既有快照的字面 `［來源缺字］` 註記只有在與 protected 來源唯一對齊時才還原為該來源的 `?` 字串，供現行後端身份鍵驗證；不補姓名、不更動名冊或原始報表。不新增完整 `personal_semantics` 標記，避免意外放行店長其他 DOD 或指標。網站與 APP 只在既有同來源／日期門檻及新排名來源門檻都通過時讀排名；其餘個績／店績語義不變。

## 產製與發布

`runtime.patch` 是既有 Mac `build_github_pages_data.py` 的最小增量：匯入同名 `personal_rank_contract.py`，在產製 KPI component 的最後呼叫來源核對。正式 runtime 位於 repo 外；安裝時將本 repo helper 複製為該 runtime 的 `personal_rank_contract.py`。不得將 repo、舊 runtime 或整份快照覆蓋其他工作。

- runtime 修改前 SHA-256：`785ed97f6113783e53447af30697a977f1fac081e5646d1b12b986074482c58c`
- 套用 patch 後 SHA-256：`4a278791c784ac653ee380c057adbbe2c4a8bd926b74bef1e22c5a10e76e892a`
- 安裝前再次比對來源 hash；不同即停止，重新評估並行變更。
- CLI 僅建立新本機候選，不能覆寫輸入；沒有網路、憑證、發布或同步操作。
- 正式發布須由合法既有途徑只更新 KPI component，先讀取最新正式版本並保留可回復副本，核對 protected KPI、台獎與其他 payload 不變，發布後獨立讀回。
- 本機／CI／合成畫面不代表正式登入後畫面已驗收。

## 回復

前端使用一般 revert PR，僅撤回本次排名來源消費與資產版本。runtime 以安裝前精確副本復原 builder，移除本次新增 helper；先確認期間沒有其他更新。資料回復只針對本次 KPI 排名欄與來源標記，必須基於最新 container 保留後續台獎及其他更新，不能盲目覆蓋整份舊快照。不需更動 GAS、登入、名冊、密碼、權限、裝置綁定或排程。
