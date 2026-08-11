# Liam Supervisor iOS App 1.0 Build Report

狀態日期：2026-08-11

## Identity

- Xcode project: `ios/LiamSupervisor/LiamSupervisor.xcodeproj`
- App display name: `Liam 情報站`
- Bundle ID: `com.liamlu.liamsupervisor`
- Version/build: `1.0 (1)`
- Deployment target: iOS 16.0
- Orientation: iPhone portrait
- Startup URL: `https://lian852456-dot.github.io/liamlu/app.html?native=1&release=949b9a3`
- Web origin: `https://lian852456-dot.github.io`
- Online App 1.1 commit: `949b9a3e745951efa5178dfe970decd00f09359a`

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
- Codex Security canonical diff reports: PASS — sealed App 1.1 Web report plus sealed `5/5` Native incremental receipts, 0 reportable findings, unresolved High 0／Medium 0
- Secret／WebView security scan: PASS — no embedded credential, JS bridge, ATS weakening, wildcard navigation or Cookie downgrade found
- Xcode toolchain: READY — Xcode 26.6 (`17F113`)
- Simulator build and XCTest: PASS — iPhone 17 Pro / iOS 26.5, `3/3` tests
- Generic iOS device-architecture compile: PASS — signing settings untouched
- Physical device signing/build/install/launch baseline: PASS — previously completed by Liam with the existing Personal Team profile

The missing Xcode/signing state is environmental. No OAuth, Cookie, Session, Approved Device, GAS, Sheet or formal write setting was changed to work around it.

## Formal-origin gate

App 1.1 Native unlock release is deployed through GitHub Pages at merge commit `949b9a3e745951efa5178dfe970decd00f09359a`. The Pages deployment run `31443650810` completed successfully. Edge readback confirms the App 1.1 HTML, `v=8` assets and `liam-supervisor-app-1-1-realdata-v3` service-worker cache. The native shell uses the version-pinned startup URL above and does not target the Pilot 1.0 release.

Live unauthenticated launch confirms `Liam Supervisor App 1.1` and `正式唯讀`. The formal six-module UI readback remains gated by the existing Approved Device / employee unlock and patrol short-lived session; no bypass or credential migration was introduced.

Final RC readback at `?native=1&release=949b9a3` confirms App 1.1, `v=8` assets, no Preview marker, an explicit `解鎖正式資料` CTA, no horizontal overflow and zero browser console errors. Unauthenticated output is intentionally locked; credentialed KPI／台獎／回報 and ptauth schedule／patrol readback remain `waiting-user` until Liam enters the existing credentials in the installed App.

## RC regression evidence

- Native Node contracts: `5/5 PASS`
- Navigation policy Swift smoke: `PASS`
- XCTest on iPhone 17 Pro / iOS 26.5 simulator: `3/3 PASS`
- Simulator build: `PASS`
- Generic iOS device architecture compile with signing untouched: `PASS`
- Simulator install／launch／force-quit reopen: `PASS`
- SwiftUI runtime warning `Publishing changes from within view updates is not allowed`: `0`
- Launch and reopen screenshots: `/private/tmp/liam-supervisor-rc-runtime.png`, `/private/tmp/liam-supervisor-rc-reopen.png`

Physical iPhone install is not re-declared by this RC run. Existing Personal Team signing and the prior physical-device build/install/launch remain unchanged; the next physical action is Liam's Xcode Run and in-App credential entry.

Therefore:

- Native shell/project readiness: PASS
- App 1.1 formal-origin deployment: PASS
- App 1.1 version-pinned startup URL: PASS
- Six-module post-deploy authenticated UI readback: WAITING for existing human unlock
- Simulator/device compile: PASS
- Physical reinstall and authenticated OAuth/session smoke test: `waiting-user` for Liam's Xcode Run and in-App credentials

## Security receipt

- Permanent report: `docs/security/LIAM_SUPERVISOR_IOS_1_0_FINAL_SECURITY_REVIEW.md`
- App 1.1 Web snapshot: `codex-security-snapshot/v1:sha256:0430846078b17af13b6fb99f8ab23f283d6d4ba86ee20c98162bc02b61c90d7e`
- Native incremental snapshot: `codex-security-snapshot/v1:sha256:0e089efbe4d6fc96c333992849aba9afd986b8d1e77085d43f3a9fe118059a89`
- Native sealed canonical manifest SHA-256: `dad25aa68448a03b69884fb2a05997a67b58179cf82c7a962d02961c03f62e1a`
- failed workbench completion was not retried; the official local finalizer's sealed canonical report is the final evidence.
