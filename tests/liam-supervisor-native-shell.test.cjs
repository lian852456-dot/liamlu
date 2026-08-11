const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const nativeRoot = 'ios/LiamSupervisor';

test('true iOS Xcode project has the frozen identity and portrait iPhone target', () => {
  const project = read(`${nativeRoot}/LiamSupervisor.xcodeproj/project.pbxproj`);
  const plist = read(`${nativeRoot}/LiamSupervisor/Info.plist`);
  assert.match(project, /productType = "com\.apple\.product-type\.application"/);
  assert.match(project, /PRODUCT_BUNDLE_IDENTIFIER = com\.liamlu\.liamsupervisor/);
  assert.match(project, /IPHONEOS_DEPLOYMENT_TARGET = 16\.0/);
  assert.match(project, /TARGETED_DEVICE_FAMILY = 1/);
  assert.match(project, /CURRENT_PROJECT_VERSION = 1/);
  assert.match(plist, /<string>Liam 情報站<\/string>/);
  assert.match(plist, /UIInterfaceOrientationPortrait/);
});

test('WebView uses the persistent default store without a JS credential bridge', () => {
  const model = read(`${nativeRoot}/LiamSupervisor/SupervisorWebModel.swift`);
  const web = read(`${nativeRoot}/LiamSupervisor/SupervisorWebView.swift`);
  assert.match(model, /websiteDataStore = \.default\(\)/);
  assert.match(model, /javaScriptCanOpenWindowsAutomatically = false/);
  assert.doesNotMatch(`${model}\n${web}`, /WKScriptMessageHandler|addScriptMessageHandler|localStorage|document\.cookie|Bearer|client_secret/);
  assert.match(web, /SFSafariViewController/);
});

test('navigation is allowlisted, external HTTPS leaves WebView, and unsafe schemes are blocked', () => {
  const config = read(`${nativeRoot}/LiamSupervisor/AppConfig.swift`);
  const policy = read(`${nativeRoot}/LiamSupervisor/NavigationPolicy.swift`);
  assert.match(config, /https:\/\/lian852456-dot\.github\.io\/liamlu\/app\.html\?native=1&release=949b9a3/);
  assert.match(config, /accounts\.google\.com/);
  assert.match(policy, /guard scheme == "https"/);
  assert.match(policy, /host == AppConfig\.appHost/);
  assert.match(policy, /url\.path == appPath/);
  assert.match(policy, /AppConfig\.oauthHosts\.contains\(host\)/);
  assert.match(policy, /return \.externalBrowser/);
  assert.match(policy, /return \.blocked/);
  assert.doesNotMatch(policy, /hasSuffix|contains\(AppConfig\.appHost\)/);
});

test('Native shell has loading, refresh, offline, foreground and process-restart recovery', () => {
  const view = read(`${nativeRoot}/LiamSupervisor/ContentView.swift`);
  const model = read(`${nativeRoot}/LiamSupervisor/SupervisorWebModel.swift`);
  const web = read(`${nativeRoot}/LiamSupervisor/SupervisorWebView.swift`);
  const app = read(`${nativeRoot}/LiamSupervisor/LiamSupervisorApp.swift`);
  assert.match(view, /ProgressView/);
  assert.match(view, /wifi\.slash/);
  assert.match(view, /Button\(action: model\.refresh\)/);
  assert.match(model, /reloadFromOrigin/);
  assert.match(app, /scenePhase/);
  assert.match(web, /webViewWebContentProcessDidTerminate/);
  assert.match(web, /await Task\.yield\(\)/);
  assert.doesNotMatch(web, /func webView[^}]+model\.(?:isLoading|errorMessage)\s*=/s);
});

test('ATS is not weakened and no secret-like native material is embedded', () => {
  const plist = read(`${nativeRoot}/LiamSupervisor/Info.plist`);
  const files = fs.readdirSync(path.join(root, nativeRoot, 'LiamSupervisor')).filter(file=>file.endsWith('.swift')).map(file=>read(`${nativeRoot}/LiamSupervisor/${file}`)).join('\n');
  assert.doesNotMatch(plist, /NSAllowsArbitraryLoads|NSExceptionAllowsInsecureHTTPLoads/);
  assert.doesNotMatch(files, /AIza[0-9A-Za-z_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|client_secret|refresh_token/);
});
