const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const source = html.slice(html.indexOf('function personalFailCharCount('), html.indexOf('function personalFailFormExtra('));
const ctx = vm.createContext({});
vm.runInContext(source, ctx);
const full = () => ({fail_reason:'合成原因', consult_store:'合成店', consult_person:'合成對象', consult_method:'益'.repeat(50), improve_plan:'改'.repeat(50)});

test('49/50 code points, Unicode whitespace and punctuation, emoji and non-Chinese remain counted', () => {
  assert.equal(ctx.personalFailCharCount('字'.repeat(49)),49);
  assert.equal(ctx.personalFailCharCount('字'.repeat(50)),50);
  assert.equal(ctx.personalFailCharCount(' \t\n\r\u0085\u00a0\u3000，。！？、；：「」…—_-/\\()[]{}!?,.:;\"\''),0);
  assert.equal(ctx.personalFailCharCount('😀'.repeat(49)),49);
  assert.equal(ctx.personalFailCharCount('😀'.repeat(50)),50);
  assert.equal(ctx.personalFailCharCount('𠀀Aé1😀'),5);
  assert.equal(ctx.personalFailCharCount('e\u0301👩‍💻'),5); // Unicode code points, not grapheme clusters.
  assert.equal(ctx.personalFailCharCount('A， '.repeat(50)),50);
});

test('both 50-character fields are independent and all five existing fields are required for text condition', () => {
  assert.equal(ctx.personalFailTextCheck('2026-10-21',full()).textComplete,true);
  for (const key of ['consult_method','improve_plan']) {
    assert.equal(ctx.personalFailTextCheck('2026-10-21',{...full(),[key]:'字'.repeat(49)}).textComplete,false);
  }
  for (const key of Object.keys(full())) {
    const check=ctx.personalFailTextCheck('2026-10-21',{...full(),[key]:' \t '});
    assert.equal(check.textComplete,false);
    assert.equal(check.missing.length,1);
  }
  assert.equal(ctx.personalFailTextCheck('2026-10-21',{...full(),customers:'',sold_items:''}).textComplete,true);
});

test('applies by report date from Taiwan 2026-10-21, with no retrospective threshold or whole-day exemption claim', () => {
  for (const date of ['2026-10-19','2026-10-20']) {
    const check=ctx.personalFailTextCheck(date,{});
    assert.equal(check.applies,false);
    assert.match(ctx.personalFailQualificationMessage(date,16,check),/不套用.*不追改歷史/);
  }
  for (const date of ['2026-10-21','2026-10-22']) {
    const check=ctx.personalFailTextCheck(date,full());
    assert.equal(check.applies,true);
    for (const seg of [16,21]) {
      assert.match(ctx.personalFailQualificationMessage(date,seg,check),/本段達到.*另一時段原始個人回報及督導覆核.*尚未確認每日/);
    }
  }
});
