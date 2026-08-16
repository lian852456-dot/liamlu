const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const standalone = fs.readFileSync(path.join(root, 'kpi-battle.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');

test('獨立頁只承載原 index KPI 面板，不複製資料、權限或計算邏輯', () => {
  assert.match(standalone, /<iframe[^>]+src="index\.html"/);
  assert.match(standalone, /switchTab\('kpi-battle'\)/);
  assert.match(standalone, /frameWindow\.loadKpiBattle\(\)/);
  assert.doesNotMatch(standalone, /kpiButton\.click\(\)/);
  assert.doesNotMatch(standalone, /kpicalc_access|private_access|private_request|private_admin_approve/);
  assert.doesNotMatch(standalone, /function\s+(?:kpicalcMetric|kpicalcToKpiBattleView|mergeKpiBattleSupplement|renderKpiBattle)/);
  assert.doesNotMatch(standalone, /localStorage\.(?:getItem|setItem)/);
});

test('獨立頁載入失敗時 fail-closed，只提供回到原 KPI 戰情的連結', () => {
  assert.match(standalone, /function failClosed\(\)/);
  assert.match(standalone, /page\.classList\.add\('frame-error'\)/);
  assert.match(standalone, /<a href="index\.html">每日回報內的 KPI 戰情<\/a>/);
  assert.doesNotMatch(standalone, /假資料|demo data|fallbackData|mockData/);
});

test('同仁大廳第一張卡為 KPI 戰情，原入口仍保留原連結', () => {
  const staff = home.match(/<nav class="board" aria-label="同仁大廳">([\s\S]*?)<\/nav>/)?.[1] || '';
  const hrefs = Array.from(staff.matchAll(/<a class="card" href="([^"]+)"/g), match => match[1]);
  assert.deepEqual(hrefs, [
    'kpi-battle.html',
    'index.html',
    'kpi.html',
    'kpitry.html',
    'https://twm-store-inspection.liamlu245.chatgpt.site/',
  ]);
});
