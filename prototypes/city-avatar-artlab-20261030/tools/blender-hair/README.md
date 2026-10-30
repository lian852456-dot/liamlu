# Blender hair authoring

The user approved a standalone official Blender 4.5.15 LTS download in the workspace tool directory. No skill/add-on or system-wide installation was used.

- Official archive: https://download.blender.org/release/Blender4.5/blender-4.5.15-macos-arm64.dmg
- Official checksum file: https://download.blender.org/release/Blender4.5/blender-4.5.15.sha256
- Verified SHA-256: `bfbc0bda099d1ab7aef0992a584f872f58bed9bb491210ad45f9ca071aa2e688`
- `build_hair.py`: editable sculpt-volume cages, continuous bob foundation, subdivision, UV/color/normal/ORM texture generation, mobile simplification and one-primitive GLB export. Output `.blend` remains editable before modifiers are applied for GLB. No manual sculpting is claimed.
- Run Blender with `--background --factory-startup --python tools/blender-hair/build_hair.py` from the prototype directory. The runtime is an authoring tool only, never a website dependency.
- GLTFLoader and BufferGeometryUtils are unmodified source snapshots from https://github.com/mrdoob/three.js/tree/r170/examples/jsm, compatible with the existing r170 THREE singleton. `node tools/blender-hair/build-loader.cjs` wraps only GLTFLoader and its triangle-mode helper; no second THREE library or new framework is added. MIT license included.

The skin, face, eyes and body remain in the approved existing factory. Only hair meshes are exported. Rigid hair follows the existing head pivot; no rig/physics/alpha-card layers are introduced. Asset validation and same-light game screenshots are in `evidence/blender-hair-v1`.
