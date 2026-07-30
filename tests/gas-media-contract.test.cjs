const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');
const media = fs.readFileSync(path.join(root, 'gas/HalfMedia.gs'), 'utf8');

test('half-month media upload is dispatched by the shared POST handler', () => {
  assert.match(code, /if \(action === 'half_media_upload'\) result = uploadHalfMedia\(payload\);/);
  assert.match(media, /function uploadHalfMedia\(payload\)/);
});

test('half-month media remains private and guarded', () => {
  assert.match(media, /function halfMediaAuthorized\(payload\)/);
  assert.match(media, /HALF_MEDIA_MAX_BYTES = 25 \* 1024 \* 1024/);
  assert.match(media, /DriveApp\.getFolderById/);
  assert.match(media, /createFile\(Utilities\.newBlob/);
  assert.doesNotMatch(media, /setSharing\s*\(/);
  assert.match(code, /String\(r\.evidenceNames \|\| oldRow\[11\] \|\| ''\)/);
});

test('repository source never contains a hard-coded patrol passcode', () => {
  assert.doesNotMatch(code + media, /(?:PT_KEY|patrol passcode)\s*=\s*['"][^'"]+['"]/i);
});
