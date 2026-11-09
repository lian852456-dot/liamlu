'use strict';
// The app shell and pages must always be checked against the deployed
// version while online (no stale code), but may reuse an unchanged copy via
// HTTP revalidation instead of re-downloading it on every visit.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');

function worker({ offline = false, cachedUrls = [] } = {}) {
  const handlers = {}, puts = [], matches = [], fetches = [];
  const scope = 'https://example.test/liamlu/';
  const context = vm.createContext({
    URL, Response, Headers,
    self: { location: { origin: 'https://example.test' }, registration: { scope }, addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting() {}, clients: { claim() {} } },
    fetch: async (request, options) => { fetches.push({ url: request.url, options }); if (offline) throw Error('offline'); return new Response('DEPLOYED'); },
    caches: {
      open: async () => ({ put: async request => puts.push(request.url), addAll: async () => {} }),
      match: async (request, options) => {
        matches.push({ url: request.url || request, options });
        const url = request.url || request;
        const hit = cachedUrls.find(u => (options && options.ignoreSearch ? u.split('?')[0] === url.split('?')[0] : u === url));
        return hit ? new Response('CACHED ' + hit) : undefined;
      },
      keys: async () => [],
    },
  });
  vm.runInContext(fs.readFileSync(require.resolve('../service-worker.js'), 'utf8'), context);
  return { handlers, puts, matches, fetches, scope };
}
async function get(runtime, url, mode = 'no-cors') {
  let response;
  runtime.handlers.fetch({ request: { url, method: 'GET', mode }, respondWith: value => { response = value; } });
  return await response;
}

test('online app-shell scripts are revalidated with the server, never served cache-first', async () => {
  for (const asset of ['app.js?v=new', 'GasBClient.js?v=x', 'vendor-loader.js?v=1', 'assets/vendor/xlsx.full.min.js', 'kpi-battle-controller.js?v=1']) {
    const r = worker({ cachedUrls: ['https://example.test/liamlu/' + asset] });
    assert.equal(await (await get(r, r.scope + asset)).text(), 'DEPLOYED', asset);
    assert.equal(r.fetches.length, 1, asset);
    assert.equal(r.fetches[0].options.cache, 'no-cache', asset);
    assert.equal(r.matches.length, 0, asset);
  }
});

test('online pages are revalidated with the server', async () => {
  for (const page of ['index.html', 'app.html', 'department-ops.html', '']) {
    const r = worker({ cachedUrls: ['https://example.test/liamlu/' + page] });
    assert.equal(await (await get(r, r.scope + page, 'navigate')).text(), 'DEPLOYED', page);
    assert.equal(r.fetches[0].options.cache, 'no-cache', page);
  }
});

test('offline shell fallback prefers the exact requested version', async () => {
  const r = worker({ offline: true, cachedUrls: ['https://example.test/liamlu/app.js?v=old', 'https://example.test/liamlu/app.js?v=new'] });
  assert.equal(await (await get(r, r.scope + 'app.js?v=new')).text(), 'CACHED https://example.test/liamlu/app.js?v=new');
  assert.equal(r.matches[0].options, undefined);
});

test('offline shell fallback still works when only another version is cached', async () => {
  const r = worker({ offline: true, cachedUrls: ['https://example.test/liamlu/app.js?v=old'] });
  assert.equal(await (await get(r, r.scope + 'app.js?v=new')).text(), 'CACHED https://example.test/liamlu/app.js?v=old');
});

test('the controller is no longer rewritten at runtime', () => {
  const source = fs.readFileSync(require.resolve('../service-worker.js'), 'utf8');
  assert.doesNotMatch(source, /oldGuard|newGuard|networkFirstKpiController/);
});

test('files the pages load on demand are precached for offline use', () => {
  const source = fs.readFileSync(require.resolve('../service-worker.js'), 'utf8');
  for (const file of ['vendor-loader.js', 'assets/vendor/xlsx.full.min.js']) {
    assert.match(source, new RegExp(`'\\./${file.replace(/[.]/g, '\\.')}'`), file);
    assert.ok(fs.existsSync(require.resolve('../' + file)), file);
  }
});
