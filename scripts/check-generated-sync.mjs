#!/usr/bin/env node
// Checks that committed generated files (GAS deployment bundles and
// embedded offline-export assets) match what their build scripts produce
// from the current sources. It never writes to the working tree: every build
// runs inside a temporary copy, and only the differences are reported.
//
//   node scripts/check-generated-sync.mjs          # exit 1 when anything drifted
//   node scripts/check-generated-sync.mjs --json   # machine-readable report
//
// This does not and cannot tell what is deployed in Apps Script; it only
// guarantees the repo copy you would paste is in step with its sources.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Deterministic builds that take no arguments, with what they generate.
export const BUILDS = [
  { script: 'scripts/build-patrol-gas-bundle.mjs', purpose: '巡店 GAS 部署包（patrol-gas/）' },
  { script: 'scripts/build-tradein-gas.mjs', purpose: '舊換新 GAS 檔案' },
  { script: 'scripts/build-readonly-conversion-assets.mjs', purpose: '締結率轉換 GAS 資產' },
  { script: 'scripts/build-department-readonly-assets.mjs', purpose: '部區管理離線匯出資產' },
  { script: 'scripts/build-store-readonly-assets.mjs', purpose: '門市快照離線匯出資產' },
  { script: 'scripts/build-threec-readonly-assets.mjs', purpose: '3C 查價離線匯出資產' },
  { script: 'scripts/build-north12-officer.mjs', purpose: '北一二專員頁資產' },
];

function listFiles(dir) {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: dir, encoding: 'utf8', maxBuffer: 64 << 20 });
  return out.split('\0').filter(Boolean).filter(f => fs.existsSync(path.join(dir, f)) && fs.statSync(path.join(dir, f)).isFile());
}
function hashTree(dir, files) {
  const map = new Map();
  for (const f of files) map.set(f, crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, f))).digest('hex'));
  return map;
}
function walk(dir, base = dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, acc); else acc.push(path.relative(base, full));
  }
  return acc;
}

export function checkGeneratedSync() {
  const files = listFiles(root);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-sync-'));
  try {
    for (const f of files) {
      fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
      fs.copyFileSync(path.join(root, f), path.join(tmp, f));
    }
    const nodeModules = path.join(root, 'node_modules');
    if (fs.existsSync(nodeModules)) fs.symlinkSync(nodeModules, path.join(tmp, 'node_modules'), 'dir');
    const results = [];
    for (const build of BUILDS) {
      const before = hashTree(tmp, walk(tmp));
      let error = null;
      try { execFileSync(process.execPath, [build.script], { cwd: tmp, stdio: 'pipe', timeout: 120_000 }); }
      catch (e) { error = String(e.stderr || e.message).trim().split('\n').slice(-1)[0]; }
      const after = hashTree(tmp, walk(tmp));
      const changed = [...after.keys()].filter(f => before.get(f) !== after.get(f));
      // Drift = a generated file differs from the committed/working-tree copy.
      const original = new Set(files);
      const drift = changed.filter(f => !original.has(f) || crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex') !== after.get(f));
      results.push({ ...build, error, drift });
    }
    return results;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = checkGeneratedSync();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      const status = r.error ? `建置失敗：${r.error}` : r.drift.length ? `不同步 ${r.drift.length} 檔` : '同步';
      console.log(`${r.drift.length || r.error ? '✗' : '✓'} ${r.purpose}（${r.script}）：${status}`);
      for (const f of r.drift) console.log(`    - ${f}`);
    }
  }
  const bad = results.filter(r => r.error || r.drift.length);
  if (bad.length && !process.argv.includes('--json')) {
    console.log('\n不同步的檔案需由負責人確認後執行對應的 build 指令並提交；本檢查不會修改任何檔案，也不會部署 GAS。');
  }
  process.exit(bad.length ? 1 : 0);
}
