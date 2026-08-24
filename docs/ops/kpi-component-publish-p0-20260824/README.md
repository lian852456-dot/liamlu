# 2026-08-24 P0 Phase 2：KPI component-level publish

## Scope

只解耦 `north12b-dashboard-private-latest.json` 的 KPI 與台獎 component 發布。
未修改 UI、`kpiBattleSupplementIsCurrent()`、`validateAwardsBattle()`、Supervisor App
`kpiSupplementIsCurrent()`／`adaptAwards()`、Approved Device、authentication、TTL、巡店或稽核。

## Design

- 新增管理者限定 action `private_publish_kpi_component`。
- Apps Script 端讀取現有 container 與 protected kpicalc，要求來源／截止日一致、
  protected KPI 為 9 店／40 人／25 items、supplement 為九店／40 人且排名、DOD、
  排名變動與加減分完整。
- 只替換 `kpiBattle`；`awardsBattle` payload 逐值保留並驗證 hash 不變。
- `components.kpi` 記錄 `fresh`、data-as-of、source、run ID 與 component publish time。
- KPI 與 awards 日期不同時，`components.awards` 記錄 `blocked`、原 data-as-of 與
  `upstream-source-not-updated`。不修改 awards payload 的日期、generated_at、source_files、
  hash 或 run ID。
- top-level `publishedAt` 只代表 container 寫入時間；既有 consumer 仍只用 component
  日期／來源 gate 判斷 freshness。

## Runtime

`runtime-before/` 是 Phase 2 前的實際 runtime；`runtime-after/` 是本次正式使用版本。
其中 `build_github_pages_data.py --kpi-only` 不讀寫 awards artifacts，並從正式 0824 source
重建九店及 40 人 supplement；`publish_kpi_component_data.mjs` 進行發布前後 protected
readback，且要求 awards JSON 與 hash 保持不變。

Phase 2 前 SHA-256：

- `build_github_pages_data.py`：`270448c0987373207f4d3f2033d0a42bb615815f66e9b8544832e9d985bee88f`
- `publish_private_dashboard_snapshot.mjs`：`6a0ce99b14c512354d3e9d3a985de36e50cf9419c6eb1910d8b1a4a973850683`
- `publish_formal_website_with_keychain.sh`：`4731d3f77918a901a8e404a3d11c1259b4031905d29103aa91b870983c329a7b`
- `gas/Code.gs`：`f588e1ea7666fd71cc76c08e9f0a7797061ecf775bfe7c4a02d63367a26b6773`

Phase 2 後 SHA-256：

- `build_github_pages_data.py`：`6f59e06470b706266f84400a73d534fa37335b9d786f20edacaf26ca32bc5a58`
- `publish_private_dashboard_snapshot.mjs`：`836af893058e8c2e8d69b0eccd1bc83f9e950c0fa021c130b313792772755570`
- `publish_formal_website_with_keychain.sh`：`9c210b0b479b7c43222435cd6a33b403031d2787fd2a08d1274467366414a9f6`
- `publish_kpi_component_data.mjs`：`b36b829c96b4c89c5375fa4776e2cd35531cb1ca9b1cc6fefb0616ce63a34b42`
- `kpi_component_publish.test.mjs`：`cf723ece0a60ee01866ed03c79bb3c3a04d10e9da18b2124306d92b09ef90f04`
- `gas/Code.gs`：`559cc33ae496c2bdf13c6b577dcbe2d66420e3748d447d83d2a112b564afd078`

## Regression evidence

- Repo 全部 Node contracts：257/257 passed（component/auth/frontend targeted subset 115/115）。
- Runtime component + formal publish + awards permanent contracts：28/28 passed。
- Python awards source freshness／snapshot source identity：7/7 passed。
- Website KPI／台獎與 Supervisor App Playwright：13/13 passed。
- KPI-only real 0824 rebuild：`0824.xlsx`、cutoff `2026-08-23`、9 店、40 人、
  店長 9／副店 11／業代 20；awards written=`false`。

## Rollback

1. Apps Script deployment 可切回 v32；v32 不包含 component publish action。
2. Runtime 只回復本目錄 `runtime-before/` 的三個同名檔案；刪除 Phase 2 新增的
   `publish_kpi_component_data.mjs` 與 `kpi_component_publish.test.mjs` 前，必須先停止使用
   `--kpi-component-only`。
3. 回復後先核對上列 Phase 2 前 SHA-256，再執行測試；不得回退 258f9d0 的 KPI cutoff
   或 awards freshness gate。
