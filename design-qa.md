# 行進間戰報 Design QA

- Source visual truth paths:
  - `/workspace/scratch/3729926cc24f/upload/6c6d5013-38bb-45aa-b4db-2fe3178f726b.png`
  - `/workspace/scratch/3729926cc24f/upload/9f37b826-f80a-4e3c-88d6-b98ad0a388e5.png`
- Implementation URL: `https://lian852456-dot.github.io/liamlu/live-battle.html`（已部署；正式 runtime 與本機候選 SHA-256 一致）。
- Implementation screenshot path: unavailable; the required cloud-browser runtime timed out during connection setup and could not be reset during this QA run.
- Intended viewport: desktop 1365 × 900 CSS px, device scale 1.
- Source pixels: AQ 1162 × 1165; RT 1136 × 1168.
- State: nationwide AQ／RT fixture covers the nationwide total, repeated department rows, all six plan bands, 好速, RT 提前續約 and RANK.

**Findings**

- [P1] Browser-rendered comparison is unavailable.
  - Location: STEP 3 nationwide AQ／RT detail tables and the first downloadable PNG.
  - Evidence: both nationwide source images were opened at original resolution, but the implementation could not be captured because the required cloud-browser connection itself timed out.
  - Impact: typography, horizontal scrolling, header density, nationwide total emphasis, unique 北一二B emphasis and Canvas export cannot be visually signed off from code or tests alone.
  - Fix: reopen the local preview in a fresh cloud-browser session, load the nationwide fixture, capture both visible tables and first PNG state, then compare them together with the two source images.

**Code-level evidence (not a substitute for visual QA)**

- The AQ table columns are: 部、合計、A999↑、A999↑占比、小A、A999、A1199、A1399、A1599、A1899、2699、好速、RANK AQ、RANK A999（RANK 依來源顯示）.
- The RT table columns are: 部、合計、R999↑、R999↑占比、小R、R999、R1199、R1399、R1599、R1899、R2699、好速、提前續約、RANK RT、RANK R999（RANK 依來源顯示）.
- 好速 is ordered immediately after 2699／R2699 in both the webpage renderer and first Canvas PNG.
- The source's nationwide total row is retained with a dark gray background. 北一二B uses deep blue only when the nationwide row can be uniquely matched; otherwise no row is guessed.
- 346 automated tests pass; tests include nationwide total and row parsing, full AQ／RT plan bands, RANK, 好速, 提前續約, store-table collision prevention, existing-system isolation, syntax and package audit.

**Required fidelity surfaces**

- Fonts and typography: not visually verified.
- Spacing and layout rhythm: not visually verified.
- Colors and visual tokens: implemented from the source palette but not visually verified.
- Image quality and asset fidelity: no new raster assets are required; Canvas PNG output is not visually verified.
- Copy and content: column order is contract-tested; visible wrapping and density are not visually verified.

**Primary interactions tested**

- Automated parser and renderer contracts pass.
- Browser file selection and rendered-table inspection were attempted but blocked by the stalled cloud-browser session.
- Browser console errors could not be checked for this build.

**Implementation checklist**

- [x] AQ／RT nationwide total, department rows, six-band and RANK parser
- [x] 好速 immediately after 2699／R2699
- [x] RT 提前續約 column
- [x] Nationwide webpage tables with explicit non-nationwide fallback
- [x] First downloadable Canvas PNG updated
- [x] 346 automated tests and zero package vulnerabilities
- [ ] Fresh cloud-browser capture and combined source/implementation visual comparison

final result: blocked

Deployment note: Liam was informed that visual QA was blocked and then explicitly instructed deployment. Automated `346/346` regression, zero-vulnerability audit, scoped-diff review, production SHA-256 parity and HTTP health checks passed; this does not replace the missing browser-rendered source comparison.
