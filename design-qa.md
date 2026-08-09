# Liam Supervisor App 1.1 Design QA

## Target

- Reference: `qa-assets/reference.png`
- Primary viewport: `390 × 844`
- Preview state: `app.html?preview=1&v=3`
- Visual direction: selected dark navy Supervisor dashboard, cyan data emphasis, amber award emphasis, red exception priority, compact cards and expandable rows.

## Visual comparison

- P0: none.
- P1: initial layout showed too little operational detail before expansion. Resolved by adding per-segment missing stores, formal failure summaries, district totals, and reported-store rows inside the 16:00／21:00 expansion.
- P1: initial award home card did not expose the required Top 2. Resolved by adding the two formally ranked 100% award models below the compact store list.
- P2: reference is denser than the implementation. Kept the slightly larger tap targets and progressive disclosure because the acceptance requires one-handed use, no horizontal scrolling, and readable 390px cards.
- P2: preview store names differ from the supplied visual. Intentional: preview uses the real North一二B nine-store roster while all values remain visibly synthetic.

## Interaction QA

- Bottom navigation: Home, Battle, Report, Patrol, My switch views.
- Home: 16:00／21:00 attention buttons expand current operations; KPI store rows expand six primary KPI fields.
- Battle: KPI／Award and Region／Store controls render the correct summaries; store selector works.
- Report: 16:00／21:00 switch works; store rows expand individual formal failure content.
- My: previous／today／next date controls and store filter work in Preview; formal mode retains existing authentication boundaries.
- Source links point only to existing `index.html` or `patrol.html` surfaces.

## Structural QA

- `window.innerWidth = 390`, `window.innerHeight = 844`.
- Horizontal overflow: `0px` in Home, Battle KPI, Battle Award, Report, Patrol, and My.
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
