# Liam Supervisor App 1.1 Design QA

## Target

- Reference: `qa-assets/reference.png`
- Primary viewport: `390 × 844`
- Preview state: `app.html?preview=1&v=6`
- Visual direction: selected dark navy Supervisor dashboard, cyan data emphasis, amber award emphasis, red exception priority, compact cards and expandable rows.

## Visual comparison

- P0: none.
- P1: initial layout showed too little operational detail before expansion. Resolved by adding per-segment missing stores, formal failure summaries, district totals, and reported-store rows inside the 16:00／21:00 expansion.
- P1: initial award home card did not expose the required Top 2. Resolved by adding the two formally ranked 100% award models below the compact store list.
- P2: reference is denser than the implementation. Kept the slightly larger tap targets and progressive disclosure because the acceptance requires one-handed use, no horizontal scrolling, and readable 390px cards.
- P2: preview store names differ from the supplied visual. Intentional: preview uses the real North一二B nine-store roster while all values remain visibly synthetic.
- P1: KPI Battle originally stopped at six primary metrics. v6 preserves that quick summary and adds every KPI item supplied by the read-only snapshot, grouped by source category in two-column mobile cards.
- P1: Patrol progress originally assumed the calendar month. v6 requires formal period metadata or formal progress counts; when the source omits a verifiable period, the UI fails closed instead of inventing a month.
- P2: v6 raises primary reading text toward 16px and secondary/table text to 13–14px without changing the approved Home, Report, Schedule, Patrol-detail, or bottom-navigation architecture.

## Interaction QA

- Bottom navigation: Home, Battle, Report, Schedule, Patrol switch views.
- Home: 16:00／21:00 attention buttons expand current operations; KPI store rows expand six primary KPI fields.
- Home schedule: current date, nine-store working／off totals and three store rows are visible immediately; the control expands all nine stores and their shift summaries.
- Primary navigation: Home, Battle, Report, Schedule, Patrol. Personal／system settings is available only from the header profile button.
- Preview disclosure: the persistent amber banner says `Preview／示意資料` and explicitly states that the values are not formal operating data.
- Battle: KPI／Award and Region／Store controls render the correct summaries; store selector works.
- Battle KPI: Region and Store modes both render the full 25-item Preview fixture after the six-item quick summary; the source website remains a separate depth link.
- Report: 16:00／21:00 switch works; store rows expand individual formal failure content.
- Schedule: previous／today／next date controls and store filter work in Preview; formal mode retains existing authentication boundaries.
- Source links point only to existing `index.html` or `patrol.html` surfaces.

## Structural QA

- `window.innerWidth = 390`, `window.innerHeight = 844`.
- Horizontal overflow: `0px` in Home, Battle KPI, Battle Award, Report, Schedule, Patrol, and Personal／settings.
- Patrol dashboard: prominent progress bar, completed/expected, remaining, unvisited stores, attention count, and statistical period are visible before the unchanged Today／Store Status／Recent sections.
- Current-day schedule expanded rows: `9`; horizontal overflow remains `0px`.
- Home uses compact cards and rows; no large horizontal table.
- Warning and incomplete states precede normal information.
- UI uses vendored Lucide icons; no handcrafted SVG, emoji icon, or CSS illustration.
- Browser console errors: `0` after the final interaction pass.

## Read-only QA

- Fixed 12-module contract validates in Preview.
- Preview calls no formal endpoint.
- Runtime allowlists existing read/session actions only.
- No OAuth, Cookie, Session, Approved Device, GAS write, Sheet schema, KPI formula, award formula, or formal write path is changed.

final result: passed
