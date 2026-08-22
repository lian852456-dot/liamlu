const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function functionsIn(source) {
  return new Set([...source.matchAll(/^function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map(match => match[1]));
}

function functionBlock(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`unterminated function ${name}`);
}

function sourceCalls(block, knownFunctions) {
  return new Set(
    [...block.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)]
      .map(match => match[1])
      .filter(name => knownFunctions.has(name))
  );
}

test('isolated Patrol bundle contains the complete reachable helper closure for every route', () => {
  const main = fs.readFileSync(path.join(root, 'gas', 'Code.gs'), 'utf8');
  const mainHalfMedia = fs.readFileSync(path.join(root, 'gas', 'HalfMedia.gs'), 'utf8');
  const bundle = fs.readFileSync(path.join(root, 'patrol-gas', 'PatrolCode.gs'), 'utf8');
  const bundleHalfMedia = fs.readFileSync(path.join(root, 'patrol-gas', 'HalfMedia.gs'), 'utf8');
  const canonicalSource = `${main}\n${mainHalfMedia}`;
  const generated = `${bundle}\n${bundleHalfMedia}`;
  const sourceFunctions = functionsIn(canonicalSource);
  const bundleFunctions = functionsIn(generated);
  const requiredActions = [
    'ptauth', 'ptlogout', 'ptsummary', 'ptdetail', 'ptmileage', 'ptmileage2',
    'ptvisit_read', 'ptvisit_write', 'hread', 'hwrite', 'sread', 'half_media_upload'
  ];

  for (const action of requiredActions) {
    assert.match(bundle, new RegExp(`['\"]${action}['\"]`), `missing route ${action}`);
  }

  const queue = ['doGet', 'doPost', 'patrolGetRoute_', 'patrolHealth_'];
  const visited = new Set();
  const missing = new Set();
  while (queue.length) {
    const name = queue.pop();
    if (visited.has(name)) continue;
    visited.add(name);
    assert.ok(bundleFunctions.has(name), `route closure is missing ${name}`);
    for (const dependency of sourceCalls(functionBlock(generated, name), sourceFunctions)) {
      if (!bundleFunctions.has(dependency)) missing.add(`${name} -> ${dependency}`);
      else if (!visited.has(dependency)) queue.push(dependency);
    }
  }

  assert.deepEqual([...missing], [], `generated Patrol bundle has undefined helper dependencies: ${[...missing].join(', ')}`);
  assert.doesNotMatch(generated, /audit_|auditReport|AuditReport|privateDashboard|reportUpload/i);
});
