const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const gas=fs.readFileSync(path.join(root,'gas/Code.gs'),'utf8');
const block=(gas.match(/const HALF_WRITE_FIELDS[\s\S]*?(?=function writeHalfCheck\(rows, options\))/)||[])[0];
const PT_STORES=['通化','酒泉','三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'].map(name=>({name:`台北${name}`}));
const validate=Function('PT_STORES',`${block}; return validateHalfWriteRows_;`)(PT_STORES);
const strictOptions={strictApp:true,mode:'draft'};

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
  const clean=validate([row({store:'台北三創',checkId:'2026-08-12|台北三創|H1'})],strictOptions);
  assert.equal(clean[0].store,'三創');
  assert.equal(clean[0].checkId,'2026-08-12|三創|H1');
});

test('server rejects invalid store, period, item, status and extra fields',()=>{
  assert.throws(()=>validate([row({store:'其他店'})],strictOptions),/invalid store/);
  assert.throws(()=>validate([row({period:'H2'})],strictOptions),/invalid period/);
  assert.throws(()=>validate([row({item:19})],strictOptions),/invalid item/);
  assert.throws(()=>validate([row({result:'passed'})],strictOptions),/invalid status/);
  assert.throws(()=>validate([row({arbitrary:'x'})],strictOptions),/extra field/);
});

test('App POST semantic validation rejects non-abnormal text and evidence/media mutation',()=>{
  assert.throws(()=>validate([row({note:'不應存在'})],strictOptions),/non-abnormal text not allowed/);
  assert.throws(()=>validate([row({improvement:'不應存在'})],strictOptions),/non-abnormal text not allowed/);
  assert.throws(()=>validate([row({evidenceNames:'drive-link'})],strictOptions),/extra field/);
  assert.throws(()=>validate([row({media:{name:'x'}})],strictOptions),/extra field/);
  assert.doesNotThrow(()=>validate([row({result:'abnormal',note:'',improvement:''})],strictOptions));
});

test('complete mode requires all 18 answered items and abnormal details',()=>{
  const rows=Array.from({length:18},(_,index)=>row({item:index+1}));
  assert.doesNotThrow(()=>validate(rows,{strictApp:true,mode:'complete'}));
  assert.throws(()=>validate(rows.slice(0,17),{strictApp:true,mode:'complete'}),/complete requires 18 answered items/);
  rows[4]=row({item:5,result:'abnormal',note:'',improvement:''});
  assert.throws(()=>validate(rows,{strictApp:true,mode:'complete'}),/abnormal detail required/);
});

test('server rejects duplicate items and ignores client savedAt as authoritative time',()=>{
  assert.throws(()=>validate([row(),row()],strictOptions),/duplicate item/);
  assert.throws(()=>validate([row({savedAt:'client-time'})],strictOptions),/extra field/);
  assert.match(gas,/const now = new Date\(\)\.toISOString\(\);/);
  assert.doesNotMatch(gas,/const now = String\(r\.savedAt/);
});

test('update key is isolated by period, store and item and preserves existing media',()=>{
  assert.match(gas,/const key = \[period, String\(r\.store \|\| ''\), itemNo\]\.join\('\|'\)/);
  assert.match(gas,/String\(r\.evidenceNames \|\| oldRow\[11\] \|\| ''\)/);
  assert.match(gas,/if \(existing\[key\]\)[\s\S]*?setValues\(\[row\]\)/);
});

test('App hwrite POST authorizes the body token and uses strict validation',()=>{
  const source=(gas.match(/function writeHalfCheckPostPayload_\(payload, e\) \{[\s\S]*?\n\}/)||[])[0]||'';
  assert.match(source,/query\.token != null \|\| query\.payload != null/);
  assert.ok(source.indexOf("ptCredentialAuthorized_('', body.token)")>=0);
  assert.ok(source.indexOf("ptCredentialAuthorized_('', body.token)")<source.indexOf('writeHalfCheck(body.rows'));
  assert.match(source,/strictApp:true/);
  assert.match(gas,/else if \(action === 'hwrite'\) result = writeHalfCheckPostPayload_\(payload, e\)/);
});

test('unauthorized App POST is rejected before any write',()=>{
  const source=(gas.match(/function writeHalfCheckPostPayload_\(payload, e\) \{[\s\S]*?\n\}/)||[])[0]||'';
  let writes=0;
  const handler=Function('ptCredentialAuthorized_','HALF_APP_POST_FIELDS','writeHalfCheck',`${source}; return writeHalfCheckPostPayload_;`)(()=>false,['action','token','mode','rows'],()=>{writes+=1;});
  assert.throws(()=>handler({action:'hwrite',token:'bad',mode:'draft',rows:[row()]},{parameter:{}}),/unauthorized/);
  assert.equal(writes,0);
});

test('App POST rejects token or payload supplied in the URL query',()=>{
  const source=(gas.match(/function writeHalfCheckPostPayload_\(payload, e\) \{[\s\S]*?\n\}/)||[])[0]||'';
  let authorized=0;
  let writes=0;
  const handler=Function('ptCredentialAuthorized_','HALF_APP_POST_FIELDS','writeHalfCheck',`${source}; return writeHalfCheckPostPayload_;`)(()=>{authorized+=1; return true;},['action','token','mode','rows'],()=>{writes+=1;});
  const body={action:'hwrite',token:'body-token',mode:'draft',rows:[row()]};
  assert.throws(()=>handler(body,{parameter:{token:'query-token'}}),/hwrite body required/);
  assert.throws(()=>handler(body,{parameter:{payload:'query-payload'}}),/hwrite body required/);
  assert.equal(authorized,0);
  assert.equal(writes,0);
});

test('all rows validate before ScriptLock and worksheet access',()=>{
  const source=(gas.match(/function writeHalfCheck\(rows, options\) \{[\s\S]*?(?=\nfunction writeHalfCheckPostPayload_)/)||[])[0]||'';
  assert.ok(source.indexOf('validateHalfWriteRows_')>=0);
  assert.ok(source.indexOf('validateHalfWriteRows_')<source.indexOf('LockService.getScriptLock'));
  assert.ok(source.indexOf('LockService.getScriptLock')<source.indexOf('getHalfCheckSheet'));
  assert.match(source,/finally \{[\s\S]*?lock\.releaseLock\(\)/);
});

test('ScriptLock serializes competing updates so one business key cannot create duplicate rows',()=>{
  const source=(gas.match(/const HALF_CHECK_SHEET[\s\S]*?(?=\nfunction readHalfCheck)/)||[])[0]||'';
  const state={locked:false,waits:0,releases:0,rows:[Array(16).fill('header')]};
  const sheet={
    getDataRange(){ assert.equal(state.locked,true); return {getValues:()=>state.rows.map(values=>values.slice())}; },
    getLastRow(){ return state.rows.length; },
    getRange(rowIndex,column,rowCount,columnCount){
      return {setValues(values){
        values.forEach((valuesRow,offset)=>{
          const target=rowIndex-1+offset;
          if(!state.rows[target]) state.rows[target]=Array(16).fill('');
          valuesRow.forEach((value,index)=>{ state.rows[target][column-1+index]=value; });
        });
      },setNumberFormat(){}};
    },
    appendRow(values){ state.rows.push(values.slice()); }, setFrozenRows(){}
  };
  const lock={
    waitLock(){ assert.equal(state.locked,false); state.locked=true; state.waits+=1; },
    releaseLock(){ assert.equal(state.locked,true); state.locked=false; state.releases+=1; }
  };
  const api=Function('SpreadsheetApp','SPREADSHEET_ID','findNamedSheet','PT_STORES','LockService',`${source}; return {writeHalfCheck};`)(
    {openById:()=>({insertSheet:()=>sheet})},'sheet-id',()=>sheet,PT_STORES,{getScriptLock:()=>lock}
  );
  api.writeHalfCheck([row({result:'ok'})],strictOptions);
  api.writeHalfCheck([row({result:'abnormal',note:'原因',improvement:'改善'})],strictOptions);
  assert.equal(state.rows.length,2);
  assert.equal(state.rows[1][6],'缺失／異常');
  assert.equal(state.rows[1][7],'原因');
  assert.equal(state.waits,2);
  assert.equal(state.releases,2);
  assert.equal(state.locked,false);
});

test('hread formats inspection date without an artificial time',()=>{
  assert.match(gas,/h === '檢查日期' \? Utilities\.formatDate\(row\[idx\], 'Asia\/Taipei', 'yyyy-MM-dd'\) : patrolTimeStr/);
});
