import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Build from a freshly pulled, private copy of the existing upload project.
// Never push the shared gas/Code.gs wholesale to that project.
const [baseline, destination] = process.argv.slice(2);
if (!baseline || !destination || path.resolve(baseline) === path.resolve(destination)) throw Error('Usage: node scripts/build-threec-upload-overlay.mjs baseline destination');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(file, 'utf8');
const codeName = fs.readdirSync(baseline).find(name => /\.(js|gs)$/.test(name) && read(path.join(baseline, name)).includes('function threecPublish('));
if (!codeName) throw Error('Existing upload project with 3C module required');
const original = read(path.join(baseline, codeName));
const shared = read(path.join(root, 'gas/Code.gs'));
const marker = 'const THREEC_PRIVATE_FOLDER_PROPERTY';
if (original.split(marker).length !== 2 || shared.split(marker).length !== 2) throw Error('Ambiguous 3C module');
const originalStart = original.indexOf(marker);
if (!/^function threec\w+\(/m.test(original.slice(originalStart)) || /^function (?!threec)\w+\(/m.test(original.slice(originalStart))) throw Error('Unexpected functions after private 3C module');
const sharedEnd = shared.indexOf('function privateDashboardAdminRequests', shared.indexOf(marker));
if (sharedEnd < 0) throw Error('Missing shared module end');
let code = original.slice(0, originalStart) + shared.slice(shared.indexOf(marker), sharedEnd);
const whitelist = /const REPORT_UPLOAD_ALLOWED_ACTIONS = \[[\s\S]*?\];/;
const expected = original.match(whitelist)?.[0];
if (!expected || expected.includes('threec_snapshot_read')) throw Error('Reconcile already updated whitelist before building');
code = code.replace(whitelist, shared.match(whitelist)[0]);
const route = "    else if (action === 'private_access') result = privateDashboardAccess(payload);";
if (code.includes("action === 'threec_snapshot_read'")) throw Error('Existing read route: reconcile first');
if (code.split(route).length !== 2) throw Error('Ambiguous existing private route');
code = code.replace(route, route + "\n    else if (action === 'threec_snapshot_read') result = threecSnapshotRead(payload);");
fs.mkdirSync(destination, { recursive:true });
for (const name of fs.readdirSync(baseline)) {
  const file = path.join(baseline, name);
  if (fs.statSync(file).isFile()) fs.copyFileSync(file, path.join(destination, name));
}
fs.writeFileSync(path.join(destination, codeName), code);
fs.copyFileSync(path.join(root, 'gas/ReportUpload.html'), path.join(destination, 'ReportUpload.html'));
// Parser assets are reused, not regenerated or changed.
for (const [asset, source] of [['ReportUploadSheetJs.html','assets/vendor/xlsx.full.min.js'], ['ReportUploadTradeInCore.html','tradein-import-core.js']]) {
  if (read(path.join(baseline, asset)) !== read(path.join(root, source))) throw Error('Parser asset drift: ' + asset);
}
const before = [...original.matchAll(/^function (\w+)\(/gm)].map(match => match[1]);
const after = [...code.matchAll(/^function (\w+)\(/gm)].map(match => match[1]);
for (const name of new Set(before)) {
  if (before.filter(value => value === name).length !== after.filter(value => value === name).length) throw Error('Existing function lost or duplicated: ' + name);
}
console.log(JSON.stringify({ preservedFunctions:before.length, addedFunctions:after.filter(name => !before.includes(name)), changedFiles:[codeName,'ReportUpload.html'], parserAssetsUnchanged:true }));
