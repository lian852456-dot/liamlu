# Current-source playtest note

- Target candidate: `http://127.0.0.1:4734` (isolated full-character integration source).
- The current-source copy of `hair-v2-integration-browser.cjs` was executed without changing production code. Its walk/save assertion failed: the browser pose moved to `x=0.75,z=3.5`, while the server-side saved position remained `x=0,z=1.5,revision=1` at the assertion point.
- Presence diagnostics at failure: `inputMessages=21`, `outputMessages=117`, `persistedWrites=17`, `rejections=0`, `connections=1`.
- Root cause: the historical runner hardcoded cookie `city_blender_hair_v2_20261030`, while the current server issues `city_avatar_full_integration_20261030`. The browser therefore booted an auto-created guest while the assertion read a different server session's position. The raw failure above is intentionally retained.
- Corrected runner: `full-character-integration-current.cjs` derives the cookie name/value from the API `Set-Cookie`, asserts `browser profile.id === API session userId`, and writes `integration-browser-current.json`. Both Chromium and WebKit now pass walk, authoritative save/readback, reload position retention, multiplayer peer visibility, sofa interaction, renderer toggles, and no context loss.
- No formal data writes or deployment occurred.
- The separate historical integration/wardrobe/memory JSONs in this directory are retained as prior-source synthetic evidence and are not used to override this current-source result.
