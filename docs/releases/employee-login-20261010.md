# Employee password login release — 2026-10-10

The existing approved-device path remains available. Password login uses the existing single Daily owner, preserves native revoked/inactive/pending/denied states, binds the first eligible device, and keeps the 30-minute session proof only in browser memory. Logout records durable revocation. Existing complete nine-store roster synchronization renews the password authority for 48 hours; missing configuration or incomplete sources fail closed.

The repository GAS template keeps both release gates off by default, so copying it to an unprovisioned project cannot enable authentication. The named formal versions explicitly enable the reviewed owner/password gates; the 21-test runtime suite verifies that enabled path. Cloud rollout uses exact deployed sources, not a whole-project replacement from this repository:

- Daily v52 → owner-only v54 → password-enabled v55. Only main Code changed. Original 26 properties were preserved byte-for-byte, including the empty automation revocation property. The user installed the verifier; no credentials are committed.
- Protected A v90 → owner-only v93 → v94. The frozen `TradeinReleaseA` module also dispatches auth routes; `gas/patches/TradeinReleaseA-auth-owner.patch` is the minimal auth overlay on that exact module. The zero-context overlay applies with `git apply --unidiff-zero` only to the verified v90 module; reproducing it matches the deployed module byte-for-byte. Public trade-in functions are unchanged. The root Code owner adapters supply the shared implementation.
- Protected upload B v86 → v92; upload isolation still rejects auth actions.
- Protected audit v67 → v91; existing-member status reaches Daily through the original RPC contract.

All original versions remain available. To close password access, return Daily to owner-only v54; retain owner state, native generations, bindings, sessions and tombstones. Do not reset properties or blindly restore legacy authentication after password sessions have been issued. Frontend previous main: `4772988249407b23a30b4d7067a3d128f09e96c4`.

Validation before frontend publication: existing GAS password runtime 21/21; roster renewal 5/5; existing home/awards/session checks plus renewal 24/24; frozen A dispatcher 10/10. Actual Google isolated login/read/logout/revoke checks were recorded before archiving the isolated deployment; no reset or reseeding. Formal A accepts an existing member status query and rejects an unknown member through Daily, with owner RPC ledger receipt. Formal password status is enabled. These are not a claim that signed-in production website/APP or physical-device acceptance is complete; those require separate post-publication readback.
