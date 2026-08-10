# Liam Supervisor iOS App 1.0 Build Report

狀態日期：2026-08-11

## Identity

- Xcode project: `ios/LiamSupervisor/LiamSupervisor.xcodeproj`
- App display name: `Liam 情報站`
- Bundle ID: `com.liamlu.liamsupervisor`
- Version/build: `1.0 (1)`
- Deployment target: iOS 16.0
- Orientation: iPhone portrait
- Startup URL: `https://lian852456-dot.github.io/liamlu/app.html?native=1&release=7458c0e`
- Web origin: `https://lian852456-dot.github.io`
- Online App 1.1 commit: `7458c0e03a09b21502b87cf760052bbe366f0b73`

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
- App 1.1 release regression: PASS (121/121 Node tests; 3/3 Playwright formal/390x844 checks)
- Native startup URL regression: PASS (5/5 native-shell tests)
- Codex Security canonical diff report: PASS — 17/17 review receipts, complete coverage, 0 reportable findings, unresolved High 0／Medium 0
- Secret／WebView security scan: PASS — no embedded credential, JS bridge, ATS weakening, wildcard navigation or Cookie downgrade found
- Xcode toolchain: READY — Xcode 26.6 (`17F113`)
- Unsigned simulator/device compile: WAITING — Xcode reports no available Simulator runtime while installation finishes; asset compilation stops before a complete build result
- Device build/sign/install: WAITING — Keychain currently reports `0 valid identities found`

The missing Xcode/signing state is environmental. No OAuth, Cookie, Session, Approved Device, GAS, Sheet or formal write setting was changed to work around it.

## Formal-origin gate

App 1.1 Real Data is deployed through GitHub Pages at merge commit `7458c0e03a09b21502b87cf760052bbe366f0b73`. The Pages deployment run `31411578181` completed successfully. Edge readback confirms the App 1.1 HTML, `v=7` assets and `liam-supervisor-app-1-1-realdata-v2` service-worker cache. The native shell uses the version-pinned startup URL above and no longer targets the Pilot 1.0 release.

Live unauthenticated launch confirms `Liam Supervisor App 1.1` and `正式唯讀`. The formal six-module UI readback remains gated by the existing Approved Device / employee unlock and patrol short-lived session; no bypass or credential migration was introduced.

Therefore:

- Native shell/project readiness: PASS
- App 1.1 formal-origin deployment: PASS
- App 1.1 version-pinned startup URL: PASS
- Six-module post-deploy authenticated UI readback: WAITING for existing human unlock
- Simulator/device build: WAITING for full Xcode readiness
- Physical install and OAuth/session smoke test: WAITING for Xcode signing and Liam's iPhone

## Security receipt

- Scan ID: `0e72c62c-463e-4bd3-81d1-33a39adb87ab`
- Exact range: `df34f4b8b9f5a08a99eaf843cb7355e7c58c3736..03742f411589830e40a27b9ca32a7b3c503ee275`
- Snapshot: `codex-security-snapshot/v1:sha256:cbe18566220e21476de67015acd7f3a20f2f02ed48216b72836c35838b6c7e06`
- Final report: `/private/var/folders/7v/m5cj1k393jzcgqm965q213nh0000gn/T/codex-security-scans-2qO3HX/liam-supervisor-ios-app-1-0/03742f411589830e40a27b9ca32a7b3c503ee275_20260809T181256Z_q9rtrlln/report.md`
- Finalizer note: the workbench range-mode completion binding omitted the required `snapshotDigest`; the same scan's canonical artifacts were repaired with the deterministic diff digest above and sealed by the plugin's `finalize_scan_contract.py`.
