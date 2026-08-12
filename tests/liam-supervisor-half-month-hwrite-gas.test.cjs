const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const gas=fs.readFileSync(path.join(root,'gas/Code.gs'),'utf8');
const block=(gas.match(/const HALF_WRITE_FIELDS[\s\S]*?(?=function writeHalfCheck\(rows\))/)||[])[0];
const PT_STORES=['通化','酒泉','三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'].map(name=>({name:`台北${name}`}));
const validate=Function('PT_STORES',`${block}; return validateHalfWriteRows_;`)(PT_STORES);

function row(overrides={}){
  return {checkId:'2026-08-12|酒泉|H1',date:'2026-08-12',period:'H1',month:'2026-08',store:'酒泉',inspector:'督導',item:1,result:'ok',note:'',improvement:'',...overrides};
}

test('hwrite authorizes before payload parse or worksheet access',()=>{
  const branch=(gas.match(/if \(action === 'hwrite'\) \{[\s\S]*?\n  \}/)||[])[0]||'';
  assert.ok(branch.indexOf('ptAuthorized(e)')>=0);
  assert.ok(branch.indexOf('ptAuthorized(e)')<branch.indexOf('JSON.parse'));
  assert.ok(branch.indexOf('JSON.parse')<branch.indexOf('writeHalfCheck'));
});

test('server accepts canonical text rows and normalizes the formal store name',()=>{
  const clean=validate([row({store:'台北三創',checkId:'2026-08-12|台北三創|H1'})]);
  assert.equal(clean[0].store,'三創');
  assert.equal(clean[0].checkId,'2026-08-12|三創|H1');
});

test('server rejects invalid store, period, item, status and extra fields',()=>{
  assert.throws(()=>validate([row({store:'其他店'})]),/invalid store/);
  assert.throws(()=>validate([row({period:'H2'})]),/invalid period/);
  assert.throws(()=>validate([row({item:19})]),/invalid item/);
  assert.throws(()=>validate([row({result:'passed'})]),/invalid status/);
  assert.throws(()=>validate([row({arbitrary:'x'})]),/extra field/);
});

test('server rejects duplicate items and ignores client savedAt as authoritative time',()=>{
  assert.throws(()=>validate([row(),row()]),/duplicate item/);
  assert.match(gas,/const now = new Date\(\)\.toISOString\(\);/);
  assert.doesNotMatch(gas,/const now = String\(r\.savedAt/);
});

test('update key is isolated by period, store and item and preserves existing media',()=>{
  assert.match(gas,/const key = \[period, String\(r\.store \|\| ''\), itemNo\]\.join\('\|'\)/);
  assert.match(gas,/String\(r\.evidenceNames \|\| oldRow\[11\] \|\| ''\)/);
  assert.match(gas,/if \(existing\[key\]\)[\s\S]*?setValues\(\[row\]\)/);
});

test('hread formats inspection date without an artificial time',()=>{
  assert.match(gas,/h === '檢查日期' \? Utilities\.formatDate\(row\[idx\], 'Asia\/Taipei', 'yyyy-MM-dd'\) : patrolTimeStr/);
});
