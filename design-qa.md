# 行進間戰報 Design QA

> 歷史 QA evidence：本檔記錄單次驗證狀態，不是現行 Agent 規則或後續發布 gate。現行規則以 `AGENTS.md` 為準。

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


# 首頁白橘改版 Design QA — 2026-09-30

- Source visual truth: `../homepage-reference/北一二B_首頁白橘改版預覽.png` (Library `libfile_2388a8a9bcc48191916e9b957e7eca15`); actual pixels inspected before implementation.
- Target route: `home.html`, local isolated branch `codex/homepage-white-orange-reminders`, base `9a28f90c016fc823103a43f3f75a249adb95f562`.
- Intended states: public/unauthenticated desktop 1280×1300, wide 1920×1300, mobile 390×844 and 320×800; synthetic authenticated feeds are test-only.
- Implementation screenshot: unavailable. The cloud browser at `http://terminal.local:4173/home.html` returned 502/connection refused. Chromium launched by the repository's Playwright suite exited before test execution with `socket() failed: Operation not permitted`, including the supported escalated attempt.
- Source pixels: 1254×1254; implementation dimensions and density normalization could not be measured. No side-by-side or focused-region visual comparison was possible.

## Findings

- [P1 verification blocker] Browser-rendered visual and interaction evidence is missing. No application-level browser test result or screenshot can be claimed from launcher failures.
- No visual-match claim is made. Fonts/typography, spacing/layout rhythm, colors/tokens, image/icon fidelity and copy require rendered comparison at the listed viewports.
- Intentional scope additions relative to the reference: dated reminder carousel with manual/pause/reload controls above the four quick entries; auth-aware pending states. Brand mark is a bundled standard navigation icon; no official brand-logo claim.
- Static review: large white/orange layout, four quick links, two staff groups, separate department/B gold entries, and all 16 original tool links are present. All 43 icon references resolve to the repo's existing bundled Lucide library. White primary-action text uses the darker orange token for contrast.

## Comparison History

- First pass: source reference opened; cloud browser and executable Chromium attempts blocked before a rendered implementation was available. No visual fixes claimed based on unavailable screenshots.

## Required Verification Before Publication

1. Run `node --test tests/home-reminder-model.test.cjs tests/patrol-question-versions.test.cjs tests/patrol-dashboard-contract.test.cjs tests/patrol-dashboard-client.test.cjs` (30/30 passed locally).
2. Run `tests/home.spec.js` with the repo's Playwright config in a browser-capable environment and capture the designated screenshots. Test fixtures are synthetic and external calls must remain mocked.
3. Compare the rendered desktop/mobile results with the source reference; check keyboard focus, touch targets, horizontal overflow, readable wrapping, carousel pause/reduced-motion, search and navigation.
4. Check browser console errors; blocked Chromium launch does not establish a clean console.
5. On an authorized real origin, verify existing KPI session + Approved Device restore and patrol session restore against current live services. Confirm exact yesterday 21:00 data, partial reports, monthly visits and the current bimonthly window. Recheck visibility/logout/expiry/midnight transitions.
6. Preserve the existing security limitation disclosure: legacy daily `read` is not server-authenticated; this homepage retains `private_access` before it and makes no backend/auth changes.

## Result

final result: blocked


## 首頁 QA 更新 — GitHub Chromium 驗證已完成

- Candidate code: `941a7239e37b71f4e92351f5da1b56c098b4f590`; draft PR https://github.com/lian852456-dot/liamlu/pull/125
- Exact-commit run: https://github.com/lian852456-dot/liamlu/actions/runs/36688880098
- Result: 30 contract tests + 33 Playwright browser tests passed; screenshot artifact ID `11084254781`, SHA-256 `d3ae87ccec497683e9e52e88400630e7c9ba2c690e7103674e263f248a752710` verified after download.
- Source: 1254×1254 reference image noted above. Browser screenshots: `../homepage-ci-evidence/test-results/homepage/desktop-1280-unauthenticated.png` (1280×1449, 1280×1300 CSS viewport); `mobile-390-unauthenticated.png` (390×2429, 390×844 CSS viewport); `wide-1920-unauthenticated.png` (1920×1475, 1920×1300 CSS viewport). Device scale 1.
- Full comparison: `../homepage-ci-evidence/comparison-desktop.png` combines both actual images; 1280px capture normalized to 1254px width. Added reminder height intentionally changes page height. Focused comparison: `../homepage-ci-evidence/comparison-quick-entries.png` compares the four primary entries using real image crops, not recreated UI.
- Source and rendered results were actually opened and compared. Public screenshots show unauthenticated state; synthetic sales/patrol screenshots were inspected only as synthetic interaction evidence, never as live figures.

### Fidelity surfaces

- Typography: strong sans-serif heading hierarchy and readable card labels preserved; Noto CJK rendering verified. Mobile names wrap without clipping. Minor P3: the long gold-detail title may wrap its last character on narrow cards; this is readable and non-blocking.
- Layout/rhythm: compact masthead, orange primary card, four common entries, two staff groups and separate supervisor management cards match the reference structure. Added reminder, wider 1920px content and stacked mobile groups are intentional scope changes. No horizontal overflow at 1280, 390 or 320px.
- Colors/tokens: white/soft-gray surfaces and orange hierarchy retained; teal staff-operations group retained. Primary CTA uses darker orange than the mock to support white-text contrast.
- Icons/assets: existing bundled Lucide outline icons remain sharp; standard navigation mark and chart/medal variants are intentional production-safe icon substitutions, not official brand marks. No placeholder imagery or external icon dependencies.
- Copy/content: all 16 tool destinations preserved, department vs B-region gold labels distinct. Pending/authenticated reminder copy and dates were checked. No fabricated production metrics.

### Interaction verification

All 33 tests passed: 16 links, responsive widths, search clear/empty, same-page navigation, 5-second rotation/manual/pause/focus/hover/reduced-motion, missing/denied credentials, session-only identity, valid/error/empty/stale/partial source fixtures, old-response races, hidden-page clearing, refresh, expiry, and Taipei midnight rollover. Public-page test captured no uncaught page errors; expected mocked transport errors are intentional test states, not a claim about production console health.

### Remaining scope limits

No merge or deployment. No live credentials used. Real-origin KPI Approved Device, patrol sessions and current production source data still require authorized live verification. Local cloud-browser preview remains unavailable; these are actual GitHub Actions Chromium renders. The existing daily read server-side-auth limitation remains unchanged and disclosed.

Latest visual result: no actionable P0/P1/P2 findings; the narrow gold-title wrap is P3 only.

final result: passed
