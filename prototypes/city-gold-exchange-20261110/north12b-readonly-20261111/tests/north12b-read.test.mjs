import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_GOLD_SCHEMA,
  MAPPING_SCHEMA,
  readOwnNorth12BGold,
  validateMappingRegistry
} from '../gold-read-contract.mjs';

const NOW = Date.parse('2026-11-11T00:30:00+08:00');

function identity(overrides = {}) {
  return {
    source: 'B_LOCKED_SESSION', active: true, accountKind: 'employee', employeeId: 'EMP001',
    store: '三創', sessionEpoch: 'epoch-1', expiresAt: NOW + 60_000,
    uid: 'city-uid-001', worldId: 'current-guests', audience: 'north12b-city-formal-login', ...overrides
  };
}

function mapping(overrides = {}) {
  return {
    schema: MAPPING_SCHEMA, revision: 3,
    entries: [{ employeeId: 'EMP001', personKey: 'person-001', store: '三創', alias: '小榮',
      validFrom: '2026-11-01', validUntil: '2026-11-30', evidenceId: 'map-evidence-3', status: 'confirmed', ...overrides }]
  };
}

function ledger(rows = [], overrides = {}) {
  return {
    schema: DAILY_GOLD_SCHEMA, region: '北一二B', settlements: [
      { date: '2026-11-09', status: 'confirmed', source: { workbook: 'north12b-1109', revision: 6 }, recordedAt: '2026-11-10T01:00:00+08:00', rows: [
        { personKey: 'person-001', store: '三創', alias: '小榮', balance: 20, reason: '11/9確認', exemption: '' },
        { personKey: 'person-other', store: '酒泉', alias: '同名', balance: 99, reason: '不得外洩', exemption: '' }
      ] },
      { date: '2026-11-10', status: 'confirmed', source: 'north12b-1110', recordedAt: '2026-11-11T01:00:00+08:00', rows },
    ], ...overrides
  };
}

const ownLatest = { personKey: 'person-001', store: '三創', alias: '小榮', balance: -3, reason: '已確認扣牌後餘額', exemption: '核准免扣欄位' };

test('returns only latest own current-month balance with provenance and disabled exchange', () => {
  const result = readOwnNorth12BGold({ identity: identity(), mapping: mapping(), ledger: ledger([ownLatest]), now: NOW });
  assert.equal(result.balance, -3);
  assert.equal(result.sourceDate, '2026-11-10');
  assert.match(result.sourceHash, /^[a-f0-9]{64}$/);
  assert.equal(result.reason, ownLatest.reason);
  assert.equal(result.exchangeEnabled, false);
  assert.equal(result.readOnly, true);
  assert.ok(Object.isFrozen(result));
  assert.throws(() => { result.balance = 50; }, TypeError);
});

test('deep-freezes validated mapping and does not mutate input', () => {
  const input = mapping();
  const normalized = validateMappingRegistry(input);
  assert.ok(Object.isFrozen(normalized));
  assert.ok(Object.isFrozen(normalized.entries));
  assert.ok(Object.isFrozen(normalized.entries[0]));
  assert.equal(input.entries[0].status, 'confirmed');
});

test('rejects identity that is missing, expired, or not an active employee B-session', () => {
  const args = { mapping: mapping(), ledger: ledger([ownLatest]), now: NOW };
  assert.throws(() => readOwnNorth12BGold({ ...args, identity: identity({ active: false }) }), /IDENTITY_REQUIRED/);
  assert.throws(() => readOwnNorth12BGold({ ...args, identity: identity({ expiresAt: NOW }) }), /IDENTITY_EXPIRED/);
  assert.throws(() => readOwnNorth12BGold({ ...args, identity: identity({ accountKind: 'guest' }) }), /IDENTITY_REQUIRED/);
});

test('rejects caller-selected other person or unknown body fields', () => {
  const args = { identity: identity(), mapping: mapping(), ledger: ledger([ownLatest]), now: NOW };
  assert.throws(() => readOwnNorth12BGold({ ...args, employeeId: 'EMP999' }), /REQUEST_FIELDS_INVALID/);
  assert.throws(() => readOwnNorth12BGold({ ...args, personKey: 'person-other' }), /REQUEST_FIELDS_INVALID/);
});

test('rejects pending, missing, expired, and store-mismatched mapping', () => {
  const args = { identity: identity(), ledger: ledger([ownLatest]), now: NOW };
  assert.throws(() => readOwnNorth12BGold({ ...args, mapping: mapping({ status: 'pending' }) }), /MAPPING_NOT_CONFIRMED/);
  assert.throws(() => readOwnNorth12BGold({ ...args, mapping: { ...mapping(), entries: [] } }), /MAPPING_NOT_FOUND/);
  assert.throws(() => readOwnNorth12BGold({ ...args, mapping: mapping({ validUntil: '2026-11-10' }) }), /MAPPING_EXPIRED/);
  assert.throws(() => readOwnNorth12BGold({ ...args, mapping: mapping({ store: '酒泉' }) }), /MAPPING_STORE_MISMATCH/);
});

test('rejects mapping overlap, blank evidence, and non-canonical store aliases', () => {
  const overlapping = mapping();
  overlapping.entries.push({ ...overlapping.entries[0], employeeId: 'EMP001', personKey: 'person-002', validFrom: '2026-11-15', evidenceId: 'map-evidence-4' });
  assert.throws(() => validateMappingRegistry(overlapping), /MAPPING_VALIDITY_OVERLAP/);
  assert.throws(() => validateMappingRegistry(mapping({ evidenceId: '' })), /MAPPING_EVIDENCE_REQUIRED/);
  assert.throws(() => validateMappingRegistry(mapping({ store: '台北三創' })), /STORE_NOT_CANONICAL/);
});

test('rejects ledger rows whose canonical store or alias does not match mapping', () => {
  const args = { identity: identity(), mapping: mapping(), now: NOW };
  assert.throws(() => readOwnNorth12BGold({ ...args, ledger: ledger([{ ...ownLatest, store: '台北三創' }]) }), /STORE_NOT_CANONICAL/);
  assert.throws(() => readOwnNorth12BGold({ ...args, ledger: ledger([{ ...ownLatest, alias: '另一位' }]) }), /ROW_MAPPING_MISMATCH/);
});

test('fails closed for missing current-month own row, unconfirmed settlement, and future data', () => {
  const args = { identity: identity(), mapping: mapping(), now: NOW };
  const noOwn = ledger([{ ...ownLatest, personKey: 'person-other' }]);
  noOwn.settlements = [noOwn.settlements[1]];
  assert.throws(() => readOwnNorth12BGold({ ...args, ledger: noOwn }), /LATEST_PERSON_MISSING/);
  assert.throws(() => readOwnNorth12BGold({ ...args, ledger: ledger([ownLatest], { settlements: [{ date: '2026-11-10', status: 'pending', source: 'x', recordedAt: '2026-11-11T01:00:00+08:00', rows: [ownLatest] }] }) }), /SETTLEMENT_NOT_CONFIRMED/);
  assert.throws(() => readOwnNorth12BGold({ ...args, ledger: ledger([ownLatest], { settlements: [{ date: '2026-11-12', status: 'confirmed', source: 'x', recordedAt: '2026-11-12T01:00:00+08:00', rows: [ownLatest] }] }) }), /FUTURE_SETTLEMENT/);
});

test('fails closed for duplicate latest own records and invalid row balances', () => {
  const duplicate = [ownLatest];
  const data = ledger(duplicate);
  data.settlements.push({ date: '2026-11-10', status: 'confirmed', source: 'different', recordedAt: '2026-11-11T01:00:00+08:00', rows: [ownLatest] });
  assert.throws(() => readOwnNorth12BGold({ identity: identity(), mapping: mapping(), ledger: data, now: NOW }), /LATEST_SETTLEMENT_NOT_UNIQUE/);
  assert.throws(() => readOwnNorth12BGold({ identity: identity(), mapping: mapping(), ledger: ledger([{ ...ownLatest, balance: 1.5 }]), now: NOW }), /BALANCE_INVALID/);
});

test('source hash covers the selected settlement, so same-label balance changes are visible', () => {
  const first = readOwnNorth12BGold({ identity: identity(), mapping: mapping(), ledger: ledger([ownLatest]), now: NOW });
  const changed = readOwnNorth12BGold({ identity: identity(), mapping: mapping(), ledger: ledger([{ ...ownLatest, balance: -2 }]), now: NOW });
  assert.notEqual(first.sourceHash, changed.sourceHash);
});

test('latest confirmed settlement missing the person fails without falling back to an older day', () => {
  const latestWithoutOwn = ledger([{ personKey: 'person-other', store: '酒泉', alias: '同名', balance: 99, reason: '其他人', exemption: '' }]);
  assert.throws(() => readOwnNorth12BGold({ identity: identity(), mapping: mapping(), ledger: latestWithoutOwn, now: NOW }), /LATEST_PERSON_MISSING/);
});

test('historical person store and alias changes do not block a valid current-day mapping', () => {
  const historical = ledger([ownLatest]);
  historical.settlements[0].rows[0] = { personKey: 'person-old', store: '酒泉', alias: '舊暱稱', balance: 20, reason: '歷史已確認', exemption: '' };
  const registry = {
    schema: MAPPING_SCHEMA, revision: 4,
    entries: [
      { employeeId: 'EMP001', personKey: 'person-old', store: '酒泉', alias: '舊暱稱', validFrom: '2026-10-01', validUntil: '2026-10-31', evidenceId: 'map-old', status: 'confirmed' },
      { employeeId: 'EMP001', personKey: 'person-001', store: '三創', alias: '小榮', validFrom: '2026-11-01', validUntil: '2026-11-30', evidenceId: 'map-new', status: 'confirmed' }
    ]
  };
  const result = readOwnNorth12BGold({ identity: identity(), mapping: registry, ledger: historical, now: NOW });
  assert.equal(result.sourceDate, '2026-11-10');
  assert.equal(result.balance, -3);
  assert.equal(result.store, '三創');
  assert.equal(result.alias, '小榮');
});
