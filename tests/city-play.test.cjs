const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CityPlay = require('../city-play.js');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('fixed city entry is a no-input navigation page with a validated active endpoint', () => {
  const html = read('city-play.html');
  const config = JSON.parse(read('city-endpoint.json'));
  assert.match(html, /id="city-enter"[^>]*>進入小城/);
  assert.match(html, /固定入口，遊戲由 Mac 提供/);
  assert.doesNotMatch(html, /<input\b/i);
  assert.doesNotMatch(html, /<form\b/i);
  assert.equal(config.schema, 'north12b-city-endpoint/v1');
  assert.equal(config.enabled, true);
  assert.equal(CityPlay.resolveEndpointConfig(config).ok, true);
});

test('destination origin is fail-closed and only accepts root HTTPS origins', () => {
  assert.equal(CityPlay.isAllowedOrigin('https://city.trycloudflare.com/'), true);
  assert.equal(CityPlay.isAllowedOrigin('https://city.example.test/', { fixedOrigins: ['https://city.example.test/'] }), true);
  for (const value of [
    'http://city.trycloudflare.com/',
    'https://city.trycloudflare.com/game',
    'https://city.trycloudflare.com/?next=https://evil.test',
    'https://city.trycloudflare.com/#hash',
    'https://user:pass@city.trycloudflare.com/',
    'https://city.trycloudflare.com:8443/',
    'https://evil.example.test/',
  ]) assert.equal(CityPlay.isAllowedOrigin(value), false, value);
});

test('connected probe checks both public health endpoints without credentials', async () => {
  const config = CityPlay.resolveEndpointConfig({
    schema: 'north12b-city-endpoint/v1', enabled: true, origin: 'https://city.trycloudflare.com/',
    healthPath: '/health', readyPath: '/ready', fixedOrigins: [],
  });
  const calls = [];
  const result = await CityPlay.probe(config, {
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => ({ schema: 'north12b-city-health/v1', status: 'ok', ready: true }) };
    },
  });
  assert.equal(result.state, 'connected');
  assert.deepEqual(calls.map(call => call.url), ['https://city.trycloudflare.com/health', 'https://city.trycloudflare.com/ready']);
  for (const call of calls) {
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.cache, 'no-store');
    assert.equal(call.options.method, 'GET');
  }
});

test('disabled placeholder stays offline and makes no backend request', async () => {
  const config = CityPlay.resolveEndpointConfig({schema:'north12b-city-endpoint/v1',enabled:false,origin:''});
  let calls = 0;
  const result = await CityPlay.probe(config, { fetcher: async () => { calls += 1; } });
  assert.equal(result.state, 'offline');
  assert.equal(result.error, 'CITY_ENDPOINT_DISABLED');
  assert.equal(calls, 0);
});

test('HTTP 200 without valid game health is offline', async()=>{const c=CityPlay.resolveEndpointConfig({enabled:true,origin:'https://city.trycloudflare.com/'});const r=await CityPlay.probe(c,{fetcher:async()=>({ok:true,json:async()=>({status:'ok'})})});assert.equal(r.state,'offline');});
