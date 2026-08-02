const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const gasSource = fs.readFileSync(path.join(root, 'gas', 'Code.gs'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const MODEL_IDS = [
  'pixel-10-family', 'razr-fold', 's26u-zfold8-family', 'sharp-r11',
  'vivo-x300-v70fe', 'pixel-11-pro-family', 's26-zflip8-family',
  'pixel-11', 'oppo-r16f', 'samsung-a57', 'oppo-a6x',
  'samsung-a27-a17', 'vivo-y21'
];

class MockRange {
  constructor(sheet, row, column, numRows, numColumns) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.numRows = numRows;
    this.numColumns = numColumns;
  }
  getValues() {
    return this.sheet.read(this.row, this.column, this.numRows, this.numColumns);
  }
  getDisplayValues() {
    return this.getValues().map(row => row.map(value => value == null ? '' : String(value)));
  }
  setValues(rows) {
    this.sheet.write(this.row, this.column, rows);
    return this;
  }
  setValue(value) {
    this.sheet.write(this.row, this.column, [[value]]);
    return this;
  }
}

class MockSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
  }
  getName() { return this.name; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 0); }
  getRange(row, column, numRows = 1, numColumns = 1) {
    return new MockRange(this, row, column, numRows, numColumns);
  }
  getDataRange() {
    return this.getRange(1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1));
  }
  appendRow(row) { this.rows.push([...row]); }
  setFrozenRows() {}
  read(row, column, numRows, numColumns) {
    return Array.from({ length: numRows }, (_, rowOffset) =>
      Array.from({ length: numColumns }, (_, columnOffset) =>
        this.rows[row - 1 + rowOffset]?.[column - 1 + columnOffset] ?? ''
      )
    );
  }
  write(row, column, values) {
    values.forEach((inputRow, rowOffset) => {
      const targetRow = row - 1 + rowOffset;
      while (this.rows.length <= targetRow) this.rows.push([]);
      inputRow.forEach((value, columnOffset) => {
        this.rows[targetRow][column - 1 + columnOffset] = value;
      });
    });
  }
  deleteRow(rowNumber) { this.rows.splice(rowNumber - 1, 1); }
}

class MockSpreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) {
    const sheet = new MockSheet(name);
    this.sheets.set(name, sheet);
    return sheet;
  }
  getSheets() { return [...this.sheets.values()]; }
}

function loadAwardModelFunctions(spreadsheet) {
  const SpreadsheetApp = { openById: id => {
    assert.equal(id, '10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA');
    return spreadsheet;
  }};
  const Utilities = {
    formatDate(value) { return new Date(value).toISOString().slice(0, 10); }
  };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: () => '' }) };
  const ContentService = {
    MimeType: { JSON: 'JSON', JAVASCRIPT: 'JAVASCRIPT' },
    createTextOutput(body) {
      return { body, setMimeType() { return this; }, getContentText() { return this.body; } };
    }
  };
  return new Function('SpreadsheetApp', 'Utilities', 'PropertiesService', 'ContentService', `${gasSource}\nreturn { doGet, getReportAwardModelsSheet_, writeReportAwardModels_, readReportAwardModels_ };`)(SpreadsheetApp, Utilities, PropertiesService, ContentService);
}

test('isolated ReportAwardModels write/read uses one sheet and returns auditable metadata', () => {
  const spreadsheet = new MockSpreadsheet();
  const api = loadAwardModelFunctions(spreadsheet);
  const sheet = api.getReportAwardModelsSheet_();
  assert.equal(sheet.getName(), 'ReportAwardModels');
  assert.equal(sheet.getLastRow(), 1, 'precondition: header only');

  const models = Object.fromEntries(MODEL_IDS.map((id, index) => [id, index + 1]));
  const saved = api.writeReportAwardModels_('2099-08-03', '隔離測試門市', 8, models, 'award-models-v1-isolated');
  assert.equal(sheet.getLastRow(), 2);
  assert.equal(saved.rowWritten, true);
  assert.equal(saved.spreadsheetId, '10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA');
  assert.equal(saved.sheetName, 'ReportAwardModels');
  assert.equal(saved.rowNumber, 2);
  assert.equal(saved.date, '2099-08-03');
  assert.equal(saved.seg, '8');
  assert.equal(saved.store, '隔離測試門市');
  assert.equal(saved.readbackMatches, true);
  assert.deepEqual(saved.readback.awardModels, models);

  const readback = api.readReportAwardModels_('2099-08-03', 8);
  assert.deepEqual(readback['隔離測試門市'].awardModels, models);

  const updated = { ...models, [MODEL_IDS[0]]: 0, [MODEL_IDS[1]]: null };
  api.writeReportAwardModels_('2099-08-03', '隔離測試門市', 8, updated, 'award-models-v1-isolated-2');
  const updatedReadback = api.readReportAwardModels_('2099-08-03', 8)['隔離測試門市'].awardModels;
  assert.equal(updatedReadback[MODEL_IDS[0]], 0);
  assert.equal(updatedReadback[MODEL_IDS[1]], null);
  for (const id of MODEL_IDS.slice(2)) assert.equal(updatedReadback[id], models[id]);

  sheet.deleteRow(2);
  assert.equal(sheet.getLastRow(), 1, 'isolated row cleaned');
});

test('frontend endpoint contract refuses local-shadow fake success', () => {
  const saveStart = htmlSource.indexOf('async function saveToStorage');
  const saveEnd = htmlSource.indexOf('function pct', saveStart);
  const saveSource = htmlSource.slice(saveStart, saveEnd);
  assert.match(htmlSource, /const DAILY_REPORT_GAS_URL = 'https:\/\/script\.google\.com\/macros\/s\/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6\/exec'/);
  assert.match(htmlSource, /const DEFAULT_GAS_URL = DAILY_REPORT_GAS_URL/);
  assert.match(saveSource, /result\.rowWritten === true/);
  assert.match(saveSource, /result\.readbackMatches === true/);
  assert.match(htmlSource, /function requestGasJson\(url\)/);
  assert.doesNotMatch(saveSource, /mode:\s*['"]no-cors['"]/);
  assert.doesNotMatch(saveSource, /resolve\(true\)/);
});

test('isolated doGet write response contains row metadata and same-condition readback', () => {
  const spreadsheet = new MockSpreadsheet();
  const api = loadAwardModelFunctions(spreadsheet);
  const models = Object.fromEntries(MODEL_IDS.map((id, index) => [id, index + 1]));
  const raw = JSON.stringify({
    date: '2099-08-03',
    store: '隔離測試門市',
    seg: 8,
    data: { awardModels: models }
  });
  const output = api.doGet({ parameter: { action: 'write', payload: encodeURIComponent(raw) } });
  const response = JSON.parse(output.getContentText());
  assert.equal(response.status, 'ok');
  assert.equal(response.rowWritten, true);
  assert.equal(response.spreadsheetId, '10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA');
  assert.equal(response.sheetName, 'ReportAwardModels');
  assert.equal(response.rowNumber, 2);
  assert.equal(response.date, '2099-08-03');
  assert.equal(response.seg, '8');
  assert.equal(response.store, '隔離測試門市');
  assert.equal(response.readbackMatches, true);
  assert.deepEqual(response.readback.awardModels, models);
});
