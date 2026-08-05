const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');

test('private dashboard routes are present before the unknown-action fallback', () => {
  const statusRoute = source.indexOf("action === 'private_admin_snapshot_status'");
  const rosterRoute = source.indexOf("action === 'private_sync_roster'");
  const publishRoute = source.indexOf("action === 'private_publish'");
  const unknownFallback = source.indexOf('unknown private dashboard action');

  assert.ok(statusRoute > 0, 'private_admin_snapshot_status route missing');
  assert.ok(rosterRoute > 0, 'private_sync_roster route missing');
  assert.ok(publishRoute > 0, 'private_publish route missing');
  assert.ok(unknownFallback > 0, 'unknown-action fallback missing');
  assert.ok(statusRoute < unknownFallback, 'status route must run before fallback');
  assert.ok(rosterRoute < unknownFallback, 'roster route must run before fallback');
  assert.ok(publishRoute < unknownFallback, 'publish route must run before fallback');
});

test('private dashboard route handlers remain defined in Code.gs', () => {
  [
    'privateDashboardAdminSnapshotStatus',
    'privateDashboardSyncRoster',
    'privateDashboardPublish',
    'privateDashboardRequiredProperty',
    'privateDashboardFolder',
  ].forEach(name => {
    assert.match(source, new RegExp(`function\\s+${name}\\s*\\(`), `${name} missing`);
  });
});

test('protected patrol and schedule actions remain present in the same deployment source', () => {
  [
    'ptread',
    'ptwrite',
    'hread',
    'hwrite',
    'sread',
    'half_media_upload',
    'kpiCalcAutoUpdate',
    'report_upload_preview',
    'report_upload_commit',
    'report_upload_rollback',
    'report_upload_log',
  ].forEach(action => {
    assert.ok(source.includes(action), `${action} missing from deployment source`);
  });
});
