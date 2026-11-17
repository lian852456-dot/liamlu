'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
test('portable share-site build creates exactly 3 self-contained files with no portal routes',()=>{
  const destination=fs.mkdtempSync(path.join(os.tmpdir(),'twm-tradein-price-'));
  try{
    const run=spawnSync(process.execPath,[path.join(__dirname,'../scripts/build-tradein-share.mjs'),destination],{encoding:'utf8'});
    assert.equal(run.status,0,run.stderr);
    assert.deepEqual(fs.readdirSync(destination).sort(),['app.js','index.html','style.css']);
    const html=fs.readFileSync(path.join(destination,'index.html'),'utf8');
    const js=fs.readFileSync(path.join(destination,'app.js'),'utf8');
    assert.match(html,/href="style\.css"/);
    assert.match(html,/src="app\.js"/);
    assert.doesNotMatch(html,/threec-query-core|home\.html|tradein-progress|<a\b/);
    assert.doesNotMatch(js,/ThreecQueryCore|localStorage|employeeId|deviceId|adminSecret/);
    assert.match(js,/action:'threec_snapshot_read',kind:'tradein',includeChanges:false/);
  }finally{fs.rmSync(destination,{recursive:true,force:true});}
});
