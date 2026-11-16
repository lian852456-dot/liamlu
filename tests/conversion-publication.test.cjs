'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../conversion-publication-core.js');
const O = require('../north12-officer-core.js');
const Base = require('../readonly-dashboard-core.js');
const {runtime, fixture} = require('./helpers/readonly-conversion-runtime.cjs');
function department(days = 3, hash = 'a') {
  const data = Base.validateConversion(fixture({days, hash}));
  const extra = {id:'DNB20001', name:'合成A門市', short:'合成A', region:'北一二A'};
  return O.validate({...data, schema:O.SCHEMA, stores:data.stores.concat(extra),
    records:data.records.concat(data.records.filter(row => row.store === data.stores[0].id).map(row => ({...row,store:extra.id})))});
}
const publish = (backend, snapshot) => {
  const preview = backend.call('Preview', {snapshot});
  return backend.call('Publish', {previewToken:preview.token, confirm:true});
};
test('a single canonical publication gives B the same counts and source hash', () => {
  const d = department(), p = P.fromOfficer(d), b = P.projectB(p);
  assert.equal(b.sha256, d.sha256);
  assert.deepEqual(b.records, d.records.filter(row => row.store !== 'DNB20001'));
  assert.equal(p.regions['北一二A'].records.length,3);
});
test('partial newer B preserves A with its own date, source, and observations', () => {
  const old = P.fromOfficer(department());
  const {snapshot} = P.combine(old, P.migrate(fixture({days:4,hash:'b'})));
  assert.deepEqual(snapshot.regions['北一二A'],old.regions['北一二A']);
  assert.equal(snapshot.regions['北一二B'].cutoff,'2026-10-04');
  assert.equal(P.coverage(snapshot).find(row => row.region === '北一二A').updated,false);
  assert.equal(P.projectB(snapshot).sha256,'b'.repeat(64));
});
test('legacy B source migrates without changing the existing projection', () => {
  assert.deepEqual(P.projectB(P.migrate(fixture())),Base.validateConversion(fixture()));
});
test('older, missing, cross-region, or same-hash conflicting data cannot publish', () => {
  const p = P.fromOfficer(department());
  assert.throws(() => P.combine(p,P.migrate(fixture({days:2,hash:'b'}))),/倒退/);
  const bad = structuredClone(p); bad.regions['北一二A'].stores[0].region = '北一二C';
  assert.throws(() => P.normalize(bad),/跨區/);
  const changed = fixture(); changed.records[0].aq_n++;
  assert.throws(() => P.combine(p,P.migrate(changed)),/相同原始檔/);
});
test('department read authorizes before accessing private data', () => {
  const b = runtime();
  assert.throws(() => b.context.readonlyConversionDepartmentRead({}),/denied/);
  assert.deepEqual(b.events,['auth']);
});
test('legacy to unified publication, readback, partial update, and rollback share one pointer', () => {
  const b = runtime(); publish(b,fixture());
  const a = publish(b,P.fromOfficer(department(3,'b')));
  assert.equal(b.call('DepartmentRead').publication.regions['北一二A'].stores.length,1);
  const newer = publish(b,P.migrate(fixture({days:4,hash:'c'})));
  const read = b.call('DepartmentRead');
  assert.equal(read.publication.regions['北一二A'].cutoff,'2026-10-03');
  assert.equal(read.publication.regions['北一二B'].cutoff,'2026-10-04');
  assert.equal(b.context.readonlyConversionAttach_({}).conversionBattle.cutoff,'2026-10-04');
  b.call('Rollback',{confirm:true,expectedRevision:newer.live.revision,expectedActiveHash:newer.live.activeHash});
  assert.equal(b.call('DepartmentRead').live.activeHash,a.live.activeHash);
  assert.equal(b.context.readonlyConversionAttach_({}).conversionBattle.cutoff,'2026-10-03');
});
test('large previews use chunks and reject an evicted chunk before writing', () => {
  const b = runtime(),p = P.fromOfficer(department(31));
  const preview = b.call('Preview',{snapshot:p});
  const key = [...b.cache.keys()].find(key => key.endsWith('_0'));
  assert.ok(key); b.cache.delete(key);
  assert.throws(() => b.call('Publish',{previewToken:preview.token,confirm:true}),/預覽已失效/);
  assert.equal(b.files.size,0);
});
test('failed unified readback restores the complete prior pointer and all regions', () => {
  const b = runtime(); publish(b,P.fromOfficer(department()));
  const original = JSON.stringify(b.state),p = b.call('Preview',{snapshot:P.migrate(fixture({days:4,hash:'c'}))});
  b.failStateReadback();
  assert.throws(() => b.call('Publish',{previewToken:p.token,confirm:true}),/指標/);
  assert.equal(JSON.stringify(b.state),original);
  assert.equal(b.call('DepartmentRead').publication.regions['北一二A'].cutoff,'2026-10-03');
});
