# 行進間戰報 Design QA

- Source visual truth paths:
  - `/workspace/scratch/3729926cc24f/upload/2a10f964-c536-410c-b375-87b31f090913.png`
  - `/workspace/scratch/3729926cc24f/upload/4c3a026d-4d17-4627-a6c0-c5a5c298ec1d.png`
- Implementation screenshot path: cloud-browser inline captures from `live-battle.html?qa=1` in this QA run (the browser capture filesystem is isolated from the checkout).
- Viewport: 1330 × 936 CSS px, desktop, device scale 1.
- Source pixels: 1011 × 642 and 899 × 603. Implementation capture: 1330 × 936. Density normalization: visual regions compared at displayed CSS size; no browser chrome or source-image padding was judged.
- State: synthetic AQ／RT data loaded locally, formal target intentionally not loaded.

**Full-view comparison evidence**

- The generated first report visibly shows non-zero A／B／C／D values across AQ, A999, A1399, RT, R999 and R1399.
- Product table keeps model names and zero cells on one white surface; every store/device cell above zero uses a deep-purple background with bold white text.
- Gift table visibly shows only Chinese names such as `王克業`, without `DNB10146_5514709`.

**Focused region comparison evidence**

- Region export: A=5, B=11, C=6, D=10 for AQ in the browser-rendered Canvas; the zero-value regression is absent.
- Product headers show `Pixel 11 Pro`, `Galaxy S26`, `iPhone 17 Pro` and `Pixel Buds 2a`; Google／Samsung／Apple brand labels and brand-only parentheses are absent.
- Typography, spacing, table borders and semantic warning colors remain consistent with the existing dashboard; the requested device-count highlight is limited to positive store/product intersections.

**Findings**

- No actionable P0, P1 or P2 visual differences remain for the requested device-count highlighting.
- Browser console contained no application errors; only browser-extension metadata errors unrelated to the page.

**Comparison history**

- Earlier: staff identifiers were visible, product brand prefixes remained, and the region export showed zero AQ values; the subsequent neutral product table made positive counts hard to scan.
- Fix: retained name extraction, brand stripping and region normalization, then applied deep purple `#6741a5` with white text only when a store/product count is greater than zero.
- Post-fix: browser capture shows 15 positive cells highlighted while zeros remain white; 344 automated tests pass.

**Implementation checklist**

- [x] 承辦人只顯示姓名
- [x] 商品名稱移除品牌且不分色
- [x] 商品上線數大於 0 的格子以深紫底白字標註，0 維持白底
- [x] AQ／RT A／B／C／D 區域彙總可讀取
- [x] 既有頁面回歸與本機資料邊界通過

final result: passed
