# Full-character integration QA

## Scope

- Candidate source: `db15e88` hair V2 baseline plus the parent agent's isolated 4734 preview changes.
- No formal city deployment, formal data writes, model/GLB/source-art replacement, or commit/push was performed by this QA pass.
- Physical iPhone Safari acceptance remains open (`physicalIphoneUat=false`).

## Passed evidence

- `model-tests.txt`: 6/6 focused model/helper/resource tests passed. The face, original eyes, skin, body, animation, fallback, and version-switch contracts remain covered.
- `preservation-tests.txt`: approved V2 GLB, .blend, texture, face/body/animation, and shared server/presence/store source files remain byte-for-byte equal to the pinned `db15e88` baseline.
- `clearance.txt`: 310 head-clearance samples, minimum clearance `0.007039487056407057`, passed.
- `full-character-qa.json`: current 4734 source passed front/quarter/side/back full framing with no crop, no page errors, and no context loss. The V2 asset is parented under the actual head pivot; direct head yaw changed its world quaternion (`directHeadPivot=true`). There is no product-level head-look API (`productHeadLookControl=false`); camera orbit is not counted as head-turn acceptance.
- `performance-webkit.json`: current 4734 Mac WebKit at 390x844 passed old/V1/V2 synthetic mobile viewport checks, no errors/context loss. V2: 22,822 triangles, 729,448 model geometry bytes, frame P50/P95 `33/35 ms`.
- `wardrobe-browser-current.json`: current-source Mac WebKit synthetic wardrobe path passed outfit render, old/new renderer toggle, reload retention, and unchanged profile/wallet.
- `furniture-current.json`: current-source Chromium passed entering the sofa, sit animation (`legRotation=1.16`), leaving back outdoors, and no context loss.
- `integration-browser-current.json`: corrected current-source runner passed both Chromium and WebKit walk, authoritative save/readback, reload position retention, multiplayer peer visibility, sofa interaction, renderer toggles, and no context loss. It derives the cookie from `Set-Cookie` and records matching browser/API user IDs.
- `memory-current.json`: current 4734 source passed 40 swap cycles per Chromium/WebKit, GLB fallback, head turns, cache teardown, and flag rollback every 5 cycles. The new `setEnabled(false)→true` route was warmed before cycle 0. Total renderer geometries/textures plateaued at `18/13`; model geometry alternated between `729448` bytes/`22822` triangles and outfit-expanded `742496` bytes/`23200` triangles, with no cumulative growth. After teardown GLB live instances were `0`, cache ready `false`, textures dropped to `7`, and context remained valid.
- `multiplayer-flag-qa.json`: current 4734 Chromium passed renderer-local selected-peer opt-in. B visibly received A with `renderActorId`, V2 `blender-glb`, GLB parented under the head. A's profile update to pony/ocean propagated to B as procedural pony + ocean clothing, then bob/uniform returned to the actual V2 GLB. `setEnabled(false)` produced `legacy` without GLB; re-enable restored V2/GLB and preserved the peer profile. Unselected peers/NPCs were not changed by this test's allowlist.
- `integration-browser.json`, `wardrobe-browser.json`, `memory-browser.json`: prior-source synthetic Chromium/WebKit evidence remains available for walk, sofa interaction, wardrobe/reload, multiplayer visibility, 40 version-swap cycles, and teardown. These files are intentionally not treated as current-source proof where the current-source rerun below disagrees.

## Current-source issue

The first current-source rerun failed its walk/save assertion because the historical runner hardcoded `city_blender_hair_v2_20261030`, while the current server issues `city_avatar_full_integration_20261030`; browser and server were different guests. The raw failure and diagnosis are retained in `current-playtest-note.md`. The corrected cookie-derived runner now passes the full desktop-engine/mobile-viewport flow in both Chromium and WebKit; this does not replace physical iPhone Safari UAT.

##導入準備建議

1. Keep the renderer-only feature flag/allowlist; do not add avatar version fields to profiles, WebSocket packets, or save schema.
2. Keep GLB lazy loading with procedural fallback and release on every version/flag switch.
3. Preserve existing hair/outfit IDs and saved pose data; no migration is needed for the mesh asset.
4. Stage local player first, then an explicit selected-peer allowlist; leave unselected peers/NPCs on the original factory.
5. Roll back by disabling the flag and verify profile, wallet, inventory, furniture, pose, and multiplayer protocol are unchanged.
6. Resolve the current-source walk/save issue, then run physical iPhone Safari (including long walk, background return, memory pressure, and second-device peer view) before any formal-city cutover.
