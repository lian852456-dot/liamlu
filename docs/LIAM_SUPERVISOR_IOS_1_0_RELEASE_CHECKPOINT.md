# Liam Supervisor iOS 1.0 Release Checkpoint

Recorded: 2026-08-11 (Asia/Taipei)

## Rollback anchors

- Native branch: `feature/liam-supervisor-ios-app-1-0`
- Native launch baseline: `dd70ff2e41ef0d778cc3eacba3a85a5085bafadb`
- Native rollback tag: `liam-supervisor-ios-native-launch-baseline`
- Web App 1.1 branch: `feature/liam-supervisor-app-1-1`
- Web App 1.1 branch HEAD: `4ee61c8e0f9daac305c06cb03feed3ad97f5a8a8`
- Formal GitHub Pages `main`: `7458c0e03a09b21502b87cf760052bbe366f0b73`
- Formal Pages deployment run: `31411578181`

## Runtime binding

- Native startup URL: `https://lian852456-dot.github.io/liamlu/app.html?native=1&release=7458c0e`
- Formal delivery: GitHub Pages HTTPS; no Cloud Run service participates in the App 1.1 startup path.
- Daily report/KPI/award GAS deployment: the exact immutable deployment ID is pinned at `app.js:5` in the rollback tag.
- Schedule/patrol GAS deployment: the exact immutable deployment ID is pinned at `app.js:6` in the rollback tag.
- GAS source/deployment, Cloud configuration and formal data were not changed while creating this checkpoint.

## Signing baseline

- Bundle ID: `com.liamlu.liamsupervisor`
- Signing: Automatic / existing Apple Personal Team
- Deployment target: iOS 16.0
- Version/build: 1.0 (1)

Machine-local `xcuserdata` and `.DS_Store` are excluded from Git. They are not part of rollback state.
