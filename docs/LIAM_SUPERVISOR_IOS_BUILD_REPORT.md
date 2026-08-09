# Liam Supervisor iOS App 1.0 Build Report

狀態日期：2026-08-10

## Identity

- Xcode project: `ios/LiamSupervisor/LiamSupervisor.xcodeproj`
- App display name: `Liam 情報站`
- Bundle ID: `com.liamlu.liamsupervisor`
- Version/build: `1.0 (1)`
- Deployment target: iOS 16.0
- Orientation: iPhone portrait
- Web origin: `https://lian852456-dot.github.io/liamlu/app.html`

## Implemented

- SwiftUI application lifecycle and full-screen WKWebView shell
- 1024px RGB App icon and generated launch screen assets
- persistent `WKWebsiteDataStore.default()` for existing secure Web session behavior
- explicit refresh, loading, offline/error and web-process recovery states
- foreground recovery without forced session destruction
- exact-host navigation policy; external HTTPS uses `SFSafariViewController`
- no JS bridge, embedded credential, ATS weakening or arbitrary URL load
- native unit-test target for navigation policy

## Current build gate

- Project／plist／asset JSON parse: PASS
- Swift syntax parse: PASS
- Native static security tests: PASS
- Web regression: PASS (123/123 Node tests; 2/2 Playwright 390x844 checks)
- Codex Security canonical diff report: PASS — 17/17 review receipts, complete coverage, 0 reportable findings, unresolved High 0／Medium 0
- Secret／WebView security scan: PASS — no embedded credential, JS bridge, ATS weakening, wildcard navigation or Cookie downgrade found
- Navigation policy typecheck／smoke: BLOCKED by mismatched Command Line Tools SDK/compiler
- Simulator build: WAITING — full Xcode is not installed
- Device build/sign/install: WAITING — no Apple Development signing identity and no connected Xcode device workflow

The missing Xcode/signing state is environmental. No OAuth, Cookie, Session, Approved Device, GAS, Sheet or formal write setting was changed to work around it.

## Formal-origin gate

The packaged shell currently points to `https://lian852456-dot.github.io/liamlu/app.html`. Read-only live inspection on 2026-08-10 shows that origin still serves **Liam Supervisor Pilot 1.0**, not the App 1.1 Real Data branch. App 1.1 remains isolated on `feature/liam-supervisor-app-1-1`; it was not merged to `main` or deployed without separate authorization.

Therefore:

- Native shell/project readiness: PASS
- App 1.1 formal-origin readiness: WAITING for explicit merge/deploy authorization
- Simulator/device build: WAITING for full Xcode
- Physical install and OAuth/session smoke test: WAITING for Xcode signing and Liam's iPhone

## Security receipt

- Scan ID: `0e72c62c-463e-4bd3-81d1-33a39adb87ab`
- Exact range: `df34f4b8b9f5a08a99eaf843cb7355e7c58c3736..03742f411589830e40a27b9ca32a7b3c503ee275`
- Snapshot: `codex-security-snapshot/v1:sha256:cbe18566220e21476de67015acd7f3a20f2f02ed48216b72836c35838b6c7e06`
- Final report: `/private/var/folders/7v/m5cj1k393jzcgqm965q213nh0000gn/T/codex-security-scans-2qO3HX/liam-supervisor-ios-app-1-0/03742f411589830e40a27b9ca32a7b3c503ee275_20260809T181256Z_q9rtrlln/report.md`
- Finalizer note: the workbench range-mode completion binding omitted the required `snapshotDigest`; the same scan's canonical artifacts were repaired with the deterministic diff digest above and sealed by the plugin's `finalize_scan_contract.py`.
