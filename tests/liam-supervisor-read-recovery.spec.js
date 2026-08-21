const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { patrolSummaryResponse } = require('./fixtures/patrol-summary-response.cjs');

const FORMAL_URL = `file://${path.resolve(__dirname, '../app.html')}#patrol`;
const TOKEN = 'read-recovery-timeout-token';

test.use({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });

test('hread Google HTML 404 is retried once then fails closed', async ({ page }) => {
  const errors = [];
  const writes = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(token => sessionStorage.setItem('bei12b_patrol_session_token_v2', token), TOKEN);
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      if (payload.action === 'ptvisit_write' || payload.action === 'hwrite' || payload.action === 'half_media_upload') writes.push(payload.action);
      if (payload.action === 'ptauth') return route.fulfill({ json:{ status:'ok', token:TOKEN, expiresIn:1800 } });
      return route.fulfill({ json:{ status:'error', message:'unexpected POST' } });
    }
    const action = new URL(request.url()).searchParams.get('action');
    if (action === 'hread') return route.fulfill({ status:404, contentType:'text/html', body:'<!doctype html><title>Not Found</title>' });
    if (action === 'sread') return route.fulfill({ json:{ status:'ok', schedule:{ month:'2026-08', stores:[] } } });
    if (action === 'ptsummary') return route.fulfill({ json:patrolSummaryResponse('2026-08') });
    if (action === 'ptvisit_read') return route.fulfill({ json:{ status:'ok', events:[], openVisit:null } });
    return route.fulfill({ json:{ status:'error', message:'unexpected action' } });
  });

  await page.goto(FORMAL_URL);
  const started = Date.now();
  await page.locator('[data-patrol-check-view="half-month"]').click();
  await expect(page.locator('#halfMonthCheckPreview')).toContainText('正式資料服務暫時回傳 HTTP 404', { timeout:4_000 });
  expect(Date.now() - started).toBeLessThan(4_000);
  await expect(page.locator('#halfMonthCheckPreview')).not.toContainText('正在讀取半月督導檢查…');
  const layout = await page.evaluate(() => ({
    overflow:document.documentElement.scrollWidth - document.documentElement.clientWidth,
    viewport:document.documentElement.clientWidth
  }));
  expect(layout.viewport).toBe(390);
  expect(layout.overflow).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
});
