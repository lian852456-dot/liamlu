'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const patrol = fs.readFileSync(path.join(__dirname, '..', 'patrol.html'), 'utf8');

function functionBody(name, nextName) {
  const start = patrol.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = nextName ? patrol.indexOf(`function ${nextName}`, start + 1) : patrol.length;
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return patrol.slice(start, end);
}

test('paste and JSON import keep canonical ptsummary as the dashboard source', () => {
  const parse = functionBody('parseData', 'rebuildFromRaw');
  const imported = functionBody('importData', 'itemStatus');
  assert.doesNotMatch(parse, /patrolSummaryState\s*=\s*['"]local['"]/);
  assert.doesNotMatch(imported, /patrolSummaryState\s*=\s*['"]local['"]/);
  assert.match(parse, /mergePatrolCandidates\(newDetails\)/);
  assert.match(imported, /mergePatrolCandidates\(data\)/);
  assert.match(patrol, /正式摘要仍以雲端 ptsummary 為準/);
});

test('client candidate identity normalizes datetime, store alias and item before dedupe', () => {
  const key = functionBody('patrolCandidateKey', 'mergePatrolCandidates');
  const merge = functionBody('mergePatrolCandidates', 'showPatrolPastePreview');
  assert.match(key, /normalizePatrolCandidateTime/);
  assert.match(key, /canonicalPatrolCandidateStore/);
  assert.match(key, /Number\(row&&row\.item\)/);
  assert.match(merge, /const index=new Map\(\)/);
  assert.match(merge, /duplicates\+\+/);
  assert.match(merge, /rawDetails=merged/);
});

test('successful ptwrite reloads ptsummary and refresh failure retains last-good summary', () => {
  const write = functionBody('cloudWrite', 'setCloudStatus');
  const load = functionBody('cloudLoad', 'cloudWrite');
  assert.match(write, /cloudLoad\(\{afterWrite:true,writeMessage,renderErr\}\)/);
  assert.match(load, /patrolSummaryState=patrolSummary\?'stale':'error'/);
  assert.match(load, /保留上次成功正式摘要/);
  assert.doesNotMatch(write, /patrolSummaryState\s*=\s*['"]local['"]/);
});

test('server GAS and worksheet semantics are outside this frontend patch', () => {
  assert.match(patrol, /cloudCallJsonp\('ptwrite'/);
  assert.doesNotMatch(patrol, /recordsByMonth\[[^\]]+\]\s*=/);
});
