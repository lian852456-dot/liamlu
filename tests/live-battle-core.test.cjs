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
        [Core.RT_KEY]: { a: index + 1, t: 20 + index, reportRate: .6 },
        [Core.KPI_KEYS.A999]: { a: index, t: 10 + index },
        [Core.KPI_KEYS.A1399]: { a: index, t: 6 + index },
        [Core.KPI_KEYS.R999]: { a: index, t: 12 + index },
        [Core.KPI_KEYS.R1399]: { a: index, t: 8 + index },
        [Core.KPI_KEYS['好速']]: { a: index / 2, t: 4 + index }
      }
    }))
  };
}

test('九店名稱與台北前綴使用 canonical 名稱', () => {
  assert.equal(Core.normalizeStore('台灣大哥大台北通化門市'), '通化');
  assert.equal(Core.normalizeStore('台北三創'), '台北三創');
  assert.equal(Core.normalizeStore('三創服務中心'), '台北三創');
  assert.equal(Core.normalizeRegion('北一二－C'), 'C');
  assert.equal(Core.normalizeRegion('北一二區Ａ'), 'A');
});

test('區域彙總工作表可補入 AQ A／B／C／D 數字', () => {
  const summary = Core.parseRegionSummary([
    ['2026/8/31', '', '', '', '', '', '', '', '', '', '', ''],
    ['區域', '長官', '合計', 'A999↑', 'A999↑佔比', '小A', 'A999', 'A1199', 'A1399', 'A1599', 'A1899', '2699', '好速'],
    ['北一二A', '翁長官', 25, 5, '20%', 20, 4, 0, 1, 0, 0, 0, 2],
    ['北一二B', '盧長官', 12, 3, '25%', 9, 1, 0, 2, 0, 0, 0, 1],
    ['北一二C', '虞長官', 25, 6, '24%', 19, 3, 0, 3, 0, 0, 0, 0],
    ['北一二D', '張長官', 33, 10, '30.3%', 23, 5, 1, 4, 0, 0, 0, 3]
  ], 'aq');
  assert.deepEqual(summary.recognizedRegions, ['A', 'B', 'C', 'D']);
  assert.equal(summary.regions.A.total, 25);
  assert.equal(summary.regions.B.metrics.A999, 3);
  assert.equal(summary.regions.C.metrics.A1399, 3);
  assert.equal(summary.regions.D.total, 33);
  assert.equal(summary.regions.B.breakdown.up999, 3);
  assert.equal(summary.regions.B.breakdown.small, 9);
  assert.equal(summary.regions.B.breakdown.bands['999'], 1);
  assert.equal(summary.regions.B.breakdown.bands['1399'], 2);
  assert.equal(summary.regions.B.metrics['好速'], 1);
});

test('含店點欄的明細表不得冒充督導區彙總表', () => {
  const detail = Core.parseRegionSummary([
    ['督導區', '店點名稱', '合計', 'A999↑', 'A999↑占比', '小A', 'A999', 'A1399', '2699', '好速'],
    ['北一二A', '台北甲店', 2, 1, '50%', 1, 0, 1, 0, 0],
    ['北一二A', '台北乙店', 9, 4, '44.4%', 5, 2, 2, 0, 1],
    ['北一二B', '通化', 3, 2, '66.7%', 1, 0, 2, 0, 1]
  ], 'aq');
  assert.equal(detail, null);
});

test('RT 區域彙總讀取完整資費帶、好速與提前續約', () => {
  const summary = Core.parseRegionSummary([
    ['部', '合計', 'R999↑', 'R999↑佔比', '小R', 'R999', 'R1199', 'R1399', 'R1599', 'R1899', 'R2699', '好速', '提前續約(不分資費)'],
    ['北一二A', 39, 12, '30.77%', 27, 4, 0, 6, 2, 0, 0, 3, 5],
    ['北一二B', 25, 4, '16%', 21, 1, 0, 3, 0, 0, 0, 2, 0],
    ['北一二C', 22, 7, '31.82%', 15, 0, 1, 5, 1, 0, 0, 1, 1],
    ['北一二D', 29, 6, '20.69%', 23, 2, 0, 4, 0, 0, 0, 4, 4]
  ], 'rt');
  assert.deepEqual(summary.recognizedRegions, ['A', 'B', 'C', 'D']);
  assert.equal(summary.regions.B.breakdown.up999, 4);
  assert.equal(summary.regions.B.breakdown.small, 21);
  assert.equal(summary.regions.B.breakdown.bands['1399'], 3);
  assert.equal(summary.regions.B.metrics['好速'], 2);
  assert.equal(summary.regions.B.breakdown.earlyRenewal, 0);
});

test('全國 AQ／RT 彙總保留所有部別列、資費帶、好速與排名', () => {
  const aq = Core.parseNationalSummary([
    ['', '', '', '', '', '', '', '', '', '', '', '', 'RANK', ''],
    ['部', '合計', 'A999↑', 'A999↑占比', '小A', 'A999', 'A1199', 'A1399', 'A1599', 'A1899', '2699', '好速', 'AQ', 'A999'],
    ['', 200, 63, '31.5%', 137, 37, 4, 18, 1, 0, 0, 9, null, null],
    ['北一一區', 2, 1, '50%', 1, 0, 0, 1, 0, 0, 0, 0, 34, 20],
    ['北一二區', 5, 2, '40%', 3, 1, 0, 1, 0, 0, 0, 2, 17, 7],
    ['北一二區', 6, 1, '16.7%', 5, 1, 0, 0, 0, 0, 0, 1, 10, 20],
    ['桃竹一區', 4, 2, '50%', 2, 2, 0, 0, 0, 0, 0, 0, 22, 7],
    ['中一區', 10, 2, '20%', 8, 0, 0, 2, 0, 0, 0, 1, 1, 7]
  ], 'aq');
  assert.equal(aq.processedRows, 5);
  assert.equal(aq.rows[1].department, '北一二區');
  assert.equal(aq.totalRow.department, '全國合計');
  assert.equal(aq.totalRow.total, 200);
  assert.equal(aq.totalRow.speed, 9);
  assert.equal(aq.rows[1].bands['1399'], 1);
  assert.equal(aq.rows[1].speed, 2);
  assert.equal(aq.rows[1].ranks.total, 17);
  assert.equal(aq.rows[1].ranks.up999, 7);
  assert.equal(aq.rows[1].up999Rate, .4);

  const rt = Core.parseNationalSummary([
    ['部', '合計', 'R999↑', 'R999↑佔比', '小R', 'R999', 'R1199', 'R1399', 'R1599', 'R1899', 'R2699', '好速', '提前續約(不分資費)'],
    ['北一一區', 39, 12, '30.77%', 27, 4, 0, 6, 2, 0, 0, 3, 5],
    ['北一二區', 25, 4, '16%', 21, 1, 0, 3, 0, 0, 0, 2, 0],
    ['北一二區', 22, 2, '9.09%', 20, 1, 0, 0, 1, 0, 0, 1, 1],
    ['桃竹一區', 23, 9, '39.13%', 14, 6, 0, 2, 1, 0, 0, 5, 5],
    ['中一區', 27, 9, '33.33%', 18, 5, 0, 4, 0, 0, 0, 2, 3]
  ], 'rt');
  assert.equal(rt.processedRows, 5);
  assert.equal(rt.rows[1].bands['1399'], 3);
  assert.equal(rt.rows[1].speed, 2);
  assert.equal(rt.rows[1].earlyRenewal, 0);
  assert.equal(Core.parseNationalSummary([
    ['督導區', '店點名稱', '合計', 'A999↑', 'A1399', '2699'],
    ['北一-A', '台北通化', 3, 1, 1, 0],
    ['北一-B', '台北酒泉', 4, 2, 1, 0],
    ['北一-C', '台北三創', 2, 1, 0, 0],
    ['北一-D', '台北萬大', 5, 2, 1, 0],
    ['北一-A', '台北永吉', 1, 0, 0, 0]
  ], 'aq'), null);
});

test('AQ／RT 原始檔保留北一二 A／B／C／D 區域總數與七項戰情', () => {
  const aq = Core.parseMatrix([
    ['案件類型', '督導區', '店點', '門號', '上線點數', '變更資費', '專案代號'],
    ['AQ新申裝', '北一二A', '其他A店', '0911000001', 1, '5G 1399', '一般'],
    ['AQ新申裝', '北一二B', '通化', '0911000002', 2, '5G 999', '好速500M'],
    ['AQ新申裝', '北一二C', '其他C店', '0911000003', 3, '5G 599', '一般'],
    ['AQ新申裝', '北一二D', '其他D店', '0911000004', 4, '5G 1399', '一般']
  ], { kind: 'aq', fileName: 'AQ.csv', stores: sourceStores });
  assert.equal(aq.regions.A.total, 1);
  assert.equal(aq.regions.A.metrics.A999, 1);
  assert.equal(aq.regions.A.metrics.A1399, 1);
  assert.equal(aq.regions.A.breakdown.bands['1399'], 1);
  assert.equal(aq.regions.B.total, 2);
  assert.equal(aq.regions.B.metrics['好速'], 2);
  assert.equal(aq.regions.C.total, 3);
  assert.equal(aq.regions.D.total, 4);
  assert.deepEqual(aq.meta.recognizedRegions, ['A', 'B', 'C', 'D']);

  const rt = Core.parseMatrix([
    ['案件類型', '督導區', '店點', '門號', '變更資費'],
    ['RT續約', '北一二A', '其他A店', '0922000001', '5G 999'],
    ['RT續約', '北一二B', '通化', '0922000002', '5G 1399'],
    ['RT續約', '北一二C', '其他C店', '0922000003', '5G 599'],
    ['RT續約', '北一二D', '其他D店', '0922000004', '5G 1399']
  ], { kind: 'rt', fileName: 'RT.csv', stores: sourceStores });
  const analysis = Core.analyze(aq, rt, null, { todayIso: '2026-08-31' });
  assert.equal(analysis.regions.B.aqActual, 2);
  assert.equal(analysis.regions.B.rtActual, 1);
  assert.equal(analysis.regions.D.metrics.R1399, 1);
  assert.equal(analysis.regions.B.aq.up999, 1);
  assert.equal(analysis.regions.B.aq.up999Rate, .5);
  assert.equal(analysis.regions.B.aq.speed, 2);
  assert.equal(analysis.regions.D.rt.bands['1399'], 1);
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
  assert.equal(result.regions.B.total, 3.5);
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

test('實際 AQ／RT 欄位拆出五項、商品與影音漏搭，並遮罩案件識別', () => {
  const aq = Core.parseMatrix([
    ['案件類型', '店點', '門號', '變更資費', '商品型號', '專案代號'],
    ['AQ新申裝', '通化', '0911111222', '5G 1399', 'Google Pixel 11 Pro (Google)', '一般專案'],
    ['AQ新申裝', '酒泉', '0922222333', '5G 999', 'SAMSUNG Galaxy S26 (台灣三星)', '好速500M']
  ], { kind: 'aq', fileName: 'AQ.csv', stores: sourceStores });
  assert.equal(aq.metrics.通化.A999, 1);
  assert.equal(aq.metrics.通化.A1399, 1);
  assert.equal(aq.metrics.酒泉.A999, 1);
  assert.equal(aq.metrics.酒泉['好速'], 1);
  assert.equal(aq.products.通化['Pixel 11 Pro'], 1);
  assert.equal(aq.products.酒泉['Galaxy S26'], 1);

  const rt = Core.parseMatrix([
    ['案件類型', '店點', '門號', '變更資費', '商品型號', '前台服務人員', '客戶分類', '合約編號', '專案代號'],
    ['RT續約', '通化', '0912345678', '5G 1399', 'Pixel 11 Pro', 'DNB10146_5514709 王克業', '一般戶', '主約', '提前續約'],
    ['RT續約', '通化', '0912345678', '5G 1399', '', 'DNB10146_5514709 王克業', '一般戶', 'KKBOX 3個月', '搭贈'],
    ['RT續約', '酒泉', '0923456789', '5G 599', 'Galaxy A57', '李小華', '企客', '主約', '一般續約']
  ], { kind: 'rt', fileName: 'RT.csv', stores: sourceStores });
  assert.equal(rt.metrics.通化.R999, 1);
  assert.equal(rt.metrics.通化.R1399, 1);
  assert.equal(rt.products.通化['Pixel 11 Pro'], 1);
  assert.equal(rt.giftAudit.length, 1);
  assert.deepEqual(rt.giftAudit[0].missing, ['MyVideo']);
  assert.equal(rt.giftAudit[0].caseId, '091***678');
  assert.equal(rt.giftAudit[0].earlyRenewal, true);
  assert.equal(rt.giftAudit[0].staff, '王克業');
});

test('影音漏搭只認明確 5G 599 型含以上，排除企客與 4G 案', () => {
  const rt = Core.parseMatrix([
    ['案件類型', '店點', '門號', '變更資費', '商品型號', '前台服務人員', '客戶分類', '合約編號', '專案代號'],
    ['RT續約', '通化', '0900000001', '5G 599', '一般商品', '王一', '一般戶', '主約', '一般續約'],
    ['RT續約', '酒泉', '0900000002', '5G 1399', '一般商品', '李二', '一般戶', '主約', '提前續約'],
    ['RT續約', '大稻埕', '0900000003', '4G 799', 'Pixel 11 Pro (5G)', '張三', '一般戶', '主約', '一般續約'],
    ['RT續約', '萬大', '0900000004', '4G 599', 'Galaxy A57 (5G)', '林四', '一般戶', '主約', '一般續約'],
    ['RT續約', '六張犁', '0900000005', '599', '一般商品', '陳五', '一般戶', '主約', '一般續約'],
    ['RT續約', '復興南', '0900000006', '5G 599', '一般商品', '周六', '企客', '主約', '一般續約'],
    ['RT續約', '杭州南', '0900000007', '4G升5G 999', '一般商品', '吳七', '一般戶', '主約', '一般續約']
  ], { kind: 'rt', fileName: 'RT.csv', stores: sourceStores });

  assert.deepEqual(rt.giftAudit.map(item => [item.store, item.plan, item.earlyRenewal]), [
    ['通化', 599, false],
    ['酒泉', 1399, true],
    ['杭州南', 999, false]
  ]);
  assert.ok(!rt.giftAudit.some(item => ['大稻埕', '萬大', '六張犁', '復興南'].includes(item.store)));
});

test('好速只計專案內容明確含好速的案件，不把一般寬頻或速率字樣誤算', () => {
  const rt = Core.parseMatrix([
    ['案件類型', '店點', '合約編號', '專案代號', '推薦人'],
    ['RT續約', '大稻埕', 'HS-1', 'VL656 (5G好速成專案)1399H+家用寬頻300Mbps', '王一'],
    ['RT續約', '杭州南', 'HS-2', 'VL014 (好速加掛案)家用寬頻1Gbps', '李二'],
    ['RT續約', '杭州南', 'HS-3', 'VO792 (企客_5G)好速成月租1099+全光速家用寬頻300Mbps續約專案', '董三'],
    ['RT續約', '酒泉', 'HS-4', 'VK919 (4G好速成專案)799H+家用寬頻60Mbps', '方四'],
    ['RT續約', '酒泉', 'HS-5', 'VL014 (好速加掛案)家用寬頻1Gbps', '賴五'],
    ['RT續約', '通化', 'HS-6', 'VL011 (好速加掛案)家用寬頻500Mbps', '郭六'],
    ['RT續約', '台北三創', 'NO-1', '一般家用寬頻500Mbps', '陳七'],
    ['RT續約', '萬大', 'NO-2', 'FTTH光纖1Gbps續約專案', '林八'],
    ['RT續約', '復興南', 'NO-3', '固網FBB 36M專案', '張九'],
    ['RT續約', '酒泉', 'NO-4', '家用寬頻1G加掛案', '吳十']
  ], { kind: 'rt', fileName: 'RT.csv', stores: sourceStores });

  assert.deepEqual(Object.fromEntries(sourceStores.map(store => [store.name, rt.metrics[store.name]['好速']])), {
    通化: 1,
    酒泉: 2,
    台北三創: 0,
    萬大: 0,
    六張犁: 0,
    復興南: 0,
    永吉: 0,
    大稻埕: 1,
    杭州南: 2
  });
  assert.equal(rt.regions.B.metrics['好速'], 6);
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

test('動態今日目標只用正式月目標、截至昨日實績與剩餘天數', () => {
  const targets = Core.extractTargets(kpiFixture());
  const aq = { totals: Object.fromEntries(names.map((name, index) => [name, index === 0 ? 1 : 20])), metrics: Object.fromEntries(names.map((name, index) => [name, { A999: index === 0 ? 1 : 20, A1399: index === 0 ? 0 : 10, '好速': 0 }])) };
  const rt = { totals: Object.fromEntries(names.map((name, index) => [name, index === 0 ? 2 : 40])), metrics: Object.fromEntries(names.map((name, index) => [name, { R999: index === 0 ? 2 : 20, R1399: index === 0 ? 0 : 10, '好速': 0 }])) };
  const analysis = Core.analyze(aq, rt, targets, { todayIso: '2026-08-30' });
  assert.equal(analysis.stores.length, 9);
  assert.equal(analysis.priority[0].name, '通化');
  assert.equal(analysis.dynamic.remainingDays, 2);
  assert.equal(analysis.stores[0].aqTodayGoal, 5);
  assert.equal(analysis.stores[0].aqGap, 4);
  assert.equal(analysis.stores[0].rtTodayGoal, 10);
  assert.equal(analysis.stores[0].rtGap, 8);
  assert.equal(analysis.stores[0].metrics.A999.todayGoal, 5);
  assert.equal(analysis.stores[0].metrics.A999.gap, 4);
  const message = Core.composeMessage(analysis, { timeLabel: '16:20' });
  assert.match(message, /行進間戰報｜16:20/);
  assert.match(message, /通化｜AQ上線缺4、A999缺4/);
  assert.match(message, /本機原始檔即時解析/);
});

test('AQ／RT 可先解析並產生目前上線預覽，不強制載入目標', () => {
  const aq = { totals: Object.fromEntries(names.map((name, index) => [name, index + 1])) };
  const rt = { totals: Object.fromEntries(names.map((name, index) => [name, index + 2])) };
  const analysis = Core.analyze(aq, rt, null, { todayIso: '2026-08-30' });
  assert.equal(analysis.dynamic.available, false);
  assert.equal(analysis.region.aqActual, 45);
  assert.equal(analysis.region.aqTarget, null);
  assert.equal(analysis.priority.length, 0);
  assert.match(Core.composeMessage(analysis, { timeLabel: '12:00' }), /A999目前0（尚未載入今日目標）/);
});

test('正式 KPI 較昨日落後一天時仍呈現差異並清楚提醒資料日', () => {
  const targets = Core.extractTargets(kpiFixture());
  const aq = { totals: Object.fromEntries(names.map(name => [name, 1])) };
  const rt = { totals: Object.fromEntries(names.map(name => [name, 1])) };
  const analysis = Core.analyze(aq, rt, targets, { todayIso: '2026-08-31' });
  assert.equal(analysis.dynamic.available, true);
  assert.equal(analysis.dynamic.staleDays, 1);
  assert.match(analysis.dynamic.notice, /較昨日落後 1 天/);
  assert.equal(analysis.stores[0].aqTodayGoal, 5);
  assert.equal(analysis.stores[0].aqGap, 4);
});

test('正式 KPI 月份不同或截止晚於昨日仍 fail closed', () => {
  const targets = Core.extractTargets(kpiFixture());
  assert.equal(Core.dynamicContext(targets.meta, '2026-09-01').available, false);
  targets.meta.snapshotDay = 31;
  assert.equal(Core.dynamicContext(targets.meta, '2026-08-30').available, false);
});

test('月目標已完成時今日目標為零且不列入追缺', () => {
  const fixture = kpiFixture();
  fixture.stores.forEach(store => {
    store.items[Core.AQ_KEY].a = store.items[Core.AQ_KEY].t;
    store.items[Core.RT_KEY].a = store.items[Core.RT_KEY].t;
    Object.values(Core.KPI_KEYS).forEach(key => { store.items[key].a = store.items[key].t; });
  });
  const targets = Core.extractTargets(fixture);
  const aq = { totals: Object.fromEntries(names.map(name => [name, 0])) };
  const rt = { totals: Object.fromEntries(names.map(name => [name, 0])) };
  const analysis = Core.analyze(aq, rt, targets, { todayIso: '2026-08-30' });
  assert.equal(analysis.stores[0].aqTodayGoal, 0);
  assert.equal(analysis.stores[0].aqGap, 0);
  assert.equal(analysis.priority.length, 0);
});

test('安全辨識資訊回傳結構、候選表頭與業務代碼，不回傳客戶姓名門號', () => {
  const matrix = [
    ['RT續約明細'],
    ['店點', '承辦人', '門號', '資費', '合約代碼'],
    ['萬大', '王小明', '0912345678', '599', 'SECRET-CODE']
  ];
  const inspection = Core.inspectMatrix(matrix);
  assert.equal(inspection.headerRow, 1);
  assert.deepEqual(inspection.headers, ['店點', '承辦人', '門號', '資費', '合約代碼']);
  assert.match(JSON.stringify(inspection), /SECRET-CODE/);
  assert.doesNotMatch(JSON.stringify(inspection), /王小明|0912345678/);
});

test('正式 KPI 缺店或缺 target 時拒絕冒算達成率', () => {
  const missingStore = kpiFixture();
  missingStore.stores.pop();
  assert.throws(() => Core.extractTargets(missingStore), /8\/9 店/);
  const missingTarget = kpiFixture();
  missingTarget.stores[0].items[Core.AQ_KEY].t = null;
  assert.throws(() => Core.extractTargets(missingTarget), /缺少部分 AQ／RT 目標/);
  const missingMetric = kpiFixture();
  missingMetric.stores[0].items[Core.KPI_KEYS.A999].t = null;
  assert.throws(() => Core.extractTargets(missingMetric), /缺少部分 A999／A1399／R999／R1399／好速/);
});
