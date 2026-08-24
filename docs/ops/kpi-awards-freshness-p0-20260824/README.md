# 2026-08-24 KPI／台獎 freshness P0

此留存只包含 KPI 版本日期的最小 GAS 變更，以及非 Git runtime 的台獎來源新鮮度 gate。沒有寫入正式快照、Sheets、來源 Excel、巡店或 PWA。

## 已確認根因與處置

- KPI：排程的 `manual-wins` 只有在 incoming 的資料截止日被判成同日才會成立。`reportUploadKpiDate_()` 原先只信任 `month + snapshotDay`，沒有核對已解析的期間末日；現在只接受兩者相同的有效日期，否則回傳空值而 fail-closed。檔名、寄件日與執行日都不參與資料日期。
- 台獎：8/24 的 canonical staging copy mtime 雖為 8/24，但兩個 OneDrive 原始檔 mtime 與 SHA-256 仍為 8/23；8/23、8/24 manifest 的 store/person hash 亦相同。舊流程用 staging mtime 選檔，且 summary 沒有 immutable source identity，所以重用了昨天資料。
- 修正：runtime 現要求每次 run 的 store/person 原始來源都具 canonical basename、原始 mtime、size、SHA-256、run_id 與 origin；兩個 SHA-256 都與上一個 run 相同時 block，除非有明確理由與 SHA-256 驗證的 exception evidence。staging、outputs、cache 和 fallback 不再能作為每日來源。
- snapshot／發布 gate 現保留兩份獨立 `source_files` identity，且要求兩者與 data cutoff/run ID 完整一致；台獎不得填入 KPI 的 `0824.xlsx`。

## 8/24 原始來源唯讀證據

| report | basename | original mtime (Asia/Taipei) | bytes | SHA-256 |
| --- | --- | --- | ---: | --- |
| store | `01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金 6.xlsx` | `2026-08-23T09:40:28+08:00` | 29195 | `a929d002a6040fc26fc48a224c913bae256ba3f8345543aa78a6c52a8e4346f6` |
| person | `01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金 6.xlsx` | `2026-08-23T09:40:56+08:00` | 56008 | `fcb90821ac33a6c4520c8986b2197937f5c7c3efcd4b568c1605d82b62031613` |

因此 8/24 source-only preflight 必須且確實以「今日台獎來源尚未更新」停止；不可建立 8/24 台獎 Mail、Website 或 App snapshot。

## Runtime patch 與回復

- Patch：`runtime-source-freshness-p0.patch`
- Patch SHA-256：`1ce91aba79177575ef7e47cf6ca5fd4c817c3d8ee17f40406da6af734965d09f`
- 修改前 runtime SHA-256：
  - `update_phone_awards.py` `8962b36b3f9d0feb7f4f265d506e659e1d64a4b294fc37022b4f1b12f7bdb027`
  - `prepare_send_payloads.mjs` `cb0bee09d5692574fa9895964cf6651132774a2f9498825b2b0e226672c1048f`
  - `build_github_pages_data.py` `fb3fc20da85a34f5799c7726f273293dc88b681300ea29bbbc215459901b8fbe`
  - `publish_formal_website_data.mjs` `96e71d66574bd195acb1b0e3ffe0e1197eae7ea181531836f459317460439d45`
- 修改後 runtime SHA-256：
  - `update_phone_awards.py` `82e465194f25104c9cc114be2db38350747eec9006d178b6a9ed505accd13e73`
  - `prepare_send_payloads.mjs` `d41cb8f92ea4e2c7e17c9830b92eb88548d41b30cc40c5f560d6e9384dd06f8f`
  - `build_github_pages_data.py` `270448c0987373207f4d3f2033d0a42bb615815f66e9b8544832e9d985bee88f`
  - `publish_formal_website_data.mjs` `e9d0b436fb957584be3a11dab9883cb4c43646765ec06cfeb66cf7b50e4f38e7`

回復只能從 project root 先執行 `git apply --reverse --check docs/ops/kpi-awards-freshness-p0-20260824/runtime-source-freshness-p0.patch`，成功後才執行同一指令但移除 `--check`。不可覆寫整個 runtime 目錄。

## 測試證據

- `node --test tests/report-upload-contract.test.cjs`：73/73 passed，含 `8/23 manual cutoff 8/22 -> 8/24 0824.xlsx cutoff 8/23 = newer-date`。
- `node --test report-automation/work/formal_website_publish_gate.test.mjs report-automation/work/phone_awards_permanent_contract.test.mjs`：25/25 passed。
- controlled Python runtime：日期契約 4/4、snapshot source contract 2/2、source freshness 4/4 passed。
- `node --test` KPI／台獎／Supervisor mapping contracts：51/51 passed；既有 Chromium 1193 的 KPI／台獎 Playwright：11/11 passed。
- 真實 8/24 `PHONE_AWARDS_VERIFY_SOURCE_ONLY=1`：blocked（原始 store mtime 為 2026-08-23）。

`runtime-tests/` 是本次 runtime 測試留存；`runtime-before/` 是修改前檔案備份。兩者都不是正式 runtime 目錄。
