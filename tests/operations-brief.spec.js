const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const fixtures = require('./operations-fixtures.cjs');
const JSZip = require('../assets/vendor/store-presentation/jszip-3.10.1.min.js');
const XLSX = require('../assets/vendor/xlsx.full.min.js');

const templatePath = process.env.OP_TEMPLATE;
const supervisorToken = 'U1lOVEhFVElD.c2lnbmF0dXJl';
const authStorageKey = 'bei12b_patrol_session_token_v2';
const mime = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.wasm': 'application/wasm', '.gz': 'application/octet-stream',
  '.traineddata': 'application/octet-stream'
};
let server, base, largeWorkbook, encryptedGood;

test.beforeAll(async () => {
  const root = path.resolve(__dirname, '..');
  server = http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + pathname);
      if (path.relative(root, file).startsWith('..')) throw Error('Outside test site');
      const content = await fs.readFile(file);
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(content);
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/`;

  const workbook = XLSX.utils.book_new();
  const rows = [
    ['店點', '期別', '實績點數'],
    ['SYNTHETIC-PRIVATE-ROW', '2026-11', null],
    ['保留零值', '2026-11', 0]
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'SYNTHETIC待核');
  const zip = await JSZip.loadAsync(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  zip.file('xl/media/SYNTHETIC-padding.bin', Buffer.alloc(35 * 1024 * 1024));
  largeWorkbook = await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });

  const goodSpeed = XLSX.utils.book_new();
  for (const [name, records] of Object.entries(fixtures.goodSpeedTables())) {
    XLSX.utils.book_append_sheet(goodSpeed, XLSX.utils.aoa_to_sheet(records), name);
  }
  const officeCrypto = require('../assets/vendor/officecrypto.bundle.min.js');
  global.window = globalThis;
  try {
    const bytes = XLSX.write(goodSpeed, { type: 'buffer', bookType: 'xlsx' });
    encryptedGood = Buffer.from(await officeCrypto.encrypt(bytes, {
      password: 'SYNTHETIC-FILE-ONLY', type: 'standard'
    }));
  } finally {
    delete global.window;
  }
});

test.afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

async function start(page, { allowed = true, destination = 'operations-brief.html', lifetime = 3600 } = {}) {
  const calls = [], unexpected = [], pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(base)) return route.continue();
    unexpected.push({ url, method: route.request().method() });
    return route.abort();
  });
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    const payload = request.method() === 'POST' ? request.postDataJSON() : null;
    calls.push(payload);
    if (payload?.action === 'ptlogout') return route.fulfill({ json: { status: 'ok' } });
    const result = allowed
      ? { status: 'ok', token: supervisorToken, expiresAt: Math.floor(Date.now() / 1000) + lifetime, sessionContract: 'patrol-session-v2' }
      : { status: 'denied', reason: 'AUTH_CREDENTIAL_INVALID' };
    return route.fulfill({ json: result });
  });
  await page.goto(base + destination);
  return { calls, unexpected, pageErrors };
}

async function login(page) {
  await page.locator('#passcode').fill('SYNTHETIC-SUPERVISOR');
  await page.locator('#verify').click();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#passcode')).toHaveValue('');
}

async function selectBytes(input, name, contents, mimeType = 'application/octet-stream') {
  await input.setInputFiles({ name, mimeType, buffer: Buffer.from(contents) });
}

async function readFiles(page) {
  await page.locator('#readFiles').click();
  await expect(page.locator('#status')).toContainText('已完成本機讀取', { timeout: 110000 });
  await expect(page.locator('#readFiles')).toBeEnabled({ timeout: 110000 });
}

async function captureDownload(page, id, info) {
  const downloading = page.waitForEvent('download');
  await page.locator('#' + id).click();
  await expect(page.locator('#exportStatus')).toContainText('已交給瀏覽器下載');
  const download = await downloading;
  const file = info.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  return { download, file };
}

test('direct anonymous route requires supervisor proof and denied credentials keep the workspace closed', async ({ page }) => {
  const { calls } = await start(page, { allowed: false });
  await expect(page.locator('#workspace')).toBeHidden();
  await page.locator('#passcode').fill('SYNTHETIC-DENIED');
  await page.locator('#verify').click();
  await expect(page.locator('#authStatus')).toContainText(/驗證未通過|重新登入|重新驗證/);
  await expect(page.locator('#workspace')).toBeHidden();
  expect(calls).toEqual([{ action: 'ptauth', key: 'SYNTHETIC-DENIED' }]);
  await expect(page.locator('#inventory')).toBeEmpty();
});

test('home entry, supervisor sign in, return and real logout use the existing session flow', async ({ page }) => {
  const { calls } = await start(page, { destination: 'home.html' });
  const entry = page.getByRole('link', { name: /作戰專區/ });
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(/operations-brief\.html/);
  await login(page);

  await page.getByRole('link', { name: /智慧營運中心/ }).click();
  await expect(page).toHaveURL(/home\.html/);
  await page.getByRole('link', { name: /作戰專區/ }).click();
  await expect(page.locator('#workspace')).toBeVisible();
  await expect(page.locator('#sourceFiles')).toHaveValue('');
  expect(calls.some(payload => payload?.action === 'ptauth' && payload.token === supervisorToken)).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#workspace [data-portal-logout]').click();
  await expect(page.locator('#authPanel')).toBeVisible();
  await expect(page.locator('#workspace')).toBeHidden();
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), authStorageKey)).toBe(null);
  expect(calls.some(payload => payload?.action === 'ptlogout')).toBe(true);
});

test('staff or device state does not unlock and a denied supervisor token is cleared', async ({ page }) => {
  await page.addInitScript(({ key, token }) => {
    localStorage.setItem('north12b_staff_session', 'SYNTHETIC-STAFF');
    localStorage.setItem('password_channel_device', 'SYNTHETIC-DEVICE');
    sessionStorage.setItem(key, token);
  }, { key: authStorageKey, token: supervisorToken });
  const { calls } = await start(page, { allowed: false });
  await expect(page.locator('#workspace')).toBeHidden();
  await expect.poll(() => calls).toEqual([{ action: 'ptauth', token: supervisorToken }]);
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), authStorageKey)).toBe(null);
});

test('session expiration clears file selections and relocks import', async ({ page }) => {
  await start(page, { lifetime: 6 });
  await login(page);
  await selectBytes(page.locator('#sourceFiles'), 'SYNTHETIC.csv', '店點,期別\n合成,2026-11');
  await expect(page.locator('#sourceFiles')).not.toHaveValue('');
  await expect(page.locator('#authPanel')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#authStatus')).toContainText(/到期|失效/);
  await expect(page.locator('#sourceFiles')).toHaveValue('');
  await expect(page.locator('#inventory')).toBeEmpty();
});

test('35 MiB workbook previews sheet and fields without leaking company rows or sending requests', async ({ page }, info) => {
  test.setTimeout(120000);
  const { calls, unexpected, pageErrors } = await start(page);
  await login(page);
  await expect(page.locator('[data-company-source]')).toHaveCount(9);
  await expect(page.locator('#mapping')).toContainText(/尚未選|未選/);
  await selectBytes(page.locator('#sourceFiles'), 'SYNTHETIC-35MiB.xlsx', largeWorkbook);
  await expect(page.locator('#download')).toBeDisabled();
  await readFiles(page);
  const inventory = page.locator('#inventory');
  await expect(inventory).toContainText('SYNTHETIC-35MiB.xlsx');
  await expect(inventory).toContainText('SYNTHETIC待核');
  await expect(inventory).not.toContainText('SYNTHETIC-PRIVATE-ROW');
  await expect(page.locator('#download')).toBeDisabled();
  expect(calls.every(payload => payload?.action === 'ptauth')).toBe(true);
  expect(JSON.stringify(calls)).not.toContain('SYNTHETIC-35MiB');
  expect(unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#readFiles')).toBeVisible();
    await page.screenshot({ path: info.outputPath(`SYNTHETIC-ui-${width}.png`), fullPage: true });
  }

  await page.locator('#clear').click();
  await expect(page.locator('#sourceFiles')).toHaveValue('');
  await expect(inventory).not.toContainText('SYNTHETIC待核');
  await expect(page.locator('#mapping')).toContainText(/尚未選|未選/);
});

test('empty input, oversized file, wrong template and older PowerPoint explain how to recover', async ({ page }, info) => {
  await start(page);
  await login(page);
  await expect(page.locator('#status')).toContainText(/選|檔/);
  const large = info.outputPath('SYNTHETIC-too-large.xlsx');
  await fs.writeFile(large, Buffer.alloc(51 * 1024 * 1024));
  await page.locator('#sourceFiles').setInputFiles(large);
  await readFiles(page);
  await expect(page.locator('#inventory')).toContainText('單檔上限50 MiB');
  await expect(page.locator('#download')).toBeDisabled();

  await page.locator('#sourceFiles').setInputFiles([]);
  await selectBytes(page.locator('#templateFile'), 'wrong.pptx', 'not a package');
  const oleHeader = [208, 207, 17, 224, 161, 177, 26, 225];
  await selectBytes(page.locator('#marketingSource'), 'SYNTHETIC-legacy.ppt', oleHeader);
  await readFiles(page);
  await expect(page.locator('main')).toContainText(/原始.*15頁|範本.*不符|無法讀取.*範本/);
  await expect(page.locator('#inventory')).toContainText(/舊版.*PPT|舊式.*PPT/);
  await expect(page.locator('#inventory')).toContainText('另存');
  await expect(page.locator('#download')).toBeDisabled();
});

test('large marketing deck retains page provenance and flags an unrecognizable picture separately', async ({ page }, info) => {
  test.setTimeout(120000);
  const { unexpected, pageErrors } = await start(page);
  await login(page);
  await page.locator('#meeting').fill('2026-11');
  const largeDeck = await fixtures.marketingZip(JSZip, 64 * 1024 * 1024);
  const deckPath = info.outputPath('SYNTHETIC-64MiB-marketing.pptx');
  await fs.writeFile(deckPath, await largeDeck.generateAsync({type: 'nodebuffer', compression: 'STORE'}));
  await page.locator('#marketingSource').setInputFiles(deckPath);
  await readFiles(page);
  const inventory = page.locator('#inventory');
  await expect(inventory).toContainText('SYNTHETIC-64MiB-marketing.pptx');
  await expect(inventory).toContainText(/64[.0-9]* MiB/);
  await expect(inventory).toContainText(/第\s*1\s*頁/);
  await expect(inventory).toContainText(/第\s*2\s*頁/);
  await expect(inventory).toContainText('2026年8月');
  await expect(inventory).toContainText(/未辨識|無法辨識|無法讀取|需補件|需補資料|未取得|不完整/);
  await expect(inventory).not.toContainText('STALE-HIDDEN');
  expect(unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
  await expect(page.locator('#download')).toBeDisabled();

  const card = inventory.locator('.source-card');
  await card.getByLabel('來源期間／政策生效版本').fill('2026-11-01 至 2026-11-30');
  await card.getByLabel('涵蓋範圍').selectOption('全公司／全通路');
  const partialPage = card.locator('.page-review').nth(1);
  await partialPage.locator('summary').first().click();
  const adopt = partialPage.getByRole('button', { name: '核對並採用本頁' });
  await adopt.click();
  await expect(partialPage.locator('p.status')).toContainText(/補註.*整理/);
  await partialPage.getByLabel('人工補註／校正文案').fill('主推方案：合成補註促案；活動價：999 元');
  await partialPage.getByRole('button', { name: '整理本頁補註' }).click();
  await expect(partialPage).toContainText('合成補註促案');
  await adopt.click();
  await expect(partialPage).toContainText('本頁重點已採用');
  await expect(page.locator('#mapping').getByRole('row', { name: /行銷簡報/ })).toContainText('待補');
});

test('standalone page is recognized locally, and changing the file removes its old findings', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { unexpected, pageErrors } = await start(page);
  await login(page);
  const image = await page.evaluate(() => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 1350, height: 300 });
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#000';
    context.font = '48px Arial';
    context.fillText('Eligibility: new customers', 32, 95);
    context.fillText('Price $999 until 2026-11-30', 32, 175);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await selectBytes(page.locator('#marketingSource'), 'SYNTHETIC-page-3.png', Buffer.from(image, 'base64'), 'image/png');
  await readFiles(page);
  const inventory = page.locator('#inventory');
  await expect(inventory).toContainText('SYNTHETIC-page-3.png');
  await expect(inventory).toContainText(/OCR|文字辨識/);
  await expect(inventory).toContainText(/new customers/i);
  expect(unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);

  await selectBytes(page.locator('#marketingSource'), 'SYNTHETIC-replacement.ppt', [208, 207, 17, 224, 161, 177, 26, 225]);
  await expect(inventory).not.toContainText(/new customers/i);
  await expect(page.locator('#download')).toBeDisabled();
  await readFiles(page);
  await expect(inventory).toContainText('SYNTHETIC-replacement.ppt');
  await expect(inventory).not.toContainText('SYNTHETIC-page-3.png');
});

test('encrypted workbook wrong password is actionable, correct password returns only aggregates', async ({ page }) => {
  test.setTimeout(120000);
  const { calls, unexpected } = await start(page);
  await login(page);
  await selectBytes(page.locator('#categorySource4'), 'SYNTHETIC-encrypted-good.xlsx', encryptedGood);
  await readFiles(page);
  const inventory = page.locator('#inventory');
  await expect(inventory).toContainText(/加密|開啟密碼/);
  await expect(inventory).not.toContainText('0店');
  await page.locator('.source-menu > summary').click();
  await page.locator('#goodSpeedPassword').fill('SYNTHETIC-WRONG');
  await readFiles(page);
  await expect(page.locator('main')).toContainText(/解密失敗|核對開啟密碼/);
  await expect(page.locator('#goodSpeedPassword')).toHaveValue('');

  await page.locator('#goodSpeedPassword').fill('SYNTHETIC-FILE-ONLY');
  await readFiles(page);
  await expect(inventory).toContainText(/好速|BB/);
  await expect(inventory).toContainText(/90\.0+%/);
  await expect(inventory).not.toContainText(/PRIVATE-|SYNTHETIC-order|SYNTHETIC-FILE-ONLY/);
  await expect(page.locator('#goodSpeedPassword')).toHaveValue('');
  expect(JSON.stringify(calls)).not.toContain('SYNTHETIC-FILE-ONLY');
  expect(await page.evaluate(() => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)])))
    .not.toContain('SYNTHETIC-FILE-ONLY');
  expect(unexpected).toEqual([]);
});

test('chapter preview preserves zero and missing values separately and refuses an incorrect source cutoff', async ({ page }, info) => {
  await start(page);
  await login(page);
  await page.locator('#meeting').fill('2026-11');
  const workbook = XLSX.utils.book_new();
  const rows = [
    ['督導區', '資料起日', '資料截止日', '期別', '手機保險件數', '手機銷售數', '穿戴保險件數', '穿戴銷售數'],
    ['北一二B', '2026-11-01', '2026-11-23', '本期', 0, 4, null, 0],
    ['北一二B', '2026-10-01', '2026-10-23', '比較期', 2, 4, 0, 0]
  ];
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '合成保險報表');
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await selectBytes(page.locator('#categorySource2'), 'SYNTHETIC-insurance.xlsx', bytes);
  const mapping = page.locator('#mapping').getByRole('row', { name: /保險/ });
  await expect(mapping).toContainText('已選檔，等待讀取');
  await readFiles(page);
  await expect(mapping).toContainText(/待補|待核對/);
  await page.locator('#inventory .source-panel > summary').click();
  const source = page.locator('#inventory .source-card');
  const table = source.getByRole('table');
  const current = table.getByRole('row', { name: /本期/ });
  await expect(current.getByRole('cell', { name: '0／4', exact: true })).toBeVisible();
  await expect(current.getByRole('cell', { name: '缺資料／0', exact: true })).toBeVisible();
  const period = source.getByLabel('來源期間／政策生效版本');
  await period.fill('2026-11-01 至 2026-11-22');
  await source.getByLabel('可納入報告的核對重點').fill('合成手機搭售為 0／4，穿戴件數保留缺值。');
  await source.getByRole('button', { name: '加入本期重點' }).click();
  await expect(source).toContainText(/原表截止日.*2026-11-23/);

  const { file } = await captureDownload(page, 'audit', info);
  const audit = JSON.parse(await fs.readFile(file, 'utf8'));
  expect(audit.sections['新復原者／保險'].facts).toHaveLength(0);
  expect(audit.status).toBe('DRAFT_UNMAPPED');
});

test('original template creates an editable 16-slide pending draft without historical company body', async ({ page }, info) => {
  test.skip(!templatePath, 'Optional private original template. Never committed.');
  test.setTimeout(120000);
  const { calls, unexpected } = await start(page);
  await login(page);
  await page.locator('#meeting').fill('2026-11');
  await page.locator('#templateFile').setInputFiles(templatePath);
  await selectBytes(page.locator('#sourceFiles'), 'SYNTHETIC.csv', '店點,期別\nSYNTHETIC,2026-11');
  await readFiles(page);
  await page.locator('#highlights').fill('合成測試行動摘要');
  await page.locator('#acknowledge').check();
  const { file, download } = await captureDownload(page, 'download', info);
  expect(download.suggestedFilename()).toMatch(/2026-11.*待核草稿\.pptx$/);
  const output = await JSZip.loadAsync(await fs.readFile(file));
  const original = await JSZip.loadAsync(await fs.readFile(templatePath));
  const slideNames = Object.keys(output.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  expect(slideNames).toHaveLength(16);
  for (const name of slideNames) {
    expect(await output.file(name).async('string')).toContain('待核草稿');
  }
  const summary = await output.file('ppt/slides/slide15.xml').async('string');
  expect(summary).toContain('合成測試行動摘要');
  expect(summary).toMatch(/<a:t[ >]/);
  const outputMedia = Object.keys(output.files).filter(name => /^ppt\/media\//.test(name) && !output.files[name].dir);
  const originalMedia = Object.keys(original.files).filter(name => /^ppt\/media\//.test(name) && !original.files[name].dir);
  expect(outputMedia.length).toBeLessThan(originalMedia.length);
  expect(output.file('EncryptionInfo')).toBe(null);
  expect(calls.filter(payload => payload?.key)).toEqual([{ action: 'ptauth', key: 'SYNTHETIC-SUPERVISOR' }]);
  expect(calls.filter(payload => payload?.token).length).toBeGreaterThanOrEqual(2);
  expect(unexpected).toEqual([]);
});

test('reviewed marketing facts and source page match the export, then period change resets approval', async ({ page }, info) => {
  await start(page);
  await login(page);
  await page.locator('#meeting').fill('2026-11');

  const zip = await fixtures.marketingZip(JSZip);
  zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="256" r:id="first"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/></p:presentation>');
  zip.file('ppt/slides/slide2.xml', '<p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree><p:sp><a:t>主推方案：合成測試優惠</a:t></p:sp><p:sp><a:t>活動期間：2026-11-01 至 2026-11-30</a:t></p:sp><p:sp><a:t>門市執行：核對資格</a:t></p:sp></p:spTree></p:cSld></p:sld>');
  await selectBytes(page.locator('#marketingSource'), 'SYNTHETIC-marketing-review.pptx', await zip.generateAsync({ type: 'nodebuffer' }));
  const mapping = page.locator('#mapping').getByRole('row', { name: /行銷簡報/ });
  await expect(mapping).toContainText('已選檔，等待讀取');
  await readFiles(page);
  await expect(mapping).toContainText('已讀取，等待核對');
  const sourceCard = page.locator('#inventory .source-card');
  const period = sourceCard.getByLabel('來源期間／政策生效版本');
  await period.fill('2026-11-01 至 2026-11-30');
  await sourceCard.getByLabel('涵蓋範圍').selectOption('全公司／全通路');
  const reviewedPage = sourceCard.locator('.page-review');
  await expect(reviewedPage).toContainText('來源明確記載');
  await expect(reviewedPage).toContainText('分析建議');
  await reviewedPage.getByRole('button', { name: '核對並採用本頁' }).click();
  await page.locator('#marketingComplete').check();
  await expect(mapping).toContainText('已完成來源核對');

  const exported = await captureDownload(page, 'audit', info);
  const audit = JSON.parse(await fs.readFile(exported.file, 'utf8'));
  const adopted = audit.sections['行銷簡報'];
  const evidenceFile = audit.sourceFiles.find(file => file.name === 'SYNTHETIC-marketing-review.pptx');
  expect(adopted.status).toBe('verified');
  expect(adopted.facts.some(item => item.text.includes('合成測試優惠') &&
    /第\s*1\s*頁/.test(item.locator) && item.sourceSha256 === evidenceFile.sha256)).toBe(true);
  expect(adopted.recommendations.length).toBeGreaterThan(0);
  expect(audit.status).toBe('DRAFT_UNMAPPED');

  await period.fill('2026-12-01 至 2026-12-31');
  await expect(mapping).toContainText('等待核對');
  await expect(sourceCard).not.toContainText('已採用');
  await expect(page.locator('#marketingComplete')).not.toBeChecked();
  await reviewedPage.getByRole('button', { name: '核對並採用本頁' }).click();
  await expect(reviewedPage).toContainText(/本次會議相關.*期間/);
  const updated = await captureDownload(page, 'audit', info);
  const after = JSON.parse(await fs.readFile(updated.file, 'utf8'));
  expect(after.sections['行銷簡報'].facts).toHaveLength(0);
});

test('logout during export authorization prevents late download', async ({ page }) => {
  test.skip(!templatePath, 'Optional private original template. Never committed.');
  await start(page);
  await login(page);
  await page.locator('#templateFile').setInputFiles(templatePath);
  await selectBytes(page.locator('#sourceFiles'), 'SYNTHETIC.csv', '店點,期別\nSYNTHETIC,2026-11');
  await readFiles(page);
  await page.locator('#acknowledge').check();

  let release, seen;
  const gate = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { seen = resolve; });
  await page.unroute('https://script.google.com/**');
  await page.route('https://script.google.com/**', async route => {
    seen();
    await gate;
    return route.fulfill({
      json: { status: 'ok', token: supervisorToken, expiresAt: Math.floor(Date.now() / 1000) + 3600, sessionContract: 'patrol-session-v2' }
    }).catch(() => {});
  });
  const downloads = [];
  page.on('download', download => downloads.push(download));
  await page.locator('#download').click();
  await requested;
  await page.evaluate(() => window.dispatchEvent(new Event('portal-before-logout')));
  release();
  await expect(page.locator('#workspace')).toBeHidden();
  await expect(page.locator('#sourceFiles')).toHaveValue('');
  await page.waitForLoadState('networkidle');
  expect(downloads).toHaveLength(0);
});

test('optional genuine November marketing page files are read through local OCR and remain unreviewed', async ({ page }) => {
  const directory = process.env.OP_MARKETING_IMAGE_DIR;
  test.skip(!directory, 'Optional private November source images. Never committed.');
  test.setTimeout(120000);
  const { calls, unexpected, pageErrors } = await start(page);
  await login(page);
  await page.locator('#meeting').fill('2026-11');
  const names = ['image(20261028-101810).png', 'image(20261028-101812).png', 'image(20261028-101816).png'];
  await page.locator('#marketingSource').setInputFiles(names.map(name => path.join(directory, name)));
  await readFiles(page);
  const preview = await page.locator('#inventory').textContent();
  // Only boolean results are printed, including when a private fixture test fails.
  expect(names.every(name => preview.includes(name))).toBe(true);
  expect(/新\s*復\s*原\s*者|REDMI|moto\s*edge\s*70|Android/i.test(preview)).toBe(true);
  await expect(page.locator('#download')).toBeDisabled();
  expect(calls.every(payload => payload?.action === 'ptauth')).toBe(true);
  expect(unexpected).toEqual([]);
  expect(pageErrors).toEqual([]);
});
