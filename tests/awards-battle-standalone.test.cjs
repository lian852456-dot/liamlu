const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const standalone = fs.readFileSync(path.join(root, 'awards-battle.html'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'awards-battle-controller.js'), 'utf8');
const kpiControllerSource = fs.readFileSync(path.join(root, 'kpi-battle-controller.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');
const controller = require('../awards-battle-controller.js');
const kpiController = require('../kpi-battle-controller.js');

function awardItems(seed = 0) {
  return Array.from({ length: 13 }, (_, index) => ({
    display_name: `正式機型 ${index + 1}`,
    actual: seed + index,
    target: 20 + index,
    rate: (seed + index) / (20 + index),
    difference: seed - index,
    incremental_award: 100 + index,
    next_label: index === 12 ? '已達最高獎階' : `再 ${index + 1} 台解鎖`,
    threshold_target: 10 + index,
    store_reward_50: 1000 + index,
    store_reward_100: 2000 + index,
    district_reward_80: 3000 + index,
    district_reward_100: 4000 + index,
  }));
}

function fixture() {
  const stores = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
  return {
    report_date: '2026-08-16',
    phone_items: 13,
    store_rows: 10,
    supervisor: { actual_total: 9000, projected: 12000, rank: 21, award: 'Y' },
    overall: {
      store: '北一二B整體',
      award: { actual_total: 9000, projected: 12000, rank: 21, award: 'Y' },
      priorities: awardItems().slice(0, 3),
      items: awardItems(),
    },
    stores: stores.map((store, index) => ({
      store,
      award: { actual_total: 8000 - index * 500, projected: 10000 - index * 400, rank: 30 + index, award: index < 4 ? 'Y' : 'N' },
      priorities: awardItems(index).slice(0, 3),
      items: awardItems(index),
    })),
  };
}

test('index 與 standalone 只掛載唯一台獎 controller，沒有 iframe 或 DOM 遙控', () => {
  for (const page of [index, standalone]) {
    assert.match(page, /<script src="awards-battle-controller\.js"><\/script>/);
    assert.match(page, /id="panel-awards-battle"/);
    assert.match(page, /id="awardsBattleContent"/);
    assert.doesNotMatch(page, /function\s+(?:renderAwardPriority|renderAwardModel|renderAwardUnit)\s*\(/);
  }
  assert.doesNotMatch(standalone, /<iframe|frameWindow|frameLocator|\.click\(\)|window\.event|setTimeout|contentWindow|contentDocument/);
  assert.doesNotMatch(`${standalone}\n${controllerSource}`, /__AWARDS_BATTLE_DATA__|phone-awards-battle-latest|private-data\/|fallbackData|mockData/);
});

test('既有 Approved Device 流程仍固定 private_access → kpicalc_access，台獎 controller 不建立第二套 action', () => {
  const privateAccess = kpiControllerSource.indexOf("action: 'private_access'");
  const kpicalcAccess = kpiControllerSource.indexOf("action: 'kpicalc_access'");
  assert.ok(privateAccess >= 0 && kpicalcAccess > privateAccess);
  assert.doesNotMatch(controllerSource, /action:\s*['"](?:private_access|kpicalc_access|private_request|private_admin_approve)/);
  assert.doesNotMatch(standalone, /action:\s*['"]/);
});

test('正式台獎只接受同次 KPI 日期、13 款與九店完整資料', () => {
  const data = fixture();
  const kpi = { report_date: '2026-08-16', source_file: '0816.xlsx', supplement_synced: true };
  assert.deepEqual(controller.validateAwardsBattle(data, kpi), { ok: true, reason: '' });

  const wrongDate = controller.validateAwardsBattle({ ...data, report_date: '2026-08-15' }, kpi);
  assert.equal(wrongDate.ok, false);
  assert.match(wrongDate.reason, /日期 2026-08-15.*2026-08-16 不一致/);

  const missingStore = controller.validateAwardsBattle({ ...data, stores: data.stores.slice(0, 8) }, kpi);
  assert.equal(missingStore.ok, false);
  assert.match(missingStore.reason, /13 款、9 店/);

  const missingModel = controller.validateAwardsBattle({
    ...data,
    stores: data.stores.map((row, index) => index ? row : { ...row, items: row.items.slice(0, 12) }),
  }, kpi);
  assert.equal(missingModel.ok, false);
});

test('renderer 保留正式獎金、達成率、threshold、next target 與 unlock 提示', () => {
  const source = `${controller.renderAwardPriority(fixture().overall.priorities[0])}\n${controller.renderAwardModel(fixture().overall.items[0], true)}`;
  for (const expected of ['實際數', '目標數', '達成率', '差異數', '會增加多少獎金', '再 1 台解鎖', '80%目標', '北一二B 80%獎金', '北一二B 100%獎金']) {
    assert.match(source, new RegExp(expected));
  }
});

test('三創名稱只在顯示層縮短，獎金摘要金額固定單行', () => {
  for (const api of [controller, kpiController]) {
    assert.equal(api.displayStoreName('台灣大哥大台北三創'), '台北三創');
    assert.equal(api.displayStoreName('台灣大哥大數位生活台北三創'), '台北三創');
    assert.equal(api.displayStoreName('台北通化'), '台北通化');
  }
  assert.match(controllerSource, /value="\$\{row\.store\}"/);
  assert.match(controllerSource, /displayStoreName\(row\.store\)/);
  assert.equal((controllerSource.match(/award-summary-money/g) || []).length, 2);
  for (const page of [index, standalone]) {
    assert.match(page, /white-space:nowrap/);
    assert.match(page, /word-break:keep-all/);
    assert.match(page, /overflow-wrap:normal/);
  }
});

test('home 戰情入口順序固定 KPI 第一、台獎第二，原 index 台獎仍保留', () => {
  const kpiEntry = home.indexOf('href="kpi-battle.html"');
  const awardsEntry = home.indexOf('href="awards-battle.html"');
  const reportEntry = home.indexOf('href="index.html"');
  assert.ok(kpiEntry >= 0 && awardsEntry > kpiEntry && reportEntry > awardsEntry);
  assert.match(index, /id="panel-awards-battle"/);
  assert.match(index, /function loadAwardsBattle\(\)/);
});

test('standalone fail-closed 且不接觸 Freeze 產品入口', () => {
  assert.match(standalone, /function failClosed\(message\)/);
  assert.match(standalone, /未取得正式授權資料，因此不顯示任何台獎數值/);
  assert.match(controllerSource, /function failClosed\(message\)/);
  for (const forbidden of ['app.html', 'app.js', 'app.css', 'gas/Code.gs', 'kpi.html', 'patrol.html']) {
    assert.doesNotMatch(standalone, new RegExp(forbidden.replace('.', '\\.')));
  }
});
