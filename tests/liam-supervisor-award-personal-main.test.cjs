const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const model = require(path.join(root, 'award-personal-model.js'));
const modelSource = fs.readFileSync(path.join(root, 'award-personal-model.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

function normalizeStore(value) {
  const clean = String(value || '').replace(/^台灣大哥大數位生活/, '').replace(/^台北/, '').replace(/\s+/g, '').trim();
  return clean === '三創' ? '台北三創' : clean;
}

function snapshot(awardDate = '2026-08-19') {
  return {
    kpiBattle:{
      report_date:'2026-08-19',
      personal:[
        { name:'安＊一', store:'酒泉', category:'業代', phone_award_actual:9000, phone_award_projected:11000, phone_award_rank:1, phone_award_eligible:'Y' },
        { name:'白＊二', store:'台灣大哥大數位生活台北三創', role:'副店', phone_award_actual:0, phone_award_projected:1200, phone_award_rank:18, phone_award_eligible:'N' },
        { name:'陳＊三', store:'永吉', role:'業代', phone_award_actual:null, phone_award_projected:'', phone_award_rank:undefined, phone_award_eligible:'' }
      ]
    },
    awardsBattle:{ report_date:awardDate }
  };
}

test('formal personal award adapter preserves source values, zero and null', () => {
  const result=model.adaptSnapshot(snapshot(),normalizeStore);
  assert.equal(result.status,'ok');
  assert.equal(result.reportDate,'2026-08-19');
  assert.equal(result.rows.length,3);
  assert.deepEqual(result.rows[1],{
    name:'白＊二',store:'台北三創',role:'副店',category:'',actual:0,projected:1200,rank:18,eligible:'N'
  });
  assert.equal(result.rows[2].actual,null);
  assert.equal(result.rows[2].projected,null);
  assert.equal(result.rows[2].rank,null);
  assert.equal(result.rows[2].eligible,null);
  assert.equal(model.numberOrNull('   '),null);
});

test('personal award fails closed unless KPI and award report dates match', () => {
  const mismatch=model.adaptSnapshot(snapshot('2026-08-18'),normalizeStore);
  assert.equal(mismatch.status,'no_data');
  assert.deepEqual(mismatch.rows,[]);
  assert.equal(mismatch.note,'台獎日期與 KPI 日期不一致');
});

test('filters and three sorts never replace formal phone award rank', () => {
  const rows=model.adaptSnapshot(snapshot(),normalizeStore).rows;
  assert.deepEqual(model.selectRows(rows,'all','amount-desc').map(row=>row.name),['安＊一','白＊二','陳＊三']);
  assert.deepEqual(model.selectRows(rows,'all','amount-asc').map(row=>row.name),['白＊二','安＊一','陳＊三']);
  assert.deepEqual(model.selectRows(rows,'台北三創','amount-desc').map(row=>row.name),['白＊二']);
  const byName=model.selectRows(rows,'all','name');
  assert.deepEqual(byName.map(row=>row.name),rows.map(row=>row.name).sort((a,b)=>a.localeCompare(b,'zh-Hant')));
  assert.equal(model.rankLabel(rows[0].rank),'🥇');
  assert.equal(model.rankLabel(rows[1].rank),'18');
  assert.equal(model.rankLabel(rows[2].rank),'—');
});

test('main-native integration adds one read-only scope without PR57 loader or second private fetch', () => {
  assert.match(html,/data-battle-scope="personal"[^>]*hidden>個人</);
  assert.match(html,/award-personal-model\.js\?v=personal-award-main-20260819-1/);
  assert.match(worker,/\.\/award-personal-model\.js/);
  assert.match(app,/personalAwardModule\s*=\s*adaptPersonalAwards\(snapshot,readAt\)/);
  assert.match(app,/App 只做篩選與排序，不重算台獎/);
  assert.match(app,/A\.rankLabel\(row\.rank\)/);
  assert.doesNotMatch(modelSource,/fetch\s*\(/);
  assert.doesNotMatch(modelSource,/localStorage|sessionStorage|MutationObserver|private_access/);
  assert.doesNotMatch(html,/award-personal\.js|award-personal\.css/);
});
