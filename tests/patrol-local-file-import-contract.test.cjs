'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hashFile = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const patrol = read('patrol.html');
const importer = read('patrol-local-import.js');

test('Patrol GAS、共用 GAS 與正式 read model 維持 base main 位元一致', () => {
  assert.equal(hashFile('patrol-gas/PatrolCode.gs'), '8667d0fe01ef8b16989429a3cd99f0bb9a11fcaa27e62aa2ff726d489ccb9078');
  assert.equal(hashFile('gas/Code.gs'), 'fe76e5192dc597843bd23156b3c228e286d75dc2f0623dab3f0224d6c536970b');
  assert.equal(hashFile('patrol-read-model.js'), '2476e6073280d714ed645d90e1cd6194efd196a821fab95dd6da3bdc510f9de1');
});

test('沒有新增 GAS route、Sheet schema、通行碼或 session 儲存', () => {
  assert.doesNotMatch(importer, /\b(?:fetch|XMLHttpRequest|cloudCall|cloudCallJsonp)\s*\(/);
  assert.doesNotMatch(importer, /localStorage|sessionStorage|PT_KEY|PT_TOKEN|bei12b_/);
  assert.doesNotMatch(importer, /action\s*[:=]\s*['"][^'"]+['"]/);
  assert.doesNotMatch(importer, /GoogleAppsScript|SpreadsheetApp|DriveApp/);
});

test('原貼上文字框與 JSON 匯入／匯出入口完整保留', () => {
  assert.match(patrol, /<h2>貼上巡店紀錄<\/h2>/);
  assert.match(patrol, /<textarea id="pasteBox"/);
  assert.match(patrol, />匯出存檔<\/button>/);
  assert.match(patrol, />匯入存檔<\/button>/);
  assert.match(patrol, /id="importFile" accept="\.json"/);
  assert.match(patrol, /onclick="parseData\(\)"/);
});

test('Excel 元件只從 repo 本機載入並保留授權', () => {
  assert.doesNotMatch(patrol, /<script\s+src="assets\/vendor\/xlsx\.full\.min\.js/);
  assert.doesNotMatch(patrol, /<script\s+src="patrol-local-import\.js/);
  assert.match(patrol, /'patrolLocalImportParserScript','patrol-local-import\.js\?v=2'/);
  assert.match(patrol, /'patrolLocalImportXlsxScript','assets\/vendor\/xlsx\.full\.min\.js\?v=0\.20\.3'/);
  assert.match(patrol, /window\.XLSX\.version==='0\.20\.3'/);
  assert.doesNotMatch(patrol, /<script[^>]+https?:\/\/(?:cdn|unpkg|jsdelivr)/i);
  assert.doesNotMatch(importer, /https?:\/\//i);
  assert.ok(fs.existsSync(path.join(root, 'assets/vendor/LICENSE.sheetjs.txt')));
  assert.equal(hashFile('assets/vendor/xlsx.full.min.js'), 'cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41');
  assert.equal(require('../assets/vendor/xlsx.full.min.js').version, '0.20.3');
});

test('里程模組本體維持 base main 位元一致', () => {
  const start = patrol.indexOf('const MI = (function(){');
  const end = patrol.lastIndexOf('</script>');
  assert.ok(start >= 0 && end > start);
  const hash = crypto.createHash('sha256').update(patrol.slice(start, end)).digest('hex');
  assert.equal(hash, '5b0587dbe61a6d6fb12ba6ffa8ac770de8a79b226f8e4744fb04e288dd222414');
});

test('本機匯入只保留正式十二欄，不包含檔案內容或公開資料寫入', () => {
  const Parser = require('../patrol-local-import.js');
  assert.deepEqual(Parser.OUTPUT_FIELDS, [
    'fillTime','arriveTime','leaveTime','district','code','store','inspector','item','content','result','reason','month'
  ]);
  assert.doesNotMatch(importer, /download|createObjectURL|\.json['"]|private-data|data\//i);
  assert.match(importer, /arrayBuffer\(\)/);
  assert.match(importer, /decode\(['"]big5['"], true\)/i);
});

test('本機資料先依正式 STORES 雙欄驗證與正規化，再進入 dedupe／Preflight', () => {
  const storeGate = importer.indexOf('normalizeRowsToConfiguredStores(parsed.rows, configuredStores)');
  const dedupe = importer.indexOf('dedupeRows(storeValidation.rows, services.candidateKey)');
  const preflight = importer.indexOf('services.preflight(localState.parsedRows)');
  assert.ok(storeGate >= 0 && dedupe > storeGate && preflight > dedupe);
  assert.match(importer, /code:byCode\.code, store:byCode\.name/);
});

test('初始 HTML 不載入 parser／SheetJS，選檔 loader 失敗維持零寫入', () => {
  assert.match(patrol, /async function handlePatrolLocalFileSelection\(event\)/);
  assert.match(patrol, /await loadPatrolLocalImportDependencies\(\)/);
  assert.match(patrol, /本機解析元件載入失敗[^`]*未呼叫 ptwrite/);
  assert.equal((patrol.match(/loadPatrolLocalImportDependencies\(\)/g) || []).length, 2);
});
