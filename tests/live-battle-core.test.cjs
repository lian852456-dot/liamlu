const assert = require('node:assert/strict');
const test = require('node:test');
const Core = require('../live-battle-core.js');

const names = Core.STORE_NAMES;
const sourceStores = names.map((name, index) => ({ name, code: `DNB${String(index + 1).padStart(3, '0')}` }));

function kpiFixture() {
  return {
    meta: { month: '2026-08', snapshotDay: 29, sourceFile: '0830.xlsx' },
    stores: sourceStores.map((store, index) => ({
      ...store,
      items: {
        [Core.AQ_KEY]: { a: index, t: 10 + index, reportRate: .5 },
        [Core.RT_KEY]: { a: index + 1, t: 20 + index, reportRate: .6 }
      }
    }))
  };
}

test('九店名稱與台北前綴使用 canonical 名稱', () => {
  assert.equal(Core.normalizeStore('台灣大哥大台北通化門市'), '通化');
  assert.equal(Core.normalizeStore('台北三創'), '台北三創');
  assert.equal(Core.normalizeStore('三創服務中心'), '台北三創');
});

test('AQ 依點數欄加總、依案件編號去重，且只留北一二B店點', () => {
  const matrix = [
    ['案件類型', '營業點代碼', '受理編號', '上線點數'],
    ['AQ新申裝', 'DNB001', 'A-1', 1.5],
    ['AQ新申裝', 'DNB001', 'A-1', 1.5],
    ['AQ新申裝', 'DNB002', 'A-2', 2],
    ['AQ新申裝', 'OTHER', 'A-3', 99]
  ];
  const result = Core.parseMatrix(matrix, { kind: 'aq', fileName: 'AQ.csv', stores: sourceStores });
  assert.equal(result.totals.通化, 1.5);
  assert.equal(result.totals.酒泉, 2);
  assert.equal(result.meta.processedRows, 2);
  assert.equal(result.meta.duplicateRows, 1);
  assert.equal(result.meta.mode, 'points');
});

test('RT 沒有點數欄時以唯一明細列計件', () => {
  const matrix = [
    ['案件類型', '門市', '交易序號'],
    ['RT續約', '台北三創服務中心', 'R-1'],
    ['RT續約', '台北三創服務中心', 'R-2'],
    ['RT續約', '萬大', 'R-3']
  ];
  const result = Core.parseMatrix(matrix, { kind: 'rt', fileName: 'RT.csv', stores: sourceStores });
  assert.equal(result.totals['台北三創'], 2);
  assert.equal(result.totals.萬大, 1);
  assert.equal(result.meta.mode, 'rows');
});

test('Big5／CP950 CSV 可解碼並保留中文表頭與店名', () => {
  const bytes = Buffer.from('aaf9a5ab2ca457bd75c249bcc60ab371a4c62c320a', 'hex');
  const source = Core.decodeCsv(bytes);
  assert.match(source, /門市,上線點數/);
  const matrix = Core.parseDelimited(source, Core.separatorFor(source, 'AQ.csv'));
  assert.deepEqual(matrix[1], ['通化', '2']);
});

test('AQ 與 RT 選反時 fail closed', () => {
  assert.throws(() => Core.parseMatrix([['門市'], ['通化']], { kind: 'aq', fileName: 'RT.csv', stores: sourceStores }), /疑似 RT/);
  assert.throws(() => Core.parseMatrix([['門市'], ['通化']], { kind: 'rt', fileName: 'AQ.csv', stores: sourceStores }), /疑似 AQ/);
});

test('達成率只用正式 target 與本機檔 actual，產生九店缺口與群組文字', () => {
  const targets = Core.extractTargets(kpiFixture());
  const aq = { totals: Object.fromEntries(names.map((name, index) => [name, index === 0 ? 1 : 20])) };
  const rt = { totals: Object.fromEntries(names.map((name, index) => [name, index === 0 ? 2 : 40])) };
  const analysis = Core.analyze(aq, rt, targets);
  assert.equal(analysis.stores.length, 9);
  assert.equal(analysis.priority[0].name, '通化');
  assert.equal(analysis.stores[0].aqGap, 9);
  assert.equal(analysis.stores[0].rtGap, 18);
  const message = Core.composeMessage(analysis, { timeLabel: '16:20' });
  assert.match(message, /行進間戰報｜16:20/);
  assert.match(message, /通化｜AQ 1\/10/);
  assert.match(message, /本機 AQ／RT 即時檔解析/);
});

test('正式 KPI 缺店或缺 target 時拒絕冒算達成率', () => {
  const missingStore = kpiFixture();
  missingStore.stores.pop();
  assert.throws(() => Core.extractTargets(missingStore), /8\/9 店/);
  const missingTarget = kpiFixture();
  missingTarget.stores[0].items[Core.AQ_KEY].t = null;
  assert.throws(() => Core.extractTargets(missingTarget), /缺少部分 AQ／RT 目標/);
});
