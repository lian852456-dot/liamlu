import assert from 'node:assert/strict';
import { webkit } from 'playwright';

const APP_URL = process.env.LIAM_RECOVERY_APP_URL ||
  'https://lian852456-dot.github.io/liamlu/app.html?preview=1';
const PATROL_API =
  'https://script.google.com/macros/s/AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv/exec';

const browser = await webkit.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded', timeout: 20_000 });

  const result = await page.evaluate(async ({ api }) => {
    const timeout = (promise, label) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), 8_000))
    ]);
    const readResponse = async input => {
      const started = performance.now();
      try {
        const response = await timeout(fetch(input, { method:'GET', cache:'no-store' }), 'fetch');
        const text = await timeout(response.text(), 'response');
        const body = JSON.parse(text);
        return {
          ok:true,
          status:response.status,
          redirected:response.redirected,
          finalHost:new URL(response.url).host,
          bodyStatus:body.status || '',
          elapsedMs:Math.round(performance.now() - started)
        };
      } catch (error) {
        return { ok:false, name:error.name, message:error.message };
      }
    };

    let urlObject;
    let urlObjectSetup;
    try {
      urlObject = new URL(api);
      urlObject.searchParams.set('action', 'hread');
      urlObject.searchParams.set('token', 'invalid-recovery-probe');
      urlObjectSetup = { ok:true };
    } catch (error) {
      urlObjectSetup = { ok:false, name:error.name, message:error.message };
    }

    const stringUrl = `${api}?action=${encodeURIComponent('hread')}&token=${encodeURIComponent('invalid-recovery-probe')}`;
    return {
      urlObjectSetup,
      urlObjectFetch:urlObject ? await readResponse(urlObject) : null,
      stringFetch:await readResponse(stringUrl)
    };
  }, { api:PATROL_API });

  assert.equal(result.urlObjectSetup.ok, true);
  assert.equal(result.stringFetch.ok, true);
  assert.equal(result.stringFetch.status, 200);
  assert.equal(result.stringFetch.bodyStatus, 'error');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
