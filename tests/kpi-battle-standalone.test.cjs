const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const standalone = fs.readFileSync(path.join(root, 'kpi-battle.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'kpi-battle-controller.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');

test('index 與獨立頁只掛載同一 KPI controller，不再以 iframe 遙控', () => {
  for (const page of [index, standalone]) {
    assert.match(page, /<script src="kpi-battle-controller\.js"><\/script>/);
    assert.match(page, /id="panel-kpi-battle"/);
    assert.match(page, /id="kpiBattleContent"/);
    assert.doesNotMatch(page, /function\s+(?:kpicalcMetric|kpicalcToKpiBattleView|mergeKpiBattleSupplement|renderKpiBattleStores|renderKpiBattlePersonal)/);
  }
  assert.doesNotMatch(standalone, /<iframe|frameWindow|frameLocator|kpiButton\.click\(\)/);
  for (const action of ['private_access', 'kpicalc_access', 'private_request', 'private_admin_approve']) {
    assert.match(controller, new RegExp(`action: '${action}'`));
    assert.doesNotMatch(index, new RegExp(`action: '${action}'`));
    assert.doesNotMatch(standalone, new RegExp(`action: '${action}'`));
  }
});

test('獨立頁載入失敗時 fail-closed，只提供回到原 KPI 戰情的連結', () => {
  assert.match(standalone, /function failClosed\(message\)/);
  assert.match(standalone, /未取得正式授權資料，因此不顯示任何 KPI 數值/);
  assert.match(standalone, /<a href="index\.html">每日回報內的 KPI 戰情<\/a>/);
  assert.match(controller, /function failClosed\(message\)/);
  assert.doesNotMatch(`${controller}\n${index}\n${standalone}`, /__KPI_BATTLE_DATA__|kpi-battle-latest|fallbackData|mockData/);
});

test('唯一 controller 固定 private_access → kpicalc_access，並包含 adapter、補值與 renderer', () => {
  const privateAccess = controller.indexOf("action: 'private_access'");
  const kpicalcAccess = controller.indexOf("action: 'kpicalc_access'");
  assert.ok(privateAccess >= 0 && kpicalcAccess > privateAccess);
  for (const name of ['kpicalcToKpiBattleView', 'mergeKpiBattleSupplement', 'renderStores', 'renderPersonal', 'render']) {
    assert.match(controller, new RegExp(`function ${name}\\(`));
  }
});

test('同仁大廳第一張卡為 KPI 戰情，原入口仍保留原連結', () => {
  const staff = home.match(/<nav class="board" aria-label="同仁大廳">([\s\S]*?)<\/nav>/)?.[1] || '';
  const hrefs = Array.from(staff.matchAll(/<a class="card" href="([^"]+)"/g), match => match[1]);
  assert.deepEqual(hrefs, [
    'kpi-battle.html',
    'awards-battle.html',
    'index.html',
    'kpi.html',
    'kpitry.html',
    'https://twm-store-inspection.liamlu245.chatgpt.site/',
  ]);
});
