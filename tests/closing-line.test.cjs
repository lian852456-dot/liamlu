'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildClosingMessage, loadRowsWithRecovery, runClosing } = require('../notifications/closing-line.cjs');

const date = '2026-10-03';
const focus = (opOnline,opAccum,opTarget,clicked,tagged) => JSON.stringify({
  op_online:opOnline, op_accum:opAccum, op_target:opTarget,
  mycharge_clicked:clicked, mycharge_tagged:tagged,
  mycharge_pct:tagged > 0 ? Number((clicked/tagged*100).toFixed(1)) : null
});
const authoritativeSummary = (overrides={}) => ({
  date, segment:21, totalStores:9, completedStores:0, semantics:'formal-index-summary-v1', ...overrides
});
const rows = [
  {date,seg:21,store:'酒泉',aq999:3,aq1399:1,haosu:1,rt999:2,rt1399:1,insurance_num:1,insurance_den:2,management_focus_json:focus(1,4,8,3,5)},
  {date,seg:21,store:'永吉',aq999:0,aq1399:0,haosu:2,rt999:1,rt1399:0,insurance_num:0,insurance_den:1,management_focus_json:focus(0,2,7,2,4)},
  {date,seg:21,store:'台北三創',aq999:1,aq1399:1,haosu:1,rt999:3,rt1399:2,insurance_num:2,insurance_den:3,management_focus_json:focus(2,5,10,4,5)},
];

test('LINE 正常戰報只保留核心五項、保險與管理重點', () => {
  const message=buildClosingMessage({date,rows});
  for (const title of ['⭐ A999','👑 A1399','⚡ 好速','📶 R999','🌐 R1399','☂️ 保險搭售 分子 / 分母','🎯 管理重點','OP 上線 / 累積 / 目標','⚡ MyCharge EBM系統貼標點選']) {
    assert.ok(message.includes(title), title);
  }
  assert.doesNotMatch(message,/五項資料完整|今晚注意|掛蛋|保險搭售率 <50%|設備案|台獎|KPI達成率|公司排名/);
});

test('A1399、保險分子分母與管理重點取正式回報值', () => {
  const message=buildClosingMessage({date,rows});
  assert.match(message,/👑 A1399[\s\S]*酒泉｜1\n永吉｜0\n復興南｜未回報/);
  assert.match(message,/☂️ 保險搭售 分子 \/ 分母[\s\S]*酒泉｜1\/2/);
  assert.match(message,/OP 上線 \/ 累積 \/ 目標[\s\S]*酒泉｜1\/4\/8/);
  assert.match(message,/MyCharge EBM系統貼標點選[\s\S]*酒泉｜3\/5=60%/);
});

test('未回報店與已回報缺值分開呈現', () => {
  const message=buildClosingMessage({date,rows:[{date,seg:21,store:'酒泉',aq999:null,management_focus_json:'{}'}]});
  assert.match(message,/⭐ A999[\s\S]*酒泉｜資料未取得[\s\S]*永吉｜未回報/);
  assert.match(message,/OP 上線 \/ 累積 \/ 目標[\s\S]*酒泉｜資料未取得\/資料未取得\/資料未取得/);
});

test('正式 GAS status/data 可直接讀取', async () => {
  const result=await loadRowsWithRecovery({
    date,attempts:1,
    readPrimary:async()=>({status:'ok',data:Object.fromEntries(rows.map(row=>[row.store,row]))}),
    readFallback:async()=>{throw new Error('不應呼叫');}
  });
  assert.equal(result.source,'primary');
  assert.equal(result.rows.length,3);
});

test('同日 seg21 的權威零提交 summary 保留為空資料，不切到備援', async () => {
  let fallbackCalls = 0;
  const result = await loadRowsWithRecovery({
    date, attempts:1,
    readPrimary:async()=>({status:'ok', data:{}, rows:[], summary:authoritativeSummary()}),
    readFallback:async()=>{ fallbackCalls += 1; throw new Error('不應呼叫'); }
  });
  assert.equal(result.source,'primary');
  assert.deepEqual(result.rows,[]);
  assert.equal(fallbackCalls,0);
  assert.equal(result.diagnostics[0].code,'AUTHORITATIVE_EMPTY');
});

test('權威零提交拒絕 null/字串 identity、錯誤 semantics 與非空 rows 矛盾', async () => {
  const invalidSummaries = [
    authoritativeSummary({segment:null}),
    authoritativeSummary({segment:'21'}),
    authoritativeSummary({totalStores:null}),
    authoritativeSummary({completedStores:null}),
    authoritativeSummary({semantics:'formal-index-summary-v3'}),
  ];
  for (const summary of invalidSummaries) {
    await assert.rejects(loadRowsWithRecovery({
      date, attempts:1,
      readPrimary:async()=>({status:'ok',data:{},rows:[],summary}),
    }), error => error.name === 'ClosingSourceUnavailableError');
  }
  await assert.rejects(loadRowsWithRecovery({
    date, attempts:1,
    readPrimary:async()=>({status:'ok',data:{},rows:[{date,seg:21,store:'酒泉'}],summary:authoritativeSummary()}),
  }), error => error.name === 'ClosingSourceUnavailableError');
});

test('無同日 identity 的空 payload 仍 fail closed', async () => {
  await assert.rejects(loadRowsWithRecovery({
    date, attempts:1,
    readPrimary:async()=>({status:'ok', data:{}}),
    readFallback:async()=>{throw new Error('fallback');}
  }), error => {
    assert.equal(error.name,'ClosingSourceUnavailableError');
    assert.ok(error.attempts.some(item => item.code === 'EMPTY_RESULT'));
    return true;
  });
});

test('主要來源失敗可切換備援 Sheets values', async () => {
  const headers=['date','store','seg','aq999','aq1399','haosu','rt999','rt1399','insurance_num','insurance_den','management_focus_json'];
  const result=await loadRowsWithRecovery({
    date,attempts:1,
    readPrimary:async()=>{throw new Error('down');},
    readFallback:async()=>({values:[headers,[date,'台北酒泉',21,3,1,1,2,1,1,2,focus(1,4,8,3,5)]]})
  });
  assert.equal(result.source,'fallback');
  assert.equal(result.rows[0].store,'酒泉');
});

test('兩來源失敗只送一則來源錯誤，不偽造九店資料', async () => {
  let sent='';
  const result=await runClosing({
    date,attempts:1,sleep:async()=>{},
    readPrimary:async()=>{throw new Error('primary');},
    readFallback:async()=>{throw new Error('fallback');},
    send:async message=>{sent=message;},
    logger:{error(){}}
  });
  assert.equal(result.ok,false);
  assert.match(sent,/資料來源讀取失敗/);
  assert.doesNotMatch(sent,/酒泉｜未回報/);
});

test('重複店點依 savedAt 取較新一筆', () => {
  const message=buildClosingMessage({date,rows:[
    {date,seg:21,store:'三創',savedAt:'下午 8:10:00',aq999:1},
    {date,seg:21,store:'台北三創',savedAt:'晚上9:55:48',aq999:3}
  ]});
  assert.match(message,/⭐ A999[\s\S]*三創｜3/);
});

test('sender 失敗不再補送第二則', async () => {
  let calls=0;
  await assert.rejects(runClosing({
    date,attempts:1,readPrimary:async()=>rows,
    send:async()=>{calls++;throw new Error('LINE timeout');},
    logger:{error(){}}
  }),/LINE timeout/);
  assert.equal(calls,1);
});
