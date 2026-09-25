const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('private dashboard reads the newest snapshot when Drive contains duplicate names', () => {
  const source = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');
  const start = source.indexOf('function privateDashboardLatestSnapshotFile_() {');
  const end = source.indexOf('\nfunction privateDashboardSnapshot()', start);
  assert.ok(start >= 0 && end > start);
  const folder = {getFilesByName: () => {
    const records = [
      {id:'old',getLastUpdated:()=>new Date('2026-09-24T02:00:00Z')},
      {id:'today',getLastUpdated:()=>new Date('2026-09-25T02:00:00Z')}
    ];
    return {hasNext:()=>records.length>0,next:()=>records.shift()};
  }};
  const context = vm.createContext({privateDashboardFolder:()=>folder,PRIVATE_DASHBOARD_FILE:'north12b-dashboard-private-latest.json'});
  vm.runInContext(source.slice(start,end), context);
  assert.equal(vm.runInContext('privateDashboardLatestSnapshotFile_().id',context),'today');
});
