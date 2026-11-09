// The generated-file sync check must allow only differences recorded with
// exact hashes in the baseline, and block new drift, changed drift and build
// failures. The repository baseline is empty once every file is in sync.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../scripts/check-generated-sync.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoBaseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts/generated-sync-baseline.json'), 'utf8'));
// Fixture baseline for the rule tests, independent of the repository's state.
const patrol = { file: 'patrol-gas/DepartmentScoresCore.gs', committedSha256: 'c1', generatedSha256: 'g1', reason: 'fixture' };
const assets = { file: 'department-readonly-assets.js', committedSha256: 'c2', generatedSha256: 'g2', reason: 'fixture' };
const baseline = { allowedDrift: [patrol, assets] };
const known = entry => ({ file: entry.file, committedSha256: entry.committedSha256, generatedSha256: entry.generatedSha256 });
const results = (...drifts) => [{ script: 'scripts/build-x.mjs', error: null, drift: drifts }];

test('the repository baseline allows nothing: every generated file is in sync', () => {
  assert.deepEqual(repoBaseline.allowedDrift, []);
});

test('with an empty baseline any difference blocks', () => {
  const v = evaluate(results(known(patrol)), { allowedDrift: [] });
  assert.equal(v.ok, false);
  assert.equal(v.findings[0].kind, 'new-drift');
});

test('differences recorded with exact hashes are allowed', () => {
  const v = evaluate(results(known(patrol), known(assets)), baseline);
  assert.equal(v.ok, true);
  assert.deepEqual(v.findings.map(f => f.kind), ['known-drift', 'known-drift']);
});

test('a new out-of-sync file blocks', () => {
  const v = evaluate(results(known(patrol), known(assets), { file: 'tradein-gas/Code.gs', committedSha256: 'a', generatedSha256: 'b' }), baseline);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some(f => f.kind === 'new-drift' && f.file === 'tradein-gas/Code.gs'));
});

test('a known difference that grows or changes blocks (build output moved)', () => {
  const v = evaluate(results({ ...known(patrol), generatedSha256: 'different' }, known(assets)), baseline);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some(f => f.kind === 'drift-changed' && f.file === patrol.file));
});

test('a known difference that changes on the committed side blocks', () => {
  const v = evaluate(results(known(patrol), { ...known(assets), committedSha256: 'edited' }), baseline);
  assert.equal(v.ok, false);
  assert.ok(v.findings.some(f => f.kind === 'drift-changed' && f.file === assets.file));
});

test('a failed build blocks', () => {
  const v = evaluate([{ script: 'scripts/build-x.mjs', error: 'boom', drift: [] }], baseline);
  assert.equal(v.ok, false);
  assert.equal(v.findings[0].kind, 'build-failed');
});

test('a known difference that has been synced passes with a note to drop it', () => {
  const v = evaluate(results(known(patrol)), baseline);
  assert.equal(v.ok, true);
  assert.ok(v.findings.some(f => f.kind === 'baseline-resolved' && f.file === assets.file));
});

// End to end on scratch copies of the repository.
function scratchCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-check-test-'));
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean);
  for (const f of files) {
    const from = path.join(root, f);
    if (!fs.existsSync(from) || !fs.statSync(from).isFile()) continue;
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.copyFileSync(from, path.join(dir, f));
  }
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}
const runCheck = dir => spawnSync(process.execPath, ['scripts/check-generated-sync.mjs', '--json'], { cwd: dir, encoding: 'utf8', timeout: 300_000 });

test('end to end: the repository as committed passes', () => {
  const dir = scratchCopy();
  try {
    const out = runCheck(dir);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.deepEqual(JSON.parse(out.stdout).findings.filter(f => f.level === 'block'), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('end to end: editing a generated file that was in sync blocks', () => {
  const dir = scratchCopy();
  try {
    fs.appendFileSync(path.join(dir, 'north12-officer-export-assets.js'), '\n// hand edit\n');
    const out = runCheck(dir);
    assert.equal(out.status, 1);
    assert.ok(JSON.parse(out.stdout).findings.some(f => f.kind === 'new-drift' && f.file === 'north12-officer-export-assets.js'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('end to end: changing a source without regenerating blocks', () => {
  const dir = scratchCopy();
  try {
    fs.appendFileSync(path.join(dir, 'gas/DepartmentScoresCore.gs'), '\n// source change\n');
    const out = runCheck(dir);
    assert.equal(out.status, 1);
    assert.ok(JSON.parse(out.stdout).findings.some(f => f.kind === 'new-drift' && f.file === 'patrol-gas/DepartmentScoresCore.gs'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('end to end: a recorded difference passes, and blocks once it changes', () => {
  const dir = scratchCopy();
  try {
    fs.appendFileSync(path.join(dir, 'gas/DepartmentScoresCore.gs'), '\n// source change\n');
    const drift = JSON.parse(runCheck(dir).stdout).results.flatMap(r => r.drift).find(d => d.file === 'patrol-gas/DepartmentScoresCore.gs');
    fs.writeFileSync(path.join(dir, 'scripts/generated-sync-baseline.json'), JSON.stringify({ allowedDrift: [{ ...drift, reason: 'test' }] }));
    const allowed = runCheck(dir);
    assert.equal(allowed.status, 0, allowed.stdout);
    assert.ok(JSON.parse(allowed.stdout).findings.some(f => f.kind === 'known-drift' && f.file === drift.file));
    fs.appendFileSync(path.join(dir, 'gas/DepartmentScoresCore.gs'), '// another change\n');
    const changed = runCheck(dir);
    assert.equal(changed.status, 1);
    assert.ok(JSON.parse(changed.stdout).findings.some(f => f.kind === 'drift-changed' && f.file === drift.file));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
