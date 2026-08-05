const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const gas = fs.readFileSync(require('node:path').join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
const html = fs.readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');

const ids = [
  'pixel-10-family', 'razr-fold', 's26u-zfold8-family', 'sharp-r11',
  'vivo-x300-v70fe', 'pixel-11-pro-family', 's26-zflip8-family',
  'pixel-11', 'oppo-r16f', 'samsung-a57', 'oppo-a6x',
  'samsung-a27-a17', 'vivo-y21'
];

test('Apps Script source parses and declares the independent sheet contract', () => {
  assert.doesNotThrow(() => new Function(gas));
  assert.match(gas, /const REPORT_AWARD_MODELS_SHEET = 'ReportAwardModels'/);
  assert.match(gas, /const REPORT_AWARD_MODELS_SCHEMA = 'award-models-v1'/);
  for (const id of ids) assert.match(gas, new RegExp(`['"]${id}['"]`));
  assert.match(gas, /assertNoDuplicateReportAwardModelIds_\(rawPayload\)/);
  assert.match(gas, /key\.indexOf\('tw_'\) !== 0/);
  assert.match(gas, /attachReportAwardModels_\(result, date, seg\)/);
});

test('frontend uses the canonical modelId state and fixed order', () => {
  const positions = ids.map(id => html.indexOf(`modelId:'${id}'`));
  assert.ok(positions.every(pos => pos >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.match(html, /const AWARD_MODELS_SCHEMA = 'award-models-v1'/);
  assert.match(html, /obj\.awardModels\s*=\s*getAwardModelsFormData\(\)/);
  assert.match(html, /setAwardModelsFormData\(data && data\.awardModels/);
});
