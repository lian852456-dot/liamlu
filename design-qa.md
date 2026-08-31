# 行進間戰報 Design QA

- Source visual truth paths:
  - `/workspace/scratch/3729926cc24f/upload/9127525a-9be2-4198-a1c6-c7465a81e229.png`
  - `/workspace/scratch/3729926cc24f/upload/f317ef44-ff9d-46cf-b85a-615cfa7160ea.png`
- Implementation URL: `https://lian852456-dot.github.io/liamlu/live-battle.html`（已部署；正式 runtime 與候選 SHA-256 一致）。
- Implementation screenshot path: unavailable; the required cloud-browser runtime timed out during connection setup and could not be reset during this QA run.
- Intended viewport: desktop 1365 × 900 CSS px, device scale 1.
- Source pixels: nine-store PNG 1466 × 904; supervisor AQ／RT PNG 974 × 415.
- State: parsed AQ／RT report with nine-store metrics plus A／B／C／D supervisor detail; user requires every non-zero achievement to be visibly highlighted and the supervisor source collision corrected.

**Findings**

- [P1] Browser-rendered comparison is unavailable.
  - Location: STEP 3 supervisor AQ／RT detail, nine-store table, and the first/third downloadable PNG.
  - Evidence: both nationwide source images were opened at original resolution, but the implementation could not be captured because the required cloud-browser connection itself timed out.
  - Impact: typography, horizontal scrolling, header density, nationwide total emphasis, unique 北一二B emphasis and Canvas export cannot be visually signed off from code or tests alone.
  - Fix: reopen the local preview in a fresh cloud-browser session, load the nationwide fixture, capture both visible tables and first PNG state, then compare them together with the two source images.

**Code-level evidence (not a substitute for visual QA)**

- A region-summary candidate is now rejected whenever its header also contains a store/location column; this prevents the last store row in each region from replacing the A／B／C／D summary.
- Non-zero count cells receive `metric-hit`; light rows use `#d9f3e8`, while the 北一二B deep-blue row uses `#087a60`. Zero cells retain their original background. Rank cells are not treated as achievements.
- The same hit logic is used in the first supervisor AQ／RT Canvas PNG and third nine-store Canvas PNG.
- 347 automated tests pass; tests include the store-detail/region-summary collision, nationwide and regional parsing, full AQ／RT plan bands, existing-system isolation, syntax and package audit.

**Required fidelity surfaces**

- Fonts and typography: not visually verified.
- Spacing and layout rhythm: not visually verified.
- Colors and visual tokens: non-zero light green and 北一二B deep green are implemented but not visually verified.
- Image quality and asset fidelity: no new raster assets are required; Canvas PNG output is not visually verified.
- Copy and content: column order is contract-tested; visible wrapping and density are not visually verified.

**Primary interactions tested**

- Automated parser and renderer contracts pass.
- Browser file selection and rendered-table inspection were attempted but blocked by the stalled cloud-browser session.
- Browser console errors could not be checked for this build.

**Implementation checklist**

- [x] Reject store-detail tables as A／B／C／D region summaries
- [x] Highlight non-zero supervisor and nine-store metrics
- [x] Apply matching colors to first and third Canvas PNG exports
- [x] 347 automated tests and zero package vulnerabilities
- [ ] Fresh cloud-browser capture and combined source/implementation visual comparison

final result: blocked

Deployment note: Liam 已先授權「隔離檢查通過即可部署、不用再詢問」。GitHub Pages run `33388025723` 成功，正式 commit `6cf2c33` 已發布，四個 runtime 檔案 SHA-256 與候選一致；cloud-browser 仍連線逾時，因此 `final result` 維持 blocked，部署與自動化回歸不取代缺少的瀏覽器視覺比對。
