'use strict';

const path = require('node:path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function scoreMonths(appRoot, generation = 1) {
  const fixture = require(path.join(appRoot, 'tests/helpers/department-scores-synthetic.cjs'));
  const months = Array.from({ length: 6 }, (_, index) => fixture.month({ month: index + 1 }));
  if (generation > 1) {
    const row = months[5].records[0];
    row.score = 98;
    row.deduction = 2;
    row.source.score.value = row.source.score.raw = 98;
    row.source.deduction.value = row.source.deduction.raw = 2;
  }
  return months;
}

function goldMonths(appRoot, version = 1) {
  const Gold = require(path.join(appRoot, 'department-gold-monthly-core.js'));
  const regions = ['北一二A', '北一二B', '北一二C', '北一二D'];
  const months = [];
  for (let month = 7; month <= 9; month += 1) {
    const monthKey = `2026-${String(month).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    const records = [];
    regions.forEach((region, regionIndex) => {
      const regionLetter = String.fromCharCode(65 + regionIndex);
      for (let person = 1; person <= 40; person += 1) {
        const storeNumber = Math.floor((person - 1) / 10) + 1;
        let medal = 10 + ((person + month + regionIndex) % 8);
        if (version > 1 && month === 9 && region === '北一二B' && person === 1) medal += 1;
        records.push({
          employeeId: `G${regionLetter}${String(person).padStart(3, '0')}`,
          employeeName: `合成人員${regionLetter}${String(person).padStart(2, '0')}`,
          region,
          storeCode: `${regionLetter}S${String(storeNumber).padStart(2, '0')}`,
          store: `合成店${regionLetter}${storeNumber}`,
          role: '合成職稱',
          medal,
          sourceRow: 4 + person,
          sourceFields: []
        });
      }
    });
    const sourceHash = String(version).repeat(64);
    const end = `${monthKey}-${String(lastDay).padStart(2, '0')}`;
    months.push(Gold.validateMonth({
      schema: Gold.SCHEMA,
      monthKey,
      sheetName: `合成金牌${month}月`,
      sourceName: `gold-synthetic-v${version}.xlsx`,
      sourceHash,
      dateRange: { start: `${monthKey}-01`, end, cutoff: end },
      settlementStatus: 'provisional',
      finalConfirmed: false,
      templateId: 'staff-mobilization-v1',
      mapping: {},
      warnings: [],
      records,
      validation: { sourceTotal: records.reduce((total, row) => total + row.medal, 0) }
    }));
  }
  return months;
}

function versionedSnapshot(appRoot, versions = { scores: 1, gold: 1 }) {
  const scores = scoreMonths(appRoot, versions.scores);
  const gold = goldMonths(appRoot, versions.gold);
  return {
    scores: {
      status: 'ok',
      contract: 'north12-store-scores-v2',
      available: true,
      generation: versions.scores,
      readVersion: `scores-v${versions.scores}`,
      months: scores.map((month) => ({
        month,
        active: {
          monthKey: month.monthKey,
          revision: `score-v${versions.scores}-${month.monthKey}`,
          contentHash: `score-${versions.scores}-${month.monthKey}`,
          sourceHash: '1'.repeat(64),
          sourceName: `scores-synthetic-v${versions.scores}.xlsx`,
          publishedAt: `2026-10-13T00:00:0${versions.scores}Z`,
          restoredFrom: ''
        },
        history: []
      }))
    },
    gold: {
      status: 'ok',
      available: true,
      gold: { type: 'north12-monthly-v2', months: clone(gold) },
      monthly: { revision: `gold-v${versions.gold}`, history: {} },
      readVersion: `gold-v${versions.gold}`,
      sourceName: `gold-synthetic-v${versions.gold}.xlsx`,
      publishedAt: `2026-10-13T00:00:0${versions.gold}Z`
    }
  };
}

module.exports = { scoreMonths, goldMonths, versionedSnapshot };
