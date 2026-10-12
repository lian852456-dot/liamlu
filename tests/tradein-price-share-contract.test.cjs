'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'tradein-price-share.html'),'utf8');
const js=fs.readFileSync(path.join(root,'tradein-price-share.js'),'utf8');
test('shared page is isolated from private portal and keeps legacy admin uploader untouched',()=>{
  assert.match(html,/<title>舊機回收價查詢/);
  assert.doesNotMatch(html,/threec-query-core\.js|home\.html|tradein-progress\.html/);
  assert.match(html,/tradein-price-share\.js/);
  assert.doesNotMatch(html,/href="(?:home|tradein-progress|tradein-brief|tradein-query|threec-query)\.html"/);
  assert.doesNotMatch(html,/<input[^>]*type="(?:file|password)"/);
});
test('shared runtime has only official read-only tradein action and no storage or private identifiers',()=>{
  assert.match(js,/action:'threec_snapshot_read',kind:'tradein'/);
  assert.doesNotMatch(js,/action:'threec_changes_read'/);
  assert.doesNotMatch(js,/action:'(?:threec_publish|threec_upload|threec_rollback|private_access)'/);
  assert.doesNotMatch(js,/\.localStorage|\.sessionStorage|employeeId|deviceId|adminSecret|ThreecQueryCore/);
  assert.match(js,/credentials:'omit'/);
  assert.match(js,/function validate\(body\)/);
  assert.match(js,/lian852456-dot\.github\.io/);
  assert.match(js,/if\(token!==generation\)return/);
});
