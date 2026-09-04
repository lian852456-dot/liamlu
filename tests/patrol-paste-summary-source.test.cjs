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
  const parse = functionBody('parseData', 'confirmPatrolCloudWrite');
  const confirm = functionBody('confirmPatrolCloudWrite', 'rebuildFromRaw');
  const imported = functionBody('importData', 'itemStatus');
  assert.doesNotMatch(parse, /patrolSummaryState\s*=\s*['"]local['"]/);
  assert.doesNotMatch(imported, /patrolSummaryState\s*=\s*['"]local['"]/);
  assert.match(parse, /preparePatrolCandidates\(newDetails\)/);
  assert.doesNotMatch(parse, /cloudWrite\(/);
  assert.match(confirm, /cloudWrite\(pending\.candidate\.writeRows\)/);
  assert.match(confirm, /commitPatrolCandidates\(pending\.candidate\)/);
  assert.match(imported, /mergePatrolCandidates\(data\)/);
  assert.match(patrol, /正式摘要仍以雲端 ptsummary 為準/);
});

test('client candidate identity normalizes datetime, store alias and item before dedupe', () => {
  const key = functionBody('patrolCandidateKey', 'preparePatrolCandidates');
  const prepare = functionBody('preparePatrolCandidates', 'commitPatrolCandidates');
  const commit = functionBody('commitPatrolCandidates', 'mergePatrolCandidates');
  assert.match(key, /normalizePatrolCandidateTime/);
  assert.match(key, /canonicalPatrolCandidateStore/);
  assert.match(key, /Number\(row&&row\.item\)/);
  assert.match(prepare, /const index=new Map\(\)/);
  assert.match(prepare, /duplicates\+\+/);
  assert.doesNotMatch(prepare, /rawDetails=/);
  assert.match(commit, /rawDetails=/);
});

test('successful ptwrite requires keyed ptdetail readback before ptsummary refresh', () => {
  const write = functionBody('cloudWrite', 'setCloudStatus');
  const load = functionBody('cloudLoad', 'cloudWrite');
  const confirm = functionBody('confirmPatrolCloudWrite', 'rebuildFromRaw');
  const readback = functionBody('readbackPatrolWriteRows', 'cloudWrite');
  const finalize = functionBody('finalizeLocalPatrolWrite', 'continueLocalPatrolReadback');
  assert.match(write, /waitForPatrolReadback\(details,written\)/);
  assert.match(readback, /formalPatrolRowsForPreflight\(details\)/);
  assert.match(patrol, /async function formalPatrolRowsForGroup[\s\S]*cloudCall\('ptdetail'/);
  assert.match(readback, /missingKeys/);
  assert.match(confirm, /finalizeLocalPatrolWrite\(pending,receipt,renderErr\)/);
  assert.match(finalize, /refreshPatrolAndMileage\(writeMessage,renderErr\)/);
  assert.match(confirm, /continueLocalPatrolReadback/);
  assert.match(load, /patrolSummaryState=patrolSummary\?'stale':'error'/);
  assert.match(load, /保留上次成功正式摘要/);
  assert.doesNotMatch(write, /patrolSummaryState\s*=\s*['"]local['"]/);
});

test('server GAS and worksheet semantics are outside this frontend patch', () => {
  assert.match(patrol, /cloudCallJsonp\('ptwrite'/);
  assert.doesNotMatch(patrol, /recordsByMonth\[[^\]]+\]\s*=/);
});
