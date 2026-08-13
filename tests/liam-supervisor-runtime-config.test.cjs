const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'app-runtime-config.json'), 'utf8'));

function functionSource(name) {
  const start = app.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing ${name}`);
  const brace = app.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < app.length; index += 1) {
    if (app[index] === '{') depth += 1;
    if (app[index] === '}') depth -= 1;
    if (depth === 0) return app.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function validator() {
  const context = vm.createContext({ URL });
  vm.runInContext(`
    const RUNTIME_CONFIG_KEYS = Object.freeze(['configVersion','privateApi','patrolApi']);
    ${functionSource('runtimeEndpointAllowed')}
    ${functionSource('validateRuntimeConfig')}
  `, context);
  return context.validateRuntimeConfig;
}

test('runtime config contains only the public endpoint contract and validates', () => {
  assert.deepEqual(Object.keys(config).sort(), ['configVersion','patrolApi','privateApi']);
  assert.deepEqual(JSON.parse(JSON.stringify(validator()(config))), config);
  assert.equal(/token|passcode|employee|device|secret|oauth/i.test(JSON.stringify(config)), false);
});

test('runtime config rejects arbitrary domains, non-HTTPS URLs, query strings, and extra fields', () => {
  const validate = validator();
  const cases = [
    { ...config, patrolApi:'https://evil.example/exec' },
    { ...config, patrolApi:config.patrolApi.replace('https:', 'http:') },
    { ...config, privateApi:`${config.privateApi}?token=bad` },
    { ...config, secret:'not-allowed' },
    { ...config, configVersion:'' }
  ];
  cases.forEach(candidate => assert.throws(() => validate(candidate)));
});

test('cold launch and manual refresh read no-store config before formal requests', () => {
  assert.match(app, /fetch\(`\.\/app-runtime-config\.json\?ts=\$\{Date\.now\(\)\}`,[\s\S]*cache:'no-store'/);
  assert.match(app, /async function initializeRuntime\(\)[\s\S]*await loadRuntimeConfig\(\);[\s\S]*loadFormalSummary\(stored\)/);
  assert.match(app, /data-refresh[\s\S]*await loadRuntimeConfig\(\)/);
  assert.match(app, /runtimeConfig\.privateApi/);
  assert.match(app, /runtimeConfig\.patrolApi/);
});

test('Service Worker never precaches or serves cached runtime config', () => {
  const shell = worker.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(shell);
  assert.doesNotMatch(shell[1], /app-runtime-config/);
  assert.match(worker, /pathname\.endsWith\('\/app-runtime-config\.json'\)[\s\S]*fetch\(event\.request, \{ cache:'no-store' \}\)/);
});
