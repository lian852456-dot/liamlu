import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createScopedGoldReader} from '../scoped-read-connector.mjs';
import {createStaffOwnerBinding, CITY_OWNER_DEADLINE} from '../../city-interactions-release-20261110/runtime/employee/staff-owner-binding.mjs';
const context = {leaseToken: 'SYNTHETIC_ONLY', worldId: 'current-guests'};
function setup() {
  let active = true, afterRead = () => {};
  const proof = () => ({source: 'B_LOCKED_SESSION', active, accountKind: 'employee', audience: 'north12b-city-formal-login',
    expiresAt: Date.now() + 10000, employeeId: 'QAEMP01', uid: 'qa-original-uid', worldId: 'current-guests', sessionEpoch: 'qa-epoch'});
  const response = {status: 'ok', schema: 'city-gold-source/v1', formalWritesEnabled: false,
    source: {verified: true, serverDerived: true, employeeId: 'QAEMP01', period: '2026-11', cumulative: 20,
      sourceVersion: 'qa-uuid-version', hash: 'a'.repeat(64), receipt: 'qa-registry:qa-version:qa-hash', asOf: '2026-11-10T00:00:00Z'},
    balance: {sourceNet: 20, spent: 5, refunds: 0, available: 15, status: 'active', grossAcquired: null, grossHistoryVerified: false},
    sourceCutoff: '2026-11-09', readVersion: 'qa-source-plus-ledger-version'};
  const reader = createScopedGoldReader({validateOwner: async c => {assert.equal(c, context); return proof();},
    readScoped: async (c, input) => {assert.equal(c, context); assert.deepEqual(input, {period: '2026-11'}); afterRead(); return structuredClone(response);}});
  return {reader, response, revokeDuringRead() {afterRead = () => {active = false;};}};
}
test('existing scoped contract preserves net/available, same refresh and no silent promotion to earned', async () => {
  const f = setup(); const a = await f.reader.read(context, {period: '2026-11'});
  assert.equal(a.sourceNet, 20); assert.equal(a.available, 15); assert.equal(a.grossAcquired, null);
  assert.deepEqual(await f.reader.read(context, {period: '2026-11'}), a);
  assert.equal(a.exchangeEnabled, false);
  await assert.rejects(f.reader.exchangeSnapshot(context, {period: '2026-11'}), /NET_SOURCE_IS_NOT_EXCHANGE_ENTITLEMENT/);
  await assert.rejects(f.reader.read(context, {period: '2026-11', employeeId: 'QAOTHER'}), /READ_PERIOD_ONLY/);
});
test('scoped connector rejects wrong owner, altered balance and revoked proof after source IO', async () => {
  const f = setup(); f.response.source.employeeId = 'QAOTHER';
  await assert.rejects(f.reader.read(context, {period: '2026-11'}), /SCOPED_SOURCE_INVALID/);
  f.response.source.employeeId = 'QAEMP01'; f.response.balance.available = 20;
  await assert.rejects(f.reader.read(context, {period: '2026-11'}), /SCOPED_BALANCE_INVALID/);
  f.response.balance.available = 15; f.revokeDuringRead();
  await assert.rejects(f.reader.read(context, {period: '2026-11'}), /FORMAL_OWNER_REQUIRED/);
});
test('saved actual owner module denies current-date access before contacting authority', async () => {
  const db = new DatabaseSync(':memory:'); let remoteCalls = 0;
  try {
    const owner = createStaffOwnerBinding({db, worldId: 'current-guests', now: () => Date.parse('2026-11-10T00:00:00Z'),
      authenticateCity: () => {throw Error('must not reach city auth');}, redeemHandoff: async () => {remoteCalls++;},
      validateLease: async () => {remoteCalls++;}});
    assert.equal(new Date(CITY_OWNER_DEADLINE).toISOString(), '2026-10-31T15:59:00.000Z');
    await assert.rejects(owner.principal({}), /OWNER_PREVIEW_EXPIRED/);
    assert.equal(remoteCalls, 0);
  } finally {db.close();}
});
