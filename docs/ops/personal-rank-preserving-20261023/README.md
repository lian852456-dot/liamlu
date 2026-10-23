# 排名專用發布與版本保護

舊KPI單元件客戶端只接受40人、protected processingRunId及過期台獎；正式1023資料為41人、protected沒有該run欄，而同日台獎已fresh。舊後端整段替換component metadata，會丟失QIS、保險與台獎來源說明。本變更新增專用模式，不改舊預設流程。

## 寫入邊界

既有 `private_publish_kpi_component` action先執行原管理驗證。新payload使用 `rankPatchBase64`，不含舊 `kpiBattleBase64`，舊版本會在寫入前拒絕。新分支在原snapshot鎖內核對canonical SHA-256父KPI及protected KPI、當日／前日截止、既有run與完整身份集合，僅合併rank、rank_dod、來源標記及protected原字串的缺字鍵。原成績、全部其他指標、awards payload與metadata、其他component逐值保留；只更新必要發布時間與既有稽核。

沒有硬改為41；40／41均須與當次protected完整身份集合相符。若protected有processingRunId則必須相同，否則只沿用當次container既有kpi_run_id，不捏造新ID。缺值保留null，錯語義、錯鍵或並行父版本變更均拒絕。寫入只送一次，回條遺失後先讀回；未確認則停止，不自動重送或以舊快照回蓋。

## Runtime

`scripts/north12b/prepare_rank_runtime.py` 只產生隔離安裝包，不修改正式runtime。它鎖定現行builder及publisher hash，安裝包僅三檔：

- `personal_rank_contract.py`：已發布來源helper。
- `build_github_pages_data.py`：既有兩處匯入／來源核對patch。
- `publish_kpi_component_data.mjs`：內嵌受測排名客戶端，增加 `--personal-rank-repair <intent.json>`；此模式在讀舊共用today_report_data及manifest之前分流。舊模式原狀。

排名intent包含明確候選、當次／前日來源、日期及新receipt路徑。來源實體SHA-256必須吻合provenance；既有驗證讀回後才建立父版本與寫入payload。本模式不載入或建立憑證，使用既有發布transport；若現有管理驗證失敗，停止，不能轉為直接覆寫Drive或更改認證。

## 正式GAS部署

正式B owner v73與編輯器來源已經合法clasp讀回，兩者十檔相同。正式主模組與repo有其他差異，因此只把本次新helper及writer的兩行分流套入正式原模組，其餘九檔與正式manifest逐位元保留。上傳前再次讀回比對整個專案，不用repo整檔覆蓋正式來源。既有Web App deployment ID、執行身分、存取及OAuth scopes保持原狀；建立新immutable版本後更新同一部署並讀回。

## 驗證與回復

測試涵蓋40／41、fresh／blocked台獎、身份缺漏／重複／錯鍵、錯來源／過期、缺值、初始及晚期並行變更、認證拒絕、其他payload與metadata保留，以及不確定回條不重送。正式發布須另讀回41人的排名與protected／台獎／其他欄canonical hash；mock、CI或部署成功不算資料與畫面驗收。

GAS回復先核無後續變更，再將同一deployment切回v73；編輯器僅撤回本次增量。Runtime核對安裝後hash才還原精確副本，移除僅本次新增的helper。若排名資料曾寫入，使用最新父hash與白名單方式只還原本次排名差異，保留後續更新，禁止整份舊快照覆寫。前端PR262不需因此回退。
