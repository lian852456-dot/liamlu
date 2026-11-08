// The generated-file sync check must allow only the two acknowledged,
// hash-pinned differences and block new drift, changed drift and build failures.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluate } from '../scripts/check-generated-sync.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(fs.readFileSync(path.join(root, 'scripts/generated-sync-baseline.json'), 'utf8'));
const [patrol, assets] = baseline.allowedDrift;
const known = entry => ({ file: entry.file, committedSha256: entry.committedSha256, generatedSha256: entry.generatedSha256 });
const results = (...drifts) => [{ script: 'scripts/build-x.mjs', error: null, drift: drifts }];

test('only the two recorded differences are allowed', () => {
  assert.equal(baseline.allowedDrift.length, 2);
  assert.deepEqual(baseline.allowedDrift.map(e => e.file), ['patrol-gas/DepartmentScoresCore.gs', 'department-readonly-assets.js']);
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
  // Committed generated files may have been touched by other tests' builds.
  for (const entry of baseline.allowedDrift) fs.writeFileSync(path.join(dir, entry.file), execFileSync('git', ['show', 'HEAD:' + entry.file], { cwd: root }));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}
const runCheck = dir => spawnSync(process.execPath, ['scripts/check-generated-sync.mjs', '--json'], { cwd: dir, encoding: 'utf8', timeout: 300_000 });

test('end to end: the repository as committed passes', () => {
  const dir = scratchCopy();
  try {
    const out = runCheck(dir);
    assert.equal(out.status, 0, out.stdout + out.stderr);
    assert.equal(JSON.parse(out.stdout).findings.filter(f => f.level === 'known').length, 2);
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

test('end to end: changing the source behind a known difference blocks', () => {
  const dir = scratchCopy();
  try {
    fs.appendFileSync(path.join(dir, 'gas/DepartmentScoresCore.gs'), '\n// source change\n');
    const out = runCheck(dir);
    assert.equal(out.status, 1);
    assert.ok(JSON.parse(out.stdout).findings.some(f => f.kind === 'drift-changed' && f.file === patrol.file));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
