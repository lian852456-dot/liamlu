const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../phone-stock-core.js');

test('銷售直列與庫存快照可計算近三日去化率', () => {
  const sales = Core.parseMatrix([
    ['店點', '機型', '銷售日期', '銷售數'],
    ['台灣大哥大數位生活台北三創直營', 'iPhone 18 Pro', '2026/09/18', 2],
    ['台北三創', 'iPhone 18 Pro', '2026/09/20', 1],
    ['台北酒泉', 'Pixel 11', '2026/09/17', 9]
  ], 'sales', '2026-09-20');
  const stock = Core.parseMatrix([
    ['店點名稱', '商品型號', '庫存日期', '可售庫存'],
    ['台北三創', 'iPhone 18 Pro', '2026/09/20', 3],
    ['台北三創', 'iPhone 18 Pro', '2026/09/19', 99],
    ['台北酒泉', 'Pixel 11', '2026/09/20', 7]
  ], 'stock', '2026-09-20');
  assert.deepEqual(sales.errors, []);
  assert.deepEqual(stock.errors, []);
  const report = Core.buildReport(sales.rows, stock.rows, '2026-09-20');
  assert.equal(report.startDate, '2026-09-18');
  assert.equal(report.stockDate, '2026-09-20');
  assert.equal(report.totalSales, 3);
  assert.equal(report.totalStock, 10);
  assert.equal(report.totalRate, 3 / 13);
  assert.deepEqual(report.storeSummary.find(row => row.store === '台北三創'), { store:'台北三創', sales:3, stock:3, rate:.5 });
});

test('近三日分欄銷售可隨截止日辨識，非北一二B店點不混入', () => {
  const result = Core.parseMatrix([
    ['門市', '機型', '9/18', '9/19', '9/20'],
    ['三創', 'Galaxy S26', 1, 2, 3],
    ['台中公益', 'Galaxy S26', 50, 50, 50]
  ], 'sales', '2026-09-20');
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows.map(row => row.date), ['2026-09-18', '2026-09-19', '2026-09-20']);
  assert.match(result.warnings.join('\n'), /非北一二B店點/);
});

test('SAR26_4 銷貨與 INVRC101 庫存格式可辨識民國日期、數量與退貨', () => {
  const sales = Core.parseMatrix([
    ['序號', '區域', '店點名稱', '品名', '數量', '銷貨日期'],
    [1, '北一二B', '台灣大哥大數位生活台北三創', 'APPLE iPhone 18 Pro_256G-(黑)(5G)', 1, 1150920],
    [2, '北一二B', '台北杭州南', 'APPLE iPhone 18 Pro Max_256G-(勃根地紅)(5G)', -1, 1150920]
  ], 'sales', '2026-09-20');
  const stock = Core.parseMatrix([
    ['營業點代碼', '區域名稱', '門市名稱', '日期', '料號', '品名', '數量', '庫存合計'],
    ['DNB10307', '北一二B', '台灣大哥大數位生活台北三創', 1150920, 'H01001118340100', 'APPLE iPhone 18 Pro_256G-(黑)(5G)', 1, 4],
    ['DNB10146', '北一二B', '台北杭州南', 1150920, 'H0100111838E900', 'APPLE iPhone 18 Pro Max_256G-(勃根地紅)(5G)', 2, 2]
  ], 'stock', '2026-09-20');
  assert.deepEqual(sales.errors, []);
  assert.deepEqual(stock.errors, []);
  assert.deepEqual(sales.rows.map(row => row.date), ['2026-09-20', '2026-09-20']);
  assert.equal(sales.rows[1].quantity, -1, '退貨應扣回近三日銷售');
  const report = Core.buildReport(sales.rows, stock.rows, '2026-09-20');
  assert.equal(report.totalSales, 0);
  assert.equal(report.totalStock, 6);
  assert.equal(report.stockDate, '2026-09-20');
});

test('SAR26_4CSV 明細欄位左移時，仍以實際料號、數量與銷貨日期解析', () => {
  const sales = Core.parseMatrix([
    ['序號', '公司別', '區域', '店點代碼', '店點名稱', '銷貨單號', '組合料號', '料號', '品名', '活動名稱', '組合項目代碼', '組合促銷名稱', '促銷代碼', '專案名稱', 'SubId', '數量', '銷售金額', '抵用券折抵', '優惠折抵', '優惠折扣', '銷售淨額', '銷貨日期'],
    [1, 'TWM', '北一二B', 'DNB10307', '台灣大哥大數位生活台北三創', 'S35', 'H010', 'APPLE iPhone 18 Pro_256G-(黑)(5G)', 'AD766', '5G手機案', '72979312', 1, 31300, 0, 3500, 0, 27800, 1150920],
    [2, 'TWM', '北一二B', 'DNB10146', '台北杭州南', 'S36', 'H011', 'APPLE iPhone 18 Pro Max_256G-(銀)(5G)', 'AE264', '5G手機案', '72979566', -1, -49900, 0, 0, 0, -49900, 1150919]
  ], 'sales', '2026-09-20');
  assert.deepEqual(sales.errors, []);
  assert.deepEqual(sales.rows.map(row => row.model), ['APPLE iPhone 18 Pro_256G-(黑)(5G)', 'APPLE iPhone 18 Pro Max_256G-(銀)(5G)']);
  assert.deepEqual(sales.rows.map(row => row.quantity), [1, -1]);
  assert.deepEqual(sales.rows.map(row => row.date), ['2026-09-20', '2026-09-19']);
});

test('督導入口包含手機本機雙檔工具，日誌檢查不再位於同仁大廳', () => {
  const root = path.resolve(__dirname, '..');
  const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');
  const supervisor = home.slice(home.indexOf('aria-label="督導專區"'), home.indexOf('</nav>', home.indexOf('aria-label="督導專區"')));
  const staff = home.slice(home.indexOf('aria-label="同仁大廳"'), home.indexOf('</nav>', home.indexOf('aria-label="同仁大廳"')));
  assert.match(supervisor, /href="phone-stock-dashboard\.html"[\s\S]*手機近三日銷售與庫存/);
  assert.match(supervisor, /href="daily-log-dashboard\.html"[\s\S]*每日日誌檢查/);
  assert.doesNotMatch(staff, /daily-log-dashboard\.html/);
});

test('新頁面只使用既有本機 SheetJS，不含上傳或資料持久化', () => {
  const root = path.resolve(__dirname, '..');
  const page = fs.readFileSync(path.join(root, 'phone-stock-dashboard.html'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'phone-stock-dashboard.js'), 'utf8');
  assert.match(page, /assets\/vendor\/xlsx\.full\.min\.js/);
  assert.match(page, /id="salesFile" type="file"/);
  assert.match(page, /id="stockFile" type="file"/);
  assert.match(page, /銷售 ÷（銷售＋庫存）/);
  assert.doesNotMatch(`${page}\n${controller}`, /localStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(controller, /MAX_FILE_BYTES = 20 \* 1024 \* 1024/);
});
