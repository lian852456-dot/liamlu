const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=name=>fs.readFileSync(require.resolve('../'+name),'utf8');

test('the supervisor view and department renewal export have separate entries',()=>{
  assert.match(read('home.html'),/href="readonly-dashboard\.html"[^>]*>.*?<h3>主管唯讀看板<\/h3>/);
  assert.doesNotMatch(read('patrol.html'),/href="readonly-dashboard\.html"/);
  assert.doesNotMatch(read('readonly-dashboard.html'),/id="renewal-(source|import|export)"|href="north12-officer\.html"/);
  assert.match(read('department-ops.html'),/data-panel="conversion"[\s\S]*src="department-conversion\.html"/);
  assert.match(read('north12-officer.html'),/id="export"[^>]*>一鍵匯出三項唯讀HTML/);
  assert.match(read('north12-officer.html'),/href="department-ops\.html#conversion"/);
});
