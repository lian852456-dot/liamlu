#!/usr/bin/env node
// Checks that committed generated files (GAS deployment bundles and
// embedded offline-export assets) match what their build scripts produce
// from the current sources. It never writes to the working tree: every build
// runs inside a temporary copy, and only the differences are reported.
//
// Known differences the owner has acknowledged are listed, by exact content
// hash, in scripts/generated-sync-baseline.json. The check fails when:
//   - a build fails,
//   - any file differs that is not in the baseline (new drift),
//   - a baselined file differs in any other way than recorded (drift changed
//     or grew: either the committed copy or the build output moved).
// A baselined file that is now in sync passes with a note to drop the entry.
//
//   node scripts/check-generated-sync.mjs          # exit 1 on any blocking finding
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
const BASELINE = path.join(root, 'scripts', 'generated-sync-baseline.json');
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

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
      const drift = changed.filter(f => !original.has(f) || sha(fs.readFileSync(path.join(root, f))) !== after.get(f))
        .map(f => ({ file: f, committedSha256: original.has(f) ? sha(fs.readFileSync(path.join(root, f))) : null, generatedSha256: after.get(f) }));
      results.push({ ...build, error, drift });
    }
    return results;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Compares a check result with the acknowledged baseline.
export function evaluate(results, baseline) {
  const allowed = new Map((baseline.allowedDrift || []).map(entry => [entry.file, entry]));
  const findings = [];
  const seen = new Set();
  for (const r of results) {
    if (r.error) findings.push({ level: 'block', kind: 'build-failed', build: r.script, detail: r.error });
    for (const d of r.drift) {
      seen.add(d.file);
      const entry = allowed.get(d.file);
      if (!entry) findings.push({ level: 'block', kind: 'new-drift', build: r.script, file: d.file });
      else if (entry.committedSha256 !== d.committedSha256 || entry.generatedSha256 !== d.generatedSha256) {
        findings.push({ level: 'block', kind: 'drift-changed', build: r.script, file: d.file,
          detail: entry.committedSha256 !== d.committedSha256 ? '提交版本與基準不同' : '建置輸出與基準不同' });
      } else findings.push({ level: 'known', kind: 'known-drift', build: r.script, file: d.file, detail: entry.reason });
    }
  }
  for (const entry of allowed.values()) {
    if (!seen.has(entry.file)) findings.push({ level: 'note', kind: 'baseline-resolved', file: entry.file, detail: '已同步，可自基準移除' });
  }
  return { ok: !findings.some(f => f.level === 'block'), findings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const results = checkGeneratedSync();
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : { allowedDrift: [] };
  const verdict = evaluate(results, baseline);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...verdict, results }, null, 2));
  } else {
    for (const r of results) {
      const status = r.error ? `建置失敗：${r.error}` : r.drift.length ? `與提交版本不同 ${r.drift.length} 檔` : '同步';
      console.log(`${r.drift.length || r.error ? '•' : '✓'} ${r.purpose}（${r.script}）：${status}`);
    }
    console.log('');
    const label = { block: '✗ 阻擋', known: '△ 已知', note: 'ℹ 提醒' };
    for (const f of verdict.findings) console.log(`${label[f.level]} ${f.kind} ${f.file || f.build}${f.detail ? '：' + f.detail : ''}`);
    console.log(verdict.ok
      ? `\n結果：通過（只有基準內已確認的 ${verdict.findings.filter(f => f.level === 'known').length} 項既有差異）。`
      : '\n結果：阻擋。新增不同步、差異變動或建置失敗需由負責人確認後處理；本檢查不會修改任何檔案，也不會部署 GAS。');
  }
  process.exit(verdict.ok ? 0 : 1);
}
