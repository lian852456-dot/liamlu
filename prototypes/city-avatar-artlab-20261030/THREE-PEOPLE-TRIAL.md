# Independent three-person portrait trial

This candidate derives three anonymous render presets from the approved Blender V2 integration. It is a separate preview and a separate SQLite world. The prior city, its owners, wallet, inventory, furniture, purchases and saved positions are unchanged. No portrait reward is issued by this candidate.

## Rendering and authoring

- `avatar-portraits.js` derives the approved factory, retaining original eye geometry, 2.5-head body, shoulder/neck structure, gesture pivots and animation. Only personalized face contours, skin/hair tones, hair assets, glasses and existing clothing colors differ.
- `portrait-config.js` exposes opaque keys `a/b/c`, not employee numbers or source photos. Source photographs remain outside the repository and static server.
- `tools/blender-portraits/build_portrait_hair.py` produces editable `.blend` files and actual Blender-exported GLB hair assets. Authoring uses editable volume cages and a continuous flowing foundation, not a manual sculpt or automatic photogrammetry claim.
- One opaque material per hairstyle; embedded 512² base color and 256² normal/ORM textures. No transparent cards, strand simulation, added lights, or additional postprocessing. Texture atlases are shared between loaded portrait assets.
- Preview camera framing is reapplied after a canvas resize; direct game input leaves preview focus. This is confined to the independent preview controls.
- The local `avatar-personal-candidate.js` dispatcher uses the existing synchronized `avatarPreset` field. It wraps the local player and player peers; NPCs retain their original renderer. Generic comparison and feature rollback remain available.

## Run without publishing personal information

Use the existing project Node runtime. Create an ignored `.private-people-config/people.json`, readable only by its owner, with exactly three active rows. Each row requires `key`, `employeeId`, `nickname`, `active: true`, and `preset: portrait-trial-<key>-v1`. Keep real employee IDs and names out of tracked fixtures. The server also accepts injected synthetic `people` rows for tests.

`node people-server.mjs` starts the isolated local preview on loopback port 4744. `node start-people-preview.mjs` uses independent ports 4745/4746 and its own ignored public-trial data directory. It reuses the previously authorized free tunnel binary and shuts down at 2026-10-31 15:59 UTC (Taipei 23:59). It does not start or restart the original city service.

The private allowlist maps each employee number to one stable trial UID. On this explicitly requested convenience path, an employee number is sufficient to open that trial role from another device. It is not proof of employment, and gives no formal website, reporting, employee binding, business building, durable credential or source-wallet access. Existing game operations apply only to the independent trial wallet. Unknown IDs and public guest creation are rejected. UI text explains this boundary and how to switch IDs.

## Verification

- `node --test people-server.test.mjs full-character-preservation.test.cjs avatar-portraits.test.cjs people-game-controls.test.cjs`
- `verify-people-preservation.mjs`: frozen approved assets, original shared entry and prior independent previews.
- `three-people-qa.cjs`, `three-people-qa-game.cjs`, `three-people-qa-toggles.cjs`: private-config runtime checks with masked evidence. Capture and identity receipts remain in ignored local evidence.
- `capture-three-people.cjs`, `capture-people-public.cjs`: actual browser-rendered views, not generated mockups.
- `readback-people-preview.mjs`: static file hashes and private-path denial.

Chromium and desktop WebKit results are synthetic browser evidence. They do not replace physical iPhone Safari acceptance. Browser resource counters measure retained renderer resources, not total iOS process memory or peak VRAM. Full-city background/reconnect and long-session device tests remain release gates.

## Future adoption and rollback

1. Obtain visual approval for each portrait and physical iPhone Safari acceptance, including long walks, background return, clothing changes, camera/head movement and two devices. Check shoulders/long hair during all supported interactions.
2. Stage immutable, hashed hair assets alongside existing files. Keep original assets and loader available; do not overwrite approved generic assets.
3. Match any existing city role through the authoritative employee/UID ownership contract. Never choose a similarly named account. No city role creation, deletion, merge, wallet migration, reward replay or gold deduction is part of this trial.
4. Enable a default-off render flag only for explicitly selected UIDs after approval. Use the already synchronized `avatarPreset`; retain current packet/save schema. Staging a preview does not authorize formal identity deployment.
5. Roll back the render flag to the existing renderer and immutable previous assets. Saves and ownership stay valid. The present independent preview can be stopped without touching the original city.

## Remaining visual limits

The presets are stylized interpretations on the approved common face/eye/body system. They are not scanned likenesses. Rear hair where no rear photograph exists is an inferred extension. Fine hair parting, natural tip flow and cloth detail remain below the original high-end art reference. Review each person's likeness before any adoption.
