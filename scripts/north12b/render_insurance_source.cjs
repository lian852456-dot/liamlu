// Offline release preparation. No Drive, editor, network or deployment calls.
const fs = require('node:fs');
const path = require('node:path');
const consultation = require('../../insurance-consultation.js');

const templatePath = path.resolve(__dirname, '../../gas/InsuranceFixedSource.gs');
const marker = 'const INSURANCE_FIXED_DESCRIPTOR_ = null;';
const keys = ['cutoff','fileId','ownerEmail','payloadSha256','people','reportDate','sourceSha256'];

function render(template, descriptor) {
  if (!descriptor || Object.keys(descriptor).sort().join('|') !== keys.join('|') ||
      typeof descriptor.fileId !== 'string' || !/^[A-Za-z0-9_-]{10,200}$/.test(descriptor.fileId) ||
      typeof descriptor.ownerEmail !== 'string' || !/^[^\s@]+@[^\s@]+$/.test(descriptor.ownerEmail) ||
      ![descriptor.payloadSha256,descriptor.sourceSha256].every(s => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s)) ||
      !consultation.day(descriptor.cutoff) || !consultation.day(descriptor.reportDate) ||
      descriptor.cutoff > descriptor.reportDate || descriptor.cutoff.slice(0,7) !== descriptor.reportDate.slice(0,7) ||
      !Number.isSafeInteger(descriptor.people) || descriptor.people < 1 || descriptor.people > 10000) {
    throw Error('Unexpected batch descriptor');
  }
  if (template.split(marker).length !== 2) throw Error('Unexpected GAS template');
  const json = JSON.stringify(descriptor, keys);
  return template.replace(marker, () => 'const INSURANCE_FIXED_DESCRIPTOR_ = Object.freeze(' + json + ');');
}

function prepare(privateDir) {
  const dir = fs.realpathSync(privateDir);
  const stat = fs.statSync(dir);
  if (!stat.isDirectory() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw Error('Private directory required');
  for (let parent = dir; ; parent = path.dirname(parent)) {
    if (fs.existsSync(path.join(parent, '.git'))) throw Error('Keep private release files outside Git');
    if (parent === path.dirname(parent)) break;
  }
  const input = path.join(dir, 'descriptor.json');
  const info = fs.lstatSync(input);
  if (!info.isFile() || info.uid !== stat.uid || (info.mode & 0o077)) throw Error('Private descriptor file required');
  const result = render(fs.readFileSync(templatePath, 'utf8'), JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(path.join(dir, 'InsuranceFixedSource.gs'), result, {flag:'wx', mode:0o600});
}

if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw Error('Invalid arguments');
    prepare(process.argv[2]);
  } catch {
    process.stderr.write('Private release file was not prepared. Check inputs, permissions and destination.\n');
    process.exitCode = 1;
  }
}
module.exports = {render};
