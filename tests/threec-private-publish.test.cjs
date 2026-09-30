const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const code = read('gas/Code.gs');
const page = read('gas/ReportUpload.html');

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`unterminated ${name}`);
}

test('管理頁只內嵌同專案解析器，3C 原始 Excel 不離開瀏覽器', () => {
  assert.match(page, /reportUploadInclude_\('ReportUploadSheetJs'\)/);
  assert.match(page, /reportUploadInclude_\('ReportUploadTradeInCore'\)/);
  assert.doesNotMatch(page, /<script[^>]+src=|fetch\(|XMLHttpRequest|sendBeacon/);
  const preview = functionBody(page, 'previewThreec');
  assert.match(preview, /TradeInImportCore\.parseFile/);
  assert.match(preview, /TradeInImportCore\.buildPublishSnapshot/);
  assert.doesNotMatch(preview, /readFileBase64|call\(/, '解析階段不得傳送原始 Excel 或呼叫後端');
  const publish = page.slice(page.indexOf("$('threecPublishBtn').addEventListener"), page.indexOf('async function rollbackThreec'));
  assert.match(publish, /snapshotJson:JSON\.stringify\(threecPreviewSnapshot\)/);
  assert.doesNotMatch(publish, /fileBase64|arrayBuffer|readAsDataURL/);
  assert.equal(read('gas/ReportUploadSheetJs.html'), read('assets/vendor/xlsx.full.min.js'));
  assert.equal(read('gas/ReportUploadTradeInCore.html'), read('tradein-import-core.js'));
  const include = functionBody(code, 'reportUploadInclude_');
  assert.match(include, /createTemplateFromFile\(name\)\.getRawContent\(\)/);
  assert.doesNotMatch(include, /createHtmlOutputFromFile/);
});

test('私有資料夾只能由 Script Property 指定且必須名稱及分享狀態都正確', () => {
  assert.match(code, /THREEC_PRIVATE_FOLDER_PROPERTY = 'THREEC_PRIVATE_FOLDER_ID'/);
  assert.doesNotMatch(code, /THREEC_PRIVATE_FOLDER_ID\s*=\s*['"][^'"]+['"]/);
  const folder = functionBody(code, 'threecPrivateFolder_');
  assert.match(folder, /getProperty\(THREEC_PRIVATE_FOLDER_PROPERTY\)/);
  assert.match(folder, /folder\.getName\(\) !== THREEC_PRIVATE_FOLDER_NAME/);
  assert.match(folder, /folder\.getSharingAccess\(\) !== DriveApp\.Access\.PRIVATE/);
  assert.match(functionBody(code, 'threecReadJsonFile_'), /檔案不在指定私有資料夾/);
});

test('首次正式基線與來源身份 gate 固定且零元不會被當成空值', () => {
  assert.doesNotMatch(code, /THREEC_INITIAL_RELEASE/);
  const normalize = functionBody(code, 'threecNormalizeIncomingSnapshot_');
  assert.match(normalize, /來源檔名與 source_version_date 不一致/);
  assert.match(normalize, /sourceFileSha256/);
  assert.match(normalize, /sourceRowCount !== rowCount \+ excludedNoPriceCount/);
  const shopping = functionBody(code, 'threecValidateShoppingRows_');
  assert.match(shopping, /retailPrice !== ''/);
  assert.match(shopping, /projectPrices\[name\] !== ''/);
  assert.match(functionBody(code, 'threecPriceField_'), /^\s*if \(value == null \|\| String\(value\)\.trim\(\) === ''\)/);
});

test('兩家回收商與 S/A/B/C 必須完整保留且衝突為零', () => {
  assert.match(code, /THREEC_PROVIDERS = \['點子行動', 'FutureDial（FDI）'\]/);
  assert.match(code, /THREEC_GRADES = \['S', 'A', 'B', 'C'\]/);
  const body = functionBody(code, 'threecValidateTradeinRows_');
  assert.match(body, /必須完整保留兩家回收商/);
  assert.match(body, /必須完整保留 S／A／B／C 欄位/);
  assert.match(functionBody(code, 'threecNormalizeIncomingSnapshot_'), /quoteConflictCount !== 0/);
});

test('發布在讀回成功後才切換 active，且同日異雜湊需要二次確認', () => {
  const publish = functionBody(code, 'threecPublish');
  assert.ok(publish.indexOf('threecReadJsonFile_(snapshotFile.getId())') < publish.indexOf('threecWriteRegistry_(next)'));
  assert.match(publish, /status:'already_current'/);
  assert.match(publish, /status:'confirmation_required'/);
  assert.match(publish, /confirmSameDateHashChange/);
  assert.match(publish, /較舊檔名日期不得覆蓋目前正式版本/);
  assert.match(publish, /next\.kinds\[incoming\.kind\]\.previous = next\.kinds\[incoming\.kind\]\.active/);
  assert.match(functionBody(code, 'threecWriteRegistry_'), /setProperty\(THREEC_REGISTRY_POINTER_PROPERTY, file\.getId\(\)\)/);
});

test('回滾只交換 active/previous 指標，私有讀取沿用既有裝置授權', () => {
  const rollback = functionBody(code, 'threecRollback');
  assert.match(rollback, /threecSnapshotHash_\(previousSnapshot\)/);
  assert.match(rollback, /active = next\.kinds\[kind\]\.previous/);
  assert.match(rollback, /previous = oldActive/);
  const authorize = functionBody(code, 'threecAuthorizeRead_');
  assert.match(authorize, /privateDashboardUserByEmployeeId/);
  assert.match(authorize, /privateDashboardIsTrustedEmployee/);
  assert.match(authorize, /device_id !== deviceId/);
  assert.match(code, /action === 'threec_snapshot_read'/);
});

test('管理頁需要明確勾選，且同日異雜湊另有第二個確認', () => {
  assert.match(page, /id="threecConfirm" type="checkbox"/);
  assert.match(page, /id="threecSameDateConfirm" type="checkbox"/);
  assert.match(page, /result\.status === 'confirmation_required'/);
  assert.match(page, /window\.confirm\('確定將此標準化快照/);
  assert.doesNotMatch(page, /const expectedRows/);
});
