import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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
if (!expected) throw Error('Missing upload whitelist');
const nextWhitelist = shared.match(whitelist)[0];
for (const action of [...expected.matchAll(/'([^']+)'/g)].map(match => match[1])) {
  if (!nextWhitelist.includes("'" + action + "'")) throw Error('Existing upload action would be removed: ' + action);
}
code = code.replace(whitelist, nextWhitelist);
const route = "    else if (action === 'private_access') result = privateDashboardAccess(payload);";
if (code.split(route).length !== 2) throw Error('Ambiguous existing private route');
for (const [action, handler] of [['threec_snapshot_read','threecSnapshotRead'], ['threec_changes_read','threecChangesRead']]) {
  const line = "    else if (action === '" + action + "') result = " + handler + "(payload);";
  const count = code.split("action === '" + action + "'").length - 1;
  if (count > 1 || (count === 1 && !code.includes(line))) throw Error('Ambiguous existing read route: ' + action);
  if (!count) code = code.replace(route, route + "\n" + line);
}
fs.mkdirSync(destination, { recursive:true });
for (const name of fs.readdirSync(baseline)) {
  const file = path.join(baseline, name);
  if (fs.statSync(file).isFile()) fs.copyFileSync(file, path.join(destination, name));
}
fs.writeFileSync(path.join(destination, codeName), code);
fs.copyFileSync(path.join(root, 'gas/ReportUpload.html'), path.join(destination, 'ReportUpload.html'));
// SheetJS is unchanged. The shopping parser only removes artificial column ordinals;
// its baseline must be the exact known v74 parser before applying this scoped update.
for (const [asset, source] of [['ReportUploadSheetJs.html','assets/vendor/xlsx.full.min.js'], ['ReportUploadTradeInCore.html','tradein-import-core.js']]) {
  const prior = read(path.join(baseline, asset));
  const current = read(path.join(root, source));
  const v74ParserSha = 'bfcdf1e122ab31a8d676a2dc77fdff0be31ee7e3c5ce2b615b8363455d98fbe3';
  const knownPrior = source === 'tradein-import-core.js' && crypto.createHash('sha256').update(prior).digest('hex') === v74ParserSha;
  if (prior !== current && !knownPrior) throw Error('Parser asset drift: ' + asset);
  fs.copyFileSync(path.join(root, source), path.join(destination, asset));
}
fs.copyFileSync(path.join(root, 'threec-price-transport.js'), path.join(destination, 'ThreecPriceTransport.js'));
fs.copyFileSync(path.join(root, 'threec-price-diff-core.js'), path.join(destination, 'ThreecPriceDiffCore.js'));
fs.copyFileSync(path.join(root, 'threec-price-diff-core.js'), path.join(destination, 'ReportUploadThreecDiffCore.html'));
const before = [...original.matchAll(/^function (\w+)\(/gm)].map(match => match[1]);
const after = [...code.matchAll(/^function (\w+)\(/gm)].map(match => match[1]);
for (const name of new Set(before)) {
  if (before.filter(value => value === name).length !== after.filter(value => value === name).length) throw Error('Existing function lost or duplicated: ' + name);
}
console.log(JSON.stringify({ preservedFunctions:before.length, addedFunctions:after.filter(name => !before.includes(name)), changedFiles:[codeName,'ReportUpload.html','ReportUploadTradeInCore.html'], addedFiles:['ThreecPriceDiffCore.js','ReportUploadThreecDiffCore.html'], sheetJsUnchanged:true }));
