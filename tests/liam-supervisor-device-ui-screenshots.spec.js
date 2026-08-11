const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FORMAL_FILE_URL = process.env.LIAM_APP_BASE_URL || `file://${path.join(ROOT, 'app.html')}`;
const FILE_URL = `${FORMAL_FILE_URL}${FORMAL_FILE_URL.includes('?')?'&':'?'}preview=1`;
const OUTPUT = path.join(ROOT, 'artifacts', 'liam-supervisor-app-1-1-device-ui');

test.use({ viewport:{ width:390, height:844 } });

test('capture scoped device UI and verify every view has no console or horizontal overflow', async ({ page }) => {
  fs.mkdirSync(OUTPUT, { recursive:true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(FILE_URL);
  if (FILE_URL.startsWith('http')) {
    await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration('./')))).toBe(true);
  }

  const noOverflow = async () => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  };

  await noOverflow();
  await page.locator('.store-board').screenshot({ path:path.join(OUTPUT, 'home-kpi-nine-stores-390x844.png') });
  await page.locator('#awardHome').screenshot({ path:path.join(OUTPUT, 'home-awards-nine-stores-390x844.png') });

  await page.locator('.bottom-nav [data-nav="battle"]').click();
  await noOverflow();
  await page.locator('[data-view="battle"]').screenshot({ path:path.join(OUTPUT, 'battle-kpi-390x844.png') });
  await page.locator('[data-battle-kind="award"]').click();
  await noOverflow();
  await page.locator('[data-view="battle"]').screenshot({ path:path.join(OUTPUT, 'battle-awards-nine-stores-390x844.png') });

  await page.locator('.bottom-nav [data-nav="patrol"]').click();
  await noOverflow();
  await page.locator('[data-view="patrol"]').screenshot({ path:path.join(OUTPUT, 'patrol-overview-390x844.png') });
  expect(errors).toEqual([]);
});
