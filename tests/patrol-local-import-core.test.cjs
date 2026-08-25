const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../patrol-local-import-core.js');

const header = ['填表時間','到店時間','離店時間','區處別','營業點代碼','檢查店點','檢查人員','題號','檢查內容','是否合格','未查／不合格原因'];

function row({fill='2026/8/25 9:05', arrive='2026/8/25 9:00', leave='2026/8/25 10:00', code='DNB10082', store='台北永吉', item=2, result='v', reason='' }={}) {
  return [fill,arrive,leave,'北一二B',code,store,'督導',item,'內容',result,reason];
}

test('detectHeader finds a delayed patrol header and maps required fields', () => {
  const detected = Core.detectHeader([['巡店明細'],[],header,row()],30);
  assert.equal(detected.rowIndex,2);
  assert.equal(detected.map.fillTime,0);
  assert.equal(detected.map.store,5);
  assert.equal(detected.map.item,7);
  assert.ok(detected.hits >= 10);
});

test('parseDelimitedText preserves quoted commas and auto-detects CSV', () => {
  const source = '填表時間,檢查店點,題號,備註\n"2026/8/25 9:05","台北永吉",2,"含,逗號"\n';
  const parsed = Core.parseDelimitedText(source);
  assert.equal(parsed.separator, ',');
  assert.equal(parsed.rows[1][3], '含,逗號');
});

test('normalizeDateTime handles Excel serial and text consistently', () => {
  assert.equal(Core.normalizeDateTime(46259.5), '2026/8/25 12:00');
  assert.equal(Core.normalizeDateTime('2026-08-25 09:05:00'), '2026/8/25 9:05');
  assert.equal(Core.canonicalTimestamp('2026/8/25 9:05'), '2026-08-25T09:05:00');
  assert.equal(Core.canonicalTimestamp('2026-08-25 09:05:00'), '2026-08-25T09:05:00');
});

test('normalizeMatrix parses the patrol report and normalizes outcomes', () => {
  const matrix = [['報表'],header,row({result:'合格'}),row({item:3,result:'N/A',reason:''})];
  const parsed = Core.normalizeMatrix(matrix);
  assert.deepEqual(parsed.errors,[]);
  assert.equal(parsed.rows.length,2);
  assert.equal(parsed.rows[0].month,'2026-08');
  assert.equal(parsed.rows[0].result,'v');
  assert.equal(parsed.rows[1].result,'na');
  assert.equal(parsed.rows[1].reason,'na');
  assert.equal(parsed.meta.headerRow,1);
});

test('normalizeMatrix fails closed when a non-empty patrol row is invalid', () => {
  const matrix = [header,row(),row({fill:'####',item:4})];
  const parsed = Core.normalizeMatrix(matrix);
  assert.equal(parsed.rows.length,0);
  assert.ok(parsed.errors.some(error => error.includes('填表時間無法辨識')));
});

test('chooseBestSheet selects the worksheet with recognizable patrol headers', () => {
  const best = Core.chooseBestSheet([
    {name:'封面',rows:[['巡店月報']]},
    {name:'明細',rows:[header,row()]},
    {name:'其他',rows:[['店點','金額']]}
  ]);
  assert.equal(best.name,'明細');
});

test('mapConfiguredStores uses code first, supports short names, and blocks contradictions', () => {
  const stores = [
    {code:'DNB10082',name:'台北永吉'},
    {code:'DNB10146',name:'台北杭州南'}
  ];
  const mapped = Core.mapConfiguredStores([
    {fillTime:'2026/8/25 9:05',month:'2026-08',code:'',store:'永吉',item:2,sourceRow:2},
    {fillTime:'2026/8/25 10:05',month:'2026-08',code:'DNB10146',store:'台北杭州南',item:2,sourceRow:3}
  ],stores);
  assert.deepEqual(mapped.errors,[]);
  assert.equal(mapped.rows[0].store,'台北永吉');
  assert.equal(mapped.rows[0].code,'DNB10082');
  assert.equal(mapped.rows[1].store,'台北杭州南');

  const conflict = Core.mapConfiguredStores([
    {fillTime:'2026/8/25 9:05',month:'2026-08',code:'DNB10082',store:'杭州南',item:2,sourceRow:2}
  ],stores);
  assert.equal(conflict.rows.length,0);
  assert.ok(conflict.errors[0].includes('互相衝突'));
});

test('dedupeRows collapses identical rows and blocks conflicting duplicates', () => {
  const base = {
    fillTime:'2026/8/25 9:05',arriveTime:'2026/8/25 9:00',leaveTime:'2026/8/25 10:00',district:'北一二B',
    code:'DNB10082',store:'台北永吉',inspector:'督導',item:2,result:'v',reason:'',month:'2026-08'
  };
  const same = Core.dedupeRows([base,{...base}]);
  assert.equal(same.rows.length,1);
  assert.equal(same.duplicateCount,1);
  assert.equal(same.conflicts.length,0);

  const conflict = Core.dedupeRows([base,{...base,result:'',reason:'未完成'}]);
  assert.equal(conflict.conflicts.length,1);
});

test('classifyAgainstServer separates additions, existing and safe updates', () => {
  const imported = [
    {fillTime:'2026/8/25 9:05',store:'台北永吉',code:'DNB10082',item:2,result:'v',reason:'',month:'2026-08'},
    {fillTime:'2026/8/25 9:05',store:'台北永吉',code:'DNB10082',item:3,result:'v',reason:'',month:'2026-08'},
    {fillTime:'2026/8/25 9:05',store:'台北永吉',code:'DNB10082',item:4,result:'v',reason:'',month:'2026-08'}
  ];
  const server = [
    {fillTime:'2026/08/25 09:05:00',store:'台北永吉',code:'DNB10082',item:2,result:'v',reason:'',month:'2026-08'},
    {fillTime:'2026/08/25 09:05:00',store:'台北永吉',code:'DNB10082',item:3,result:'',reason:'未完成',month:'2026-08'}
  ];
  const result = Core.classifyAgainstServer(imported,server);
  assert.equal(result.existing.length,1);
  assert.equal(result.updates.length,1);
  assert.equal(result.additions.length,1);
  assert.equal(result.writeRows.length,2);
  assert.equal(result.updates[0].row.fillTime,'2026/08/25 09:05:00');
});

test('classifyAgainstServer blocks ambiguous duplicate server keys', () => {
  const imported = [{fillTime:'2026/8/25 9:05',store:'台北永吉',item:2,result:'v',reason:''}];
  const server = [
    {fillTime:'2026/8/25 9:05',store:'台北永吉',item:2,result:'v',reason:''},
    {fillTime:'2026-08-25 09:05:00',store:'台北永吉',item:2,result:'v',reason:''}
  ];
  const result = Core.classifyAgainstServer(imported,server);
  assert.equal(result.conflicts.length,1);
  assert.equal(result.writeRows.length,0);
});

test('verifyReadback requires every expected outcome to be present', () => {
  const expected = [{fillTime:'2026/8/25 9:05',store:'台北永吉',item:2,result:'v',reason:''}];
  assert.equal(Core.verifyReadback(expected,[{...expected[0]}]).ok,true);
  const failed = Core.verifyReadback(expected,[{...expected[0],result:'',reason:'未完成'}]);
  assert.equal(failed.ok,false);
  assert.equal(failed.mismatched.length,1);
});

test('page contract keeps Liam Patrol endpoint, session boundary, preflight and paste fallback', () => {
  const html = fs.readFileSync(path.join(__dirname,'..','patrol-import.html'),'utf8');
  const clientFiles = ['patrol-import-runtime.js','patrol-import-file.js','patrol-import.js'];
  const bundle = `${html}\n${clientFiles.map(file => fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n')}`;
  assert.match(bundle,/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/);
  assert.match(bundle,/bei12b_patrol_session_token_v2/);
  assert.match(bundle,/ptsummary/);
  assert.match(bundle,/ptdetail/);
  assert.match(bundle,/action:'ptwrite'/);
  assert.match(bundle,/verifyReadback/);
  assert.match(bundle,/\.xlsx,\.xls,\.csv,\.tsv/);
  assert.match(html,/type="module" src="patrol-import\.js"/);
  assert.match(html,/原本「貼上巡店紀錄/);
  assert.doesNotMatch(bundle,/localStorage\.setItem\([^)]*(?:passcode|key)/i);
});
