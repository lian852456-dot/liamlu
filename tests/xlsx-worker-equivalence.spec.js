// Guards the performance change that moved XLSX.read into a Web Worker and
// added cellHTML:false: the workbook every parser receives must be identical
// to the old main-thread XLSX.read result, cell by cell.
const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8875/';

async function setup(page) {
  await page.goto(BASE + 'offline.html');
  await page.addScriptTag({ url: '/vendor-loader.js' });
  await page.evaluate(() => {
    window.__workers = 0;
    const Native = window.Worker;
    window.Worker = function (...args) { window.__workers += 1; return new Native(...args); };
  });
  await page.evaluate(() => window.VendorLoader.ensure('xlsx'));
}

// Builds a workbook with the features the uploads rely on: several sheets,
// Chinese text, numbers, real dates, percent formats, formulas, merges and blanks.
function buildWorkbookBytes() {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const aoa = [['店點', '日期', '實績', '目標', '達成率', '備註']];
  for (let r = 0; r < 400; r += 1) {
    aoa.push([
      ['酒泉', '大稻埕', '六張犁', '三創', '通化'][r % 5] + '門市',
      new Date(Date.UTC(2026, 9, 1 + (r % 28))),
      r * 7 % 113,
      100 + (r % 9),
      null,
      r % 11 === 0 ? '' : '備註' + r,
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
  for (let r = 1; r <= 400; r += 1) {
    ws[XLSX.utils.encode_cell({ r, c: 4 })] = { t: 'n', f: `C${r + 1}/D${r + 1}`, v: (aoa[r][2] / aoa[r][3]), z: '0.0%' };
  }
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  XLSX.utils.book_append_sheet(wb, ws, 'AQ締結率');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['項目', '值'], ['合計', 12.5], ['空白', null]]), '樞紐');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['店點', '機型', '庫存'], ['通化', 'iPhone 17 Pro', 3]]), '庫存');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true });
}

// Compares two workbooks the way parsers consume them: names, ranges, merges,
// every cell's type/value/text/formula, and sheet_to_json in both raw modes.
function compareWorkbooks(a, b) {
  const XLSX = window.XLSX;
  const problems = [];
  const norm = v => (v instanceof Date ? 'D:' + v.getTime() : v);
  if (JSON.stringify(a.SheetNames) !== JSON.stringify(b.SheetNames)) problems.push('SheetNames');
  for (const name of a.SheetNames) {
    const sa = a.Sheets[name], sb = b.Sheets[name];
    if (!sa !== !sb) { problems.push('presence ' + name); continue; }
    if (!sa) continue;
    if (sa['!ref'] !== sb['!ref']) problems.push('ref ' + name);
    if (JSON.stringify(sa['!merges'] || null) !== JSON.stringify(sb['!merges'] || null)) problems.push('merges ' + name);
    const keys = new Set([...Object.keys(sa), ...Object.keys(sb)].filter(k => k[0] !== '!'));
    for (const k of keys) {
      const ca = sa[k] || {}, cb = sb[k] || {};
      for (const prop of ['t', 'v', 'w', 'f', 'z']) {
        if (norm(ca[prop]) !== norm(cb[prop])) { problems.push(`${name}!${k}.${prop}`); break; }
      }
    }
    for (const raw of [true, false]) {
      const ja = XLSX.utils.sheet_to_json(sa, { header: 1, raw, defval: null });
      const jb = XLSX.utils.sheet_to_json(sb, { header: 1, raw, defval: null });
      if (JSON.stringify(ja.map(r => r.map(norm))) !== JSON.stringify(jb.map(r => r.map(norm)))) problems.push(`sheet_to_json raw=${raw} ${name}`);
    }
  }
  return problems;
}

const CASES = [
  ['department-ops gold/store', { type: 'array', cellDates: true }],
  ['department-scores', { type: 'array', cellFormula: true }],
  ['readonly-dashboard (named sheets)', { type: 'array', sheets: ['AQ締結率', '樞紐'] }],
];

for (const [label, options] of CASES) {
  test(`worker read equals main-thread read: ${label}`, async ({ page }) => {
    await setup(page);
    const result = await page.evaluate(async ({ build, compare, options }) => {
      const bytes = new Function(`return (${build})`)()();
      const before = window.XLSX.read(bytes, options);
      const after = await window.VendorLoader.readWorkbook(bytes, { ...options, cellHTML: false });
      return { problems: new Function(`return (${compare})`)()(before, after), workers: window.__workers, cells: Object.keys(before.Sheets[before.SheetNames[0]]).length };
    }, { build: buildWorkbookBytes.toString(), compare: compareWorkbooks.toString(), options });
    expect(result.workers).toBe(1);
    expect(result.cells).toBeGreaterThan(2000);
    expect(result.problems).toEqual([]);
  });
}

test('worker read equals main-thread read for CSV text (phone stock)', async ({ page }) => {
  await setup(page);
  const problems = await page.evaluate(async compare => {
    const csv = '店點,機型,庫存,日期\n通化,iPhone 17 Pro,3,2026/10/31\n萬大,"Galaxy S26, 512G",0,2026/11/01\n';
    const options = { type: 'string', cellDates: true, FS: ',' };
    const before = window.XLSX.read(csv, options);
    const after = await window.VendorLoader.readWorkbook(csv, { ...options, cellHTML: false });
    return new Function(`return (${compare})`)()(before, after);
  }, compareWorkbooks.toString());
  expect(problems).toEqual([]);
});

test('parse errors keep their original message through the worker', async ({ page }) => {
  await setup(page);
  const messages = await page.evaluate(async () => {
    const bad = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]).buffer;
    let main = '', worker = '';
    try { window.XLSX.read(bad, { type: 'array' }); } catch (e) { main = e.message; }
    try { await window.VendorLoader.readWorkbook(bad, { type: 'array' }); } catch (e) { worker = e.message; }
    return { main, worker };
  });
  expect(messages.main).not.toBe('');
  expect(messages.worker).toBe(messages.main);
});

test('falls back to the main thread when the worker script cannot load', async ({ page }) => {
  await page.route('**/xlsx-read-worker.js*', route => route.abort());
  await setup(page);
  const ok = await page.evaluate(async () => {
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet([['a', 1]]), 'S');
    const bytes = window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const read = await window.VendorLoader.readWorkbook(bytes, { type: 'array' });
    return read.Sheets.S.B1.v === 1;
  });
  expect(ok).toBe(true);
});

test('pages no longer load SheetJS or officecrypto before they are needed', async ({ page }) => {
  for (const path of ['app.html?preview=1', 'department-ops.html', 'readonly-dashboard.html']) {
    const vendors = [];
    page.on('request', r => { if (/xlsx\.full\.min\.js|officecrypto/.test(r.url())) vendors.push(r.url()); });
    await page.route(u => !u.href.startsWith(BASE), r => r.abort());
    await page.goto(BASE + path, { waitUntil: 'load' });
    expect(vendors, path).toEqual([]);
    expect(await page.evaluate(() => typeof window.VendorLoader?.ensure), path).toBe('function');
    page.removeAllListeners('request');
  }
});
