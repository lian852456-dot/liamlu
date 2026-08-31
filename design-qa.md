# 行進間戰報 Design QA

- Source visual truth paths:
  - `/workspace/scratch/3729926cc24f/upload/e0aafe4e-238e-467c-a717-9e6aeef1c6f5.png`
  - `/workspace/scratch/3729926cc24f/upload/ece271f5-371d-4210-a373-403e2224b5d7.png`
- Implementation screenshot path: cloud-browser inline captures from `live-battle.html?qa=1` in this QA run (the browser capture filesystem is isolated from the checkout).
- Viewport: 1348 × 926 CSS px, desktop, device scale 1.
- Source pixels: 1052 × 601 and 478 × 352. Implementation capture: 1348 × 926. Density normalization: visual regions compared at displayed CSS size; no browser chrome or source-image padding was judged.
- State: synthetic AQ／RT data loaded locally, formal target intentionally not loaded.

**Full-view comparison evidence**

- The generated first report visibly shows non-zero A／B／C／D values across AQ, A999, A1399, RT, R999 and R1399.
- Product table uses one white surface without category/hit background colors; non-zero values use weight only.
- Gift table visibly shows only Chinese names such as `王克業`, without `DNB10146_5514709`.

**Focused region comparison evidence**

- Region export: A=5, B=11, C=6, D=10 for AQ in the browser-rendered Canvas; the zero-value regression is absent.
- Product headers show `Pixel 11 Pro`, `Galaxy S26`, `iPhone 17 Pro` and `Pixel Buds 2a`; Google／Samsung／Apple brand labels and brand-only parentheses are absent.
- Typography, spacing, table borders and semantic warning colors remain consistent with the existing dashboard; only the requested product differentiation color was removed.

**Findings**

- No actionable P0, P1 or P2 visual differences remain for the three requested corrections.
- Browser console contained no application errors; only browser-extension metadata errors unrelated to the page.

**Comparison history**

- Earlier: staff identifiers were visible, product hit cells were colored, and the region export showed zero AQ values.
- Fix: added name extraction, brand stripping, neutral product cells, full-width region normalization, blank-region fallback, and cross-sheet region-summary merge.
- Post-fix: browser captures and 344 automated tests confirm the corrected visible states.

**Implementation checklist**

- [x] 承辦人只顯示姓名
- [x] 商品移除品牌且不分色
- [x] AQ／RT A／B／C／D 區域彙總可讀取
- [x] 既有頁面回歸與本機資料邊界通過

final result: passed
