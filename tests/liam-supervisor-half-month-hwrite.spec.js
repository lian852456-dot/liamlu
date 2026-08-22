const { test, expect } = require('@playwright/test');
const path = require('node:path');
const fixture = require('./fixtures/half-month-hread-fixture.cjs');
const { patrolSummaryResponse } = require('./fixtures/patrol-summary-response.cjs');

const APP_URL = `file://${path.resolve(__dirname, '../app.html')}#patrol`;
const TOKEN = 'formal-read-recovery-token';
test.use({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });

test('recovery keeps formal hread available while hwrite and media remain unreachable', async ({ page }) => {
  const writes = [];
  await page.addInitScript(token => sessionStorage.setItem('bei12b_patrol_session_token_v2', token), TOKEN);
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      if (payload.action === 'ptauth') return route.fulfill({ json:{ status:'ok', token:TOKEN, expiresIn:1800 } });
      if (payload.action === 'ptlogout') return route.fulfill({ json:{ status:'ok' } });
      if (payload.action === 'hwrite' || payload.action === 'half_media_upload') writes.push(payload.action);
      return route.fulfill({ json:{ status:'error', message:'unexpected POST' } });
    }
    const action = new URL(request.url()).searchParams.get('action') || '';
    if (action === 'sread') return route.fulfill({ json:{ status:'ok', schedule:{ month:'2026-08', stores:[] } } });
    if (action === 'ptsummary') return route.fulfill({ json:patrolSummaryResponse('2026-08') });
    if (action === 'ptvisit_read') return route.fulfill({ json:{ status:'ok', events:[], openVisit:null } });
    if (action === 'hread') return route.fulfill({ json:{ status:'ok', rows:fixture.rows } });
    if (action === 'hwrite' || action === 'half_media_upload') writes.push(action);
    return route.fulfill({ json:{ status:'error', message:`unexpected ${action}` } });
  });

  await page.goto(APP_URL);
  await page.locator('[data-patrol-check-view="half-month"]').click();
  await expect(page.locator('#halfMonthCheckPreview')).toContainText('FORMAL READ / 正式唯讀');
  await expect(page.locator('.half-preview-store')).toHaveCount(9);
  await page.locator('[data-half-preview-action="start"]').click();
  await expect(page.locator('[data-half-preview-action="save"]')).toHaveCount(0);
  await expect(page.locator('#halfMonthCheckPreview')).toContainText('FORMAL READ / 正式唯讀');
  await expect(page.locator('[data-half-answer]').first()).toBeDisabled();
  expect(writes).toEqual([]);
  const layout = await page.evaluate(() => ({
    overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    shortButtons:Array.from(document.querySelectorAll('[data-view="patrol"] button'))
      .filter(button => button.getBoundingClientRect().width > 0 && button.getBoundingClientRect().height < 44)
      .map(button => button.textContent.trim())
  }));
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(layout.shortButtons).toEqual([]);
});
