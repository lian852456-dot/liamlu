const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const featureSource = fs.readFileSync(path.join(root, 'award-personal.js'), 'utf8');
const contractSource = fs.readFileSync(path.join(root, 'app-data-contract.js'), 'utf8');
const feature = require(path.join(root, 'award-personal.js'));

test('personal award adapter keeps formal values and requires same report date', () => {
  const snapshot = {
    kpiBattle: {
      report_date: '2026-08-17',
      personal: [
        { name:'王＊明', store:'三創', category:'業代', phone_award_actual:8200, phone_award_projected:9600, phone_award_rank:2, phone_award_eligible:'Y' },
        { name:'李＊安', store:'永吉', category:'店長', phone_award_actual:0, phone_award_projected:1200, phone_award_rank:18, phone_award_eligible:'N' },
        { name:'陳＊庭', store:'杭州南', category:'業代', phone_award_actual:null, phone_award_projected:null, phone_award_rank:null, phone_award_eligible:'' }
      ]
    },
    awardsBattle: { report_date:'2026-08-17' }
  };
  const result = feature.personalAwardRows(snapshot);
  assert.equal(result.aligned, true);
  assert.equal(result.reportDate, '2026-08-17');
  assert.equal(result.rows.length, 3);
  assert.deepEqual(result.rows[0], { name:'王＊明', store:'台北三創', role:'業代', amount:8200, projected:9600, rank:2, eligible:'Y' });
  assert.equal(result.rows[1].amount, 0, 'formal zero award must stay visible as zero');
  assert.equal(result.rows[2].amount, null, 'missing award must stay unsynced, not be invented as zero');
  assert.equal(feature.numberOrNull('   '), null, 'blank formal values must not become zero');

  const mismatched = feature.personalAwardRows({ ...snapshot, awardsBattle:{ report_date:'2026-08-16' } });
  assert.equal(mismatched.aligned, false);
  assert.deepEqual(mismatched.rows, []);
  assert.match(mismatched.note, /台獎日期與 KPI 日期不一致/);
});

test('feature supplies all-store and store filters with award descending as default', () => {
  assert.match(featureSource, /let storeFilter = 'all'/);
  assert.match(featureSource, /let sortMode = 'amount-desc'/);
  assert.match(featureSource, /全部店點/);
  assert.match(featureSource, /台獎高 → 低/);
  assert.match(featureSource, /台獎低 → 高/);
  assert.match(featureSource, /\['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','台北三創','六張犁'\]/);
  assert.doesNotMatch(featureSource, /available\.has/);
  assert.match(featureSource, /storeFilter === 'all' \|\| row\.store === storeFilter/);
  assert.match(featureSource, /return compareNullableAmount\(a,b,'desc'\)/);
  assert.match(featureSource, /if \(av == null\) return 1/);
  assert.match(featureSource, /if \(bv == null\) return -1/);
});

test('personal award extension is read-only and loaded without changing core app runtime', () => {
  assert.match(contractSource, /award-personal\.css\?v=1/);
  assert.match(contractSource, /award-personal\.js\?v=1/);
  assert.match(featureSource, /action:'private_access'/);
  assert.doesNotMatch(featureSource, /action:'(?:write|pwrite|ptwrite|hwrite|half_media_upload)'/);
  assert.doesNotMatch(featureSource, /localStorage\.setItem/);
  assert.match(featureSource, /App 只做篩選與排序，不重算台獎/);
  assert.match(featureSource, /推估 \$\{escapeHtml\(money\(row\.projected\)\)\}/);
  assert.match(featureSource, /台獎排名 \$\{row\.rank==null\?'尚未同步'/);
  assert.doesNotMatch(featureSource, /leaderboardRanks/);
  assert.match(featureSource, /award-person-status pending/);
});
